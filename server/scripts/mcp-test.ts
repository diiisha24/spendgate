/**
 * Automated MCP tool tests (Phase 3). Connects to the running MCP server with
 * the official SDK client over Streamable HTTP - the same transport Claude
 * uses - and cross-checks every effect through the REST API that powers the
 * dashboard.
 *
 *   MCP_AUTH_TOKEN=<token> npm run test:mcp
 *   (optional) MCP_URL=http://127.0.0.1:4001/mcp API_URL=http://127.0.0.1:4000
 *
 * Requires both the API and MCP servers to be running. Creates real records:
 * run against a development database only. Requests it creates for negative
 * tests are rejected afterwards so they do not hold budget.
 */
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL ?? 'http://127.0.0.1:4001/mcp';
const API = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '') + '/api';
const TOKEN = process.env.MCP_AUTH_TOKEN ?? '';

let passed = 0;
let failed = 0;
const notes: string[] = [];

function check(label: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400));
  }
}

interface ToolOutcome {
  isError: boolean;
  text: string;
  data: Record<string, any>;
}

async function rest<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await response.json()) as T;
}

async function rawMcp(url: string, headers: Record<string, string> = {}, method = 'POST'): Promise<number> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body:
      method === 'POST'
        ? JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } },
          })
        : undefined,
  });
  await response.text();
  return response.status;
}

/** fetch() cannot override the Host header, so use node:http for this check. */
function statusWithHost(host: string): Promise<number> {
  const url = new URL(MCP_URL);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          Host: host,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('error', reject);
    req.end('{}');
  });
}

const unique = Date.now().toString(36);

