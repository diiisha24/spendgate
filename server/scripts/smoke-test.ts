/**
 * Phase 2 end-to-end smoke test against a running API.
 *
 *   npm run test:smoke                     (API at http://127.0.0.1:4000)
 *   API_URL=http://host:port npm run test:smoke
 *
 * WARNING: creates real records. Run against a development database only;
 * use `npm run db:reset` first for deterministic numbers.
 */

const API = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '') + '/api';
const ACTOR = 'Smoke Tester';

interface Money {
  minor: string;
  major: string;
}
interface Department {
  id: string;
  name: string;
  allocated: Money;
  committed: Money;
  available: Money;
  pendingCount: number;
}
interface PurchaseRequest {
  id: string;
  reference: string;
  status: string;
  amount: Money;
  title: string;
  approval: { id: string; approverRole: string; status: string; approverName: string | null; decidedAt: string | null; comments: string | null } | null;
}

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`, extra ?? '');
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: (text ? JSON.parse(text) : null) as T };
}

async function department(name: string): Promise<Department> {
  const { data } = await call<{ items: Department[] }>('GET', '/departments');
  const found = data.items.find((item) => item.name === name);
  if (!found) throw new Error(`Department ${name} not found - did you seed the database?`);
  return found;
}

const minor = (money: Money): bigint => BigInt(money.minor);
const rupees = (value: number): bigint => BigInt(value) * 100n;
const unique = Date.now().toString(36);

async function main(): Promise<void> {
  console.log(`SpendGate smoke test -> ${API}\n`);

  const engBefore = await department('Engineering');
  const mktBefore = await department('Marketing');
  const dashBefore = (await call<{ pendingApprovals: number; totals: { committed: Money } }>('GET', '/dashboard/summary')).data;

  // 1. Create a valid ₹20,000 request and submit it.
  console.log('1. Create a valid ₹20,000 purchase request');
  const created = await call<PurchaseRequest>('POST', '/purchase-requests', {
    title: `Developer laptops docking stations ${unique}`,
    description: 'Docking stations for the platform team',
    amount: '20000',
    quantity: 4,
    category: 'HARDWARE',
    requesterName: ACTOR,
    departmentId: engBefore.id,
    submit: true,
  });
  check('returns 201', created.status === 201, created.data);
  check('status is PENDING_APPROVAL', created.data.status === 'PENDING_APPROVAL');
  check('amount stored exactly (2000000 paise)', created.data.amount.minor === '2000000');
  const req1 = created.data;

  const duplicate = await call<{ error: { code: string } }>('POST', '/purchase-requests', {
    title: req1.title, amount: '20000', quantity: 4, category: 'HARDWARE',
    requesterName: ACTOR, departmentId: engBefore.id, submit: true,
  });
  check('duplicate create rejected (409 DUPLICATE_REQUEST)', duplicate.status === 409 && duplicate.data.error.code === 'DUPLICATE_REQUEST', duplicate.data);

  const resubmit = await call<{ error: { code: string } }>('POST', `/purchase-requests/${req1.id}/submit`, { performedBy: ACTOR });
  check('re-submit rejected (409 ALREADY_SUBMITTED)', resubmit.status === 409 && resubmit.data.error.code === 'ALREADY_SUBMITTED', resubmit.data);

  // 2. Budget calculation.
  console.log('\n2. Verify automatic department budget calculation');
  const engAfterCreate = await department('Engineering');
  check('committed increased by ₹20,000', minor(engAfterCreate.committed) - minor(engBefore.committed) === rupees(20000));
  check('available decreased by ₹20,000', minor(engBefore.available) - minor(engAfterCreate.available) === rupees(20000));
  check('available = allocated - committed', minor(engAfterCreate.available) === minor(engAfterCreate.allocated) - minor(engAfterCreate.committed));

  // 3. Routing.
  console.log('\n3. Verify approval routing');
  check('₹20,000 routed to DEPARTMENT_MANAGER', req1.approval?.approverRole === 'DEPARTMENT_MANAGER', req1.approval);
  const small = await call<PurchaseRequest>('POST', '/purchase-requests', {
    title: `Team lunch supplies ${unique}`, amount: '9999.99', category: 'OFFICE_SUPPLIES',
    requesterName: ACTOR, departmentId: mktBefore.id, submit: true,
  });
  check('₹9,999.99 routed to TEAM_LEAD', small.data.approval?.approverRole === 'TEAM_LEAD', small.data);
  const boundary = await call<PurchaseRequest>('POST', '/purchase-requests', {
    title: `Boundary check ${unique}`, amount: '50000', category: 'SOFTWARE',
    requesterName: ACTOR, departmentId: mktBefore.id, submit: false,
  });
  check('draft has no approval yet', boundary.data.status === 'DRAFT' && boundary.data.approval === null);
  const boundarySubmitted = await call<PurchaseRequest>('POST', `/purchase-requests/${boundary.data.id}/submit`, { performedBy: ACTOR });
  check('₹50,000 (boundary) routed to DEPARTMENT_MANAGER', boundarySubmitted.data.approval?.approverRole === 'DEPARTMENT_MANAGER', boundarySubmitted.data);

  // 4. Edit a pending request (amount above ₹50,000 -> re-route to Finance).
  console.log('\n4. Edit a pending request');
  const edited = await call<PurchaseRequest>('PATCH', `/purchase-requests/${req1.id}`, {
    amount: '55000', title: `${req1.title} (revised)`, performedBy: ACTOR,
  });
  check('edit returns 200', edited.status === 200, edited.data);
  check('amount updated to ₹55,000', edited.data.amount.minor === '5500000');
  check('re-routed to FINANCE_MANAGER', edited.data.approval?.approverRole === 'FINANCE_MANAGER', edited.data.approval);
  const engAfterEdit = await department('Engineering');
  check('committed reflects edited amount (+₹35,000)', minor(engAfterEdit.committed) - minor(engAfterCreate.committed) === rupees(35000));

  // 5. Approve.
  console.log('\n5. Approve the request');
  const approvalId = edited.data.approval!.id;
  const approved = await call<PurchaseRequest>('POST', `/approvals/${approvalId}/approve`, { approverName: 'Finance Approver', comments: 'Within plan' });
  check('approve returns 200', approved.status === 200, approved.data);
  check('request status APPROVED', approved.data.status === 'APPROVED');
  check('approver name and timestamp recorded', approved.data.approval?.approverName === 'Finance Approver' && !!approved.data.approval?.decidedAt);
  const again = await call<{ error: { code: string } }>('POST', `/approvals/${approvalId}/approve`, { approverName: 'Finance Approver' });
  check('approving again rejected (409 APPROVAL_ALREADY_PROCESSED)', again.status === 409 && again.data.error.code === 'APPROVAL_ALREADY_PROCESSED', again.data);
  const editApproved = await call<{ error: { code: string } }>('PATCH', `/purchase-requests/${req1.id}`, { amount: '1', performedBy: ACTOR });
  check('editing an approved request rejected (409 REQUEST_LOCKED)', editApproved.status === 409 && editApproved.data.error.code === 'REQUEST_LOCKED');

  // 6. Reject a different request.
  console.log('\n6. Reject a different request with a reason');
  const mktBeforeReject = await department('Marketing');
  const noReason = await call<{ error: { code: string } }>('POST', `/approvals/${small.data.approval!.id}/reject`, { approverName: 'Team Lead Approver' });
  check('reject without reason -> 400 VALIDATION_ERROR', noReason.status === 400 && noReason.data.error.code === 'VALIDATION_ERROR', noReason.data);
  const rejected = await call<PurchaseRequest>('POST', `/approvals/${small.data.approval!.id}/reject`, {
    approverName: 'Team Lead Approver', reason: 'Please use the existing catering contract',
  });
  check('reject returns 200 and REJECTED', rejected.status === 200 && rejected.data.status === 'REJECTED', rejected.data);
  check('rejection reason stored', rejected.data.approval?.comments === 'Please use the existing catering contract');
  const mktAfterReject = await department('Marketing');
  check('rejected amount released from committed spend', minor(mktBeforeReject.committed) - minor(mktAfterReject.committed) === rupees(9999) + 99n);

  // 7. Exceed budget.
  console.log('\n7. Attempt to submit a request exceeding the available budget');
  const opsBudget = await department('Operations');
  const overAmount = (minor(opsBudget.available) / 100n + 1n).toString();
  const over = await call<{ error: { code: string; details: { shortfall: Money } } }>('POST', '/purchase-requests', {
    title: `Warehouse automation ${unique}`, amount: overAmount, category: 'HARDWARE',
    requesterName: ACTOR, departmentId: opsBudget.id, submit: true,
  });
  check('returns 422 BUDGET_EXCEEDED', over.status === 422 && over.data.error.code === 'BUDGET_EXCEEDED', over.data);
  check('shortfall reported as ₹1.00', over.data.error.details?.shortfall?.minor === '100');
  const opsAfter = await department('Operations');
  check('nothing committed after failed submit', opsAfter.committed.minor === opsBudget.committed.minor);
  const list = await call<{ total: number }>('GET', `/purchase-requests?search=${encodeURIComponent(`Warehouse automation ${unique}`)}`);
  check('failed create+submit rolled back (no orphan draft)', list.data.total === 0, list.data);

  // 8. Audit logs.
  console.log('\n8. Verify audit logs');
  const logs = await call<{ items: Array<{ action: string; performedBy: string; details: Record<string, unknown> }> }>(
    'GET', `/audit-logs?entityType=PURCHASE_REQUEST&entityId=${req1.id}`,
  );
  const actions = logs.data.items.map((log) => log.action).reverse();
  check('request 1 trail: CREATED, SUBMITTED, UPDATED, APPROVED', actions.join(',') === 'CREATED,SUBMITTED,UPDATED,APPROVED', actions);
  const updateLog = logs.data.items.find((log) => log.action === 'UPDATED');
  check('UPDATED log captures field changes and reroute', !!updateLog?.details.changes && !!updateLog?.details.rerouted, updateLog);
  const approveLog = logs.data.items.find((log) => log.action === 'APPROVED');
  check('APPROVED log performedBy approver', approveLog?.performedBy === 'Finance Approver');
  const rejectLogs = await call<{ items: Array<{ details: Record<string, unknown> }> }>('GET', `/audit-logs?entityId=${small.data.id}&action=REJECTED`);
  check('REJECTED log contains reason', rejectLogs.data.items[0]?.details.reason === 'Please use the existing catering contract');

  // 9. Dashboard.
  console.log('\n9. Verify dashboard metrics update correctly');
  const dash = (await call<{ pendingApprovals: number; totals: { allocated: Money; committed: Money; available: Money } }>('GET', '/dashboard/summary')).data;
  // Net new commitments: req1 ₹55,000 (approved) + boundary ₹50,000 (pending); small request rejected.
  check('committed spend +₹1,05,000', minor(dash.totals.committed) - minor(dashBefore.totals.committed) === rupees(105000), dash.totals);
  check('available = allocated - committed', minor(dash.totals.available) === minor(dash.totals.allocated) - minor(dash.totals.committed));
  check('pending approvals +1 (boundary request)', dash.pendingApprovals - dashBefore.pendingApprovals === 1, dash.pendingApprovals);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error('Smoke test crashed:', error);
  process.exitCode = 1;
});