async function main(): Promise<void> {
  console.log(`SpendGate MCP tests -> ${MCP_URL}\n`);
  if (!TOKEN) console.log('  (MCP_AUTH_TOKEN not set - assuming server runs without auth on loopback)\n');

  /* ----------------------------- Transport & auth ---------------------------- */
  console.log('A. Transport and authentication');
  if (TOKEN) {
    check('no credentials -> 401', (await rawMcp(MCP_URL)) === 401);
    check('wrong bearer token -> 401', (await rawMcp(MCP_URL, { Authorization: 'Bearer wrong-token' })) === 401);
    check('valid bearer token -> 200', (await rawMcp(MCP_URL, { Authorization: `Bearer ${TOKEN}` })) === 200);
    check('secret-path URL with valid token -> 200', (await rawMcp(`${MCP_URL}/${TOKEN}`)) === 200);
    check('secret-path URL with wrong token -> 401', (await rawMcp(`${MCP_URL}/not-the-token`)) === 401);
  } else {
    notes.push('Auth checks skipped: server running without MCP_AUTH_TOKEN.');
  }
  check('GET /mcp -> 405 (stateless Streamable HTTP)', (await rawMcp(MCP_URL, {}, 'GET')) === 405);
  check('foreign Host header rejected (DNS-rebinding protection) -> 403', (await statusWithHost('evil.example')) === 403);

  const client = new Client({ name: 'spendgate-mcp-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} },
  });
  await client.connect(transport);

  const call = async (name: string, args: Record<string, unknown>): Promise<ToolOutcome> => {
    try {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? '').join('\n');
      return { isError: Boolean(result.isError), text, data: (result.structuredContent as Record<string, any>) ?? {} };
    } catch (error) {
      // Protocol-level errors (e.g. schema validation in some SDK versions).
      return { isError: true, text: error instanceof Error ? error.message : String(error), data: {} };
    }
  };

  /* ---------------------------------- Tools ---------------------------------- */
  console.log('\nB. Tool registration');
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  check('exactly 5 tools registered', names.length === 5, names);
  for (const expected of [
    'approve_purchase_request',
    'create_purchase_request',
    'get_budget_summary',
    'list_purchase_requests',
    'update_purchase_request',
  ]) {
    const tool = tools.find((t) => t.name === expected);
    check(`${expected}: has description and JSON input schema`, !!tool?.description && tool.inputSchema.type === 'object');
  }
  const createTool = tools.find((t) => t.name === 'create_purchase_request');
  check('create_purchase_request schema lists required fields',
    JSON.stringify(createTool?.inputSchema.required ?? []).includes('departmentName'), createTool?.inputSchema.required);

  /* --------------------------- Natural-language flows ------------------------ */
  console.log('\nScenario 1: "Show me all pending purchase requests."');
  const pending = await call('list_purchase_requests', { status: 'PENDING_APPROVAL' });
  const restPending = await rest('GET', '/purchase-requests?status=PENDING_APPROVAL&pageSize=1');
  check('tool succeeds', !pending.isError, pending.text);
  check('every result is PENDING_APPROVAL', (pending.data.requests ?? []).every((r: any) => r.status === 'PENDING_APPROVAL'));
  check('total matches dashboard/REST', pending.data.total === restPending.total, { mcp: pending.data.total, rest: restPending.total });
  check('results include reference, amount, department, status',
    (pending.data.requests ?? []).every((r: any) => r.reference && r.amount && r.department && r.status));

  console.log('\nScenario 2: "What is the remaining engineering budget?"');
  const budget = await call('get_budget_summary', { departmentName: 'engineering' });
  const restDepts = await rest('GET', '/departments');
  const engRest = restDepts.items.find((d: any) => d.name === 'Engineering');
  const engTool = budget.data.departments?.[0];
  check('tool succeeds (case-insensitive department)', !budget.isError && engTool?.department === 'Engineering', budget.text);
  check('available matches dashboard/REST', engTool?.available === engRest.available.display, { mcp: engTool?.available, rest: engRest.available.display });
  check('returns allocated, pending, approved, committed, available, utilization',
    ['allocated', 'pendingCommitted', 'approvedCommitted', 'totalCommitted', 'available', 'utilizationPercent'].every((k) => k in (engTool ?? {})));
  console.log(`        -> ${budget.text.split('\n')[0]}`);

  const engAvailableBefore = BigInt(engRest.available.minor);
  const dashBefore = await rest('GET', '/dashboard/summary');
  let createdReference: string | undefined;

  if (engAvailableBefore < 2_500_000n) {
    notes.push('Scenarios 3-5 skipped: Engineering has less than ₹25,000 available. Reset the dev DB (npm run db:reset).');
  } else {
    console.log('\nScenario 3: "Create a ₹20,000 purchase request for engineering for laptop accessories."');
    const created = await call('create_purchase_request', {
      title: `Laptop accessories ${unique}`,
      description: 'Docks, keyboards and mice for new joiners',
      amount: 20000,
      quantity: 5,
      category: 'HARDWARE',
      requesterName: 'Demo Requester',
      departmentName: 'engineering',
      submitImmediately: true,
    });
    const req = created.data.request;
    createdReference = req?.reference;
    check('tool succeeds', !created.isError, created.text);
    check('reference uses PR-###### format', /^PR-\d{6}$/.test(req?.reference ?? ''), req?.reference);
    check('status PENDING_APPROVAL', req?.status === 'PENDING_APPROVAL');
    check('routed to Department Manager', req?.approval?.routedTo === 'Department Manager', req?.approval);
    const engAfterCreate = (await rest('GET', '/departments')).items.find((d: any) => d.name === 'Engineering');
    check('Engineering available dropped by ₹20,000 on dashboard', engAvailableBefore - BigInt(engAfterCreate.available.minor) === 2_000_000n);
    console.log(`        -> ${created.text.split('\n')[0]}`);

    console.log(`\nScenario 4: "Edit ${createdReference} and increase its amount to ₹25,000."`);
    const edited = await call('update_purchase_request', { reference: createdReference, amount: 25000 });
    check('tool succeeds', !edited.isError, edited.text);
    check('amount is ₹25,000.00', edited.data.request?.amount === '₹25,000.00', edited.data.request?.amount);
    check('still pending, still Department Manager', edited.data.request?.status === 'PENDING_APPROVAL' && edited.data.request?.approval?.routedTo === 'Department Manager');
    const lowercase = await call('update_purchase_request', { reference: createdReference!.toLowerCase(), quantity: 6 });
    check('reference lookup is case-insensitive', !lowercase.isError, lowercase.text);
    console.log(`        -> ${edited.text.split('\n')[0]}`);

    console.log(`\nScenario 5: "Approve ${createdReference}."`);
    const approved = await call('approve_purchase_request', { reference: createdReference, action: 'approve', approverName: 'Demo Approver' });
    check('tool succeeds', !approved.isError, approved.text);
    check('status APPROVED', approved.data.request?.status === 'APPROVED');
    check('decision attributed to MCP client (identity not trusted)', /\(via .+\)$/.test(approved.data.request?.approval?.decidedBy ?? ''), approved.data.request?.approval?.decidedBy);
    check('decision timestamp recorded', !!approved.data.request?.approval?.decidedAt);
    console.log(`        -> ${approved.text.split('\n')[0]}`);

    const again = await call('approve_purchase_request', { reference: createdReference, action: 'approve', approverName: 'Demo Approver' });
    check('duplicate decision refused (APPROVAL_ALREADY_PROCESSED)', again.isError && again.text.includes('APPROVAL_ALREADY_PROCESSED'), again.text);
    const editApproved = await call('update_purchase_request', { reference: createdReference, amount: 1 });
    check('editing an approved request refused (REQUEST_LOCKED)', editApproved.isError && editApproved.text.includes('REQUEST_LOCKED'), editApproved.text);

    console.log('\nC. Dashboard and audit log reflect MCP actions');
    const detail = await rest('GET', `/purchase-requests?search=${encodeURIComponent(createdReference!)}`);
    const id = detail.items[0]?.id;
    const audit = await rest('GET', `/audit-logs?entityType=PURCHASE_REQUEST&entityId=${id}`);
    const actions = audit.items.map((l: any) => l.action).reverse();
    check('audit trail CREATED, SUBMITTED, UPDATED, UPDATED, APPROVED', actions.join(',') === 'CREATED,SUBMITTED,UPDATED,UPDATED,APPROVED', actions);
    check('every audit entry tagged channel=mcp', audit.items.every((l: any) => l.details?.channel === 'mcp'));
    check('audit entries flag identityVerified=false', audit.items.every((l: any) => l.details?.identityVerified === false));
    const dashAfter = await rest('GET', '/dashboard/summary');
    check('dashboard approved spend +₹25,000', BigInt(dashAfter.totals.approved.minor) - BigInt(dashBefore.totals.approved.minor) === 2_500_000n);
    check('request visible in dashboard recent requests', dashAfter.recentRequests.some((r: any) => r.reference === createdReference));
  }

  /* ------------------------------- Error handling ---------------------------- */
  console.log('\nD. Error handling');
  const literal = await call('update_purchase_request', { reference: 'PR-100001', amount: 25000 });
  const literalStatus = (await rest('GET', '/purchase-requests?search=PR-100001')).items[0]?.status;
  if (literalStatus === 'APPROVED' || literalStatus === 'REJECTED') {
    check(`literal PR-100001 is ${literalStatus} -> edit refused with REQUEST_LOCKED`, literal.isError && literal.text.includes('REQUEST_LOCKED'), literal.text);
  } else {
    check('literal PR-100001 editable -> update succeeds', !literal.isError, literal.text);
  }
  const missing = await call('approve_purchase_request', { reference: 'PR-999999', action: 'approve', approverName: 'Demo Approver' });
  check('unknown reference -> NOT_FOUND', missing.isError && missing.text.includes('NOT_FOUND'), missing.text);
  const malformed = await call('update_purchase_request', { reference: 'hello', title: 'x y z' });
  check('malformed reference -> BAD_REQUEST', malformed.isError && malformed.text.includes('BAD_REQUEST'), malformed.text);
  const badDept = await call('get_budget_summary', { departmentName: 'Legal' });
  check('unknown department -> NOT_FOUND listing valid departments', badDept.isError && badDept.text.includes('Engineering'), badDept.text);
  const badAmount = await call('create_purchase_request', {
    title: 'Bad amount', amount: 'twenty', category: 'OTHER', requesterName: 'Demo Requester', departmentName: 'Marketing',
  });
  check('invalid amount -> VALIDATION_ERROR', badAmount.isError && badAmount.text.includes('VALIDATION_ERROR'), badAmount.text);
  const noFields = await call('update_purchase_request', { reference: 'PR-100001' });
  check('update with no fields -> BAD_REQUEST', noFields.isError && noFields.text.includes('BAD_REQUEST'), noFields.text);
  const badQty = await call('create_purchase_request', {
    title: 'Bad quantity', amount: 10, quantity: 0, category: 'OTHER', requesterName: 'Demo Requester', departmentName: 'Marketing',
  });
  check('schema violation (quantity 0) rejected', badQty.isError, badQty.text);

  // Budget exceeded: nothing should be saved.
  const depts = (await rest('GET', '/departments')).items;
  const mkt = depts.find((d: any) => d.name === 'Marketing');
  const overAmount = (BigInt(mkt.available.minor) / 100n + 1n).toString();
  const over = await call('create_purchase_request', {
    title: `Over budget ${unique}`, amount: overAmount, category: 'MARKETING', requesterName: 'Demo Requester',
    departmentName: 'Marketing', submitImmediately: true,
  });
  check('over-budget submission -> BUDGET_EXCEEDED with shortfall', over.isError && over.text.includes('BUDGET_EXCEEDED') && over.text.includes('shortfall'), over.text);
  const orphan = await rest('GET', `/purchase-requests?search=${encodeURIComponent(`Over budget ${unique}`)}`);
  check('nothing saved after budget failure', orphan.total === 0);

  // Reject via MCP (Team Lead request).
  const small = await call('create_purchase_request', {
    title: `Stationery ${unique}`, amount: '750.50', category: 'OFFICE_SUPPLIES', requesterName: 'Demo Requester',
    departmentName: 'Operations', submitImmediately: true,
  });
  const smallRef = small.data.request?.reference;
  check('₹750.50 request routed to Team Lead', small.data.request?.approval?.routedTo === 'Team Lead', small.text);
  const noReason = await call('approve_purchase_request', { reference: smallRef, action: 'reject', approverName: 'Demo Approver' });
  check('reject without reason refused', noReason.isError && noReason.text.includes('rejectionReason'), noReason.text);
  const shortReason = await call('approve_purchase_request', { reference: smallRef, action: 'reject', approverName: 'Demo Approver', rejectionReason: 'no' });
  check('reject with too-short reason -> VALIDATION_ERROR', shortReason.isError && shortReason.text.includes('VALIDATION_ERROR'), shortReason.text);
  const rejected = await call('approve_purchase_request', {
    reference: smallRef, action: 'reject', approverName: 'Demo Approver', rejectionReason: 'Use the existing stationery stock',
  });
  check('reject with reason succeeds', !rejected.isError && rejected.data.request?.status === 'REJECTED', rejected.text);
  check('rejection reason returned', rejected.data.request?.approval?.comments === 'Use the existing stationery stock');

  // Server-side role authorization: Finance Manager approvals are not allowed for the MCP client by default.
  const roomiest = depts.reduce((a: any, b: any) => (BigInt(a.available.minor) >= BigInt(b.available.minor) ? a : b));
  if (BigInt(roomiest.available.minor) > 5_000_001n) {
    const big = await call('create_purchase_request', {
      title: `Server rack ${unique}`, amount: '50000.01', category: 'HARDWARE', requesterName: 'Demo Requester',
      departmentName: roomiest.name, submitImmediately: true,
    });
    const bigRef = big.data.request?.reference;
    check('₹50,000.01 routed to Finance Manager', big.data.request?.approval?.routedTo === 'Finance Manager', big.text);
    const forbidden = await call('approve_purchase_request', { reference: bigRef, action: 'approve', approverName: 'Claimed CFO' });
    check('MCP client cannot approve Finance-level request (FORBIDDEN), even claiming to be CFO', forbidden.isError && forbidden.text.includes('FORBIDDEN'), forbidden.text);
    const stillPending = await rest('GET', `/purchase-requests?search=${bigRef}`);
    check('request remains pending after forbidden attempt', stillPending.items[0]?.status === 'PENDING_APPROVAL');
    // Cleanup through the dashboard API so the test does not hold budget.
    const approvalId = stillPending.items[0]?.approval?.id;
    await rest('POST', `/approvals/${approvalId}/reject`, { approverName: 'Test Cleanup', reason: 'Automated test cleanup' });
  } else {
    notes.push('Finance-role authorization test skipped: no department has more than ₹50,000 available.');
  }

  await client.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  for (const note of notes) console.log(`NOTE: ${note}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error('MCP test crashed:', error);
  process.exitCode = 1;
});
