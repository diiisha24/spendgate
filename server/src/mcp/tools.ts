import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PurchaseCategory, PurchaseRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { approvalThresholds } from '../config/approvalRules.js';
import { AppError } from '../lib/errors.js';
import { formatINR } from '../lib/money.js';
import { approveRequestByReference, rejectRequestByReference } from '../services/approval.service.js';
import { getBudgetSummary } from '../services/budget.service.js';
import { resolveDepartmentByName } from '../services/department.service.js';
import {
  createPurchaseRequest,
  getPurchaseRequest,
  listPurchaseRequests,
  resolveRequestIdByReference,
  updatePurchaseRequest,
} from '../services/purchaseRequest.service.js';
import type { ActionContext } from '../types/context.js';
import { approveSchema, rejectSchema } from '../validation/approval.schemas.js';
import {
  createPurchaseRequestSchema,
  listPurchaseRequestsSchema,
  updatePurchaseRequestSchema,
} from '../validation/purchaseRequest.schemas.js';
import { presentBudget, presentRequest, presentRequestSummary } from './presenters.js';
import { runTool, toolSuccess } from './results.js';

/**
 * MCP tool definitions. Every handler is a thin adapter:
 *   1. resolve human identifiers (department name, PR reference) via services
 *   2. validate with the SAME zod schemas the REST API uses
 *   3. call the SAME service functions the REST API uses
 *   4. present the result
 * No business rules live here.
 *
 * Input schemas below are intentionally plain (no transforms) so they convert
 * cleanly to JSON Schema for the client; full validation happens in step 2.
 */

const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 50;

const amountInput = z
  .union([z.number(), z.string()])
  .describe('Total amount in Indian Rupees (INR, not paise), e.g. 20000 or "1499.50". Max 2 decimal places.');

const categoryInput = z
  .enum(PurchaseCategory)
  .describe('Purchase category. Use OTHER if none fits.');

const referenceInput = z
  .string()
  .min(1)
  .max(20)
  .describe('Human-readable request reference, e.g. "PR-100001".');

const routingSummary = () =>
  `Approval routing: below ${formatINR(approvalThresholds.teamLeadBelowMinor)} -> Team Lead; ` +
  `${formatINR(approvalThresholds.teamLeadBelowMinor)} to ${formatINR(approvalThresholds.departmentManagerUpToMinor)} -> Department Manager; ` +
  `above ${formatINR(approvalThresholds.departmentManagerUpToMinor)} -> Finance Manager.`;

export function registerTools(server: McpServer, context: ActionContext): void {
  /* ------------------------------------------------------------------ */
  server.registerTool(
    'create_purchase_request',
    {
      title: 'Create purchase request',
      description:
        'Create a new purchase request in SpendGate. Set submitImmediately=true to submit it for approval right away; ' +
        'the server then checks the department\'s available budget and routes it to the right approver. ' +
        'If the budget is insufficient, nothing is saved and a BUDGET_EXCEEDED error explains the shortfall. ' +
        `${routingSummary()} Returns the new reference (e.g. PR-100001), status and approval routing.`,
      inputSchema: {
        title: z.string().min(3).max(120).describe('Short title, e.g. "Laptop accessories".'),
        description: z.string().max(2000).optional().describe('Business justification or details.'),
        amount: amountInput,
        quantity: z.number().int().min(1).max(100_000).default(1).describe('Number of units. Defaults to 1.'),
        category: categoryInput,
        requesterName: z.string().min(2).max(80).describe('Full name of the employee requesting the purchase.'),
        departmentName: z
          .string()
          .min(1)
          .max(60)
          .describe('Department name, e.g. "Engineering", "Marketing" or "Operations" (case-insensitive).'),
        submitImmediately: z
          .boolean()
          .default(false)
          .describe('true = submit for approval now (runs budget check); false = save as draft.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('create_purchase_request', async () => {
        const department = await resolveDepartmentByName(args.departmentName);
        const input = createPurchaseRequestSchema.parse({
          title: args.title,
          description: args.description,
          amount: args.amount,
          quantity: args.quantity,
          category: args.category,
          requesterName: args.requesterName,
          departmentId: department.id,
          submit: args.submitImmediately,
        });

        const request = await createPurchaseRequest(input, context);
        const summary =
          request.status === 'PENDING_APPROVAL'
            ? `Created ${request.reference} for ${request.amount.display} and submitted it. Routed to ${request.approval?.approverRoleLabel}.`
            : `Created ${request.reference} for ${request.amount.display} as a draft (not yet submitted).`;
        return toolSuccess(summary, { request: presentRequest(request) });
      }),
  );

  /* ------------------------------------------------------------------ */
  server.registerTool(
    'list_purchase_requests',
    {
      title: 'List purchase requests',
      description:
        'Search and list purchase requests, newest first. All filters are optional and combine with AND. ' +
        'Use status=PENDING_APPROVAL for requests awaiting approval. Returns reference, title, amount, department, ' +
        `status and approver role. Returns at most ${LIST_LIMIT_MAX} results per page; use page for more.`,
      inputSchema: {
        status: z.enum(PurchaseRequestStatus).optional().describe('Filter by status.'),
        departmentName: z.string().max(60).optional().describe('Filter by department name (case-insensitive).'),
        category: categoryInput.optional(),
        search: z.string().max(100).optional().describe('Free-text search across title, reference, requester and description.'),
        limit: z.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_DEFAULT).describe('Results per page.'),
        page: z.number().int().min(1).default(1).describe('Page number, starting at 1.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      runTool('list_purchase_requests', async () => {
        const department = args.departmentName ? await resolveDepartmentByName(args.departmentName) : undefined;
        const query = listPurchaseRequestsSchema.parse({
          status: args.status,
          departmentId: department?.id,
          category: args.category,
          search: args.search,
          page: args.page,
          pageSize: args.limit,
        });

        const result = await listPurchaseRequests(query);
        const shown = result.items.length;
        const hasMore = result.page * result.pageSize < result.total;
        const summary =
          result.total === 0
            ? 'No purchase requests match these filters.'
            : `Found ${result.total} matching request(s); showing ${shown} (page ${result.page}).${hasMore ? ' More results are available on the next page.' : ''}`;

        return toolSuccess(summary, {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          hasMore,
          requests: result.items.map(presentRequestSummary),
        });
      }),
  );

  /* ------------------------------------------------------------------ */
  server.registerTool(
    'get_budget_summary',
    {
      title: 'Get budget summary',
      description:
        'Get budget figures for one department, or all departments if departmentName is omitted: allocated budget, ' +
        'pending committed spend, approved committed spend, total committed spend, available (remaining) budget and ' +
        'utilization percentage. Committed = pending + approved requests; drafts and rejected requests do not count.',
      inputSchema: {
        departmentName: z
          .string()
          .max(60)
          .optional()
          .describe('Department name (case-insensitive). Omit for all departments and organization totals.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      runTool('get_budget_summary', async () => {
        const department = args.departmentName ? await resolveDepartmentByName(args.departmentName) : undefined;
        const summary = await getBudgetSummary(department?.id);
        const departments = summary.departments.map(presentBudget);

        const headline = department
          ? `${department.name}: ${summary.totals.available.display} available of ${summary.totals.allocated.display} (${summary.totals.utilizationPercent}% committed).`
          : `Organization: ${summary.totals.available.display} available of ${summary.totals.allocated.display} across ${departments.length} departments (${summary.totals.utilizationPercent}% committed).`;

        return toolSuccess(headline, {
          departments,
          totals: {
            allocated: summary.totals.allocated.display,
            pendingCommitted: summary.totals.pending.display,
            approvedCommitted: summary.totals.approved.display,
            totalCommitted: summary.totals.committed.display,
            available: summary.totals.available.display,
            utilizationPercent: summary.totals.utilizationPercent,
          },
        });
      }),
  );

  /* ------------------------------------------------------------------ */
  server.registerTool(
    'update_purchase_request',
    {
      title: 'Update purchase request',
      description:
        'Edit a purchase request by its reference (e.g. PR-100001). Only Draft and Pending-approval requests can be ' +
        'edited; approved or rejected requests are locked. For pending requests, an amount change re-checks the ' +
        'department budget and may re-route the approval to a different approver. Provide only the fields to change. ' +
        'The change is recorded in the audit log.',
      inputSchema: {
        reference: referenceInput,
        title: z.string().min(3).max(120).optional().describe('New title.'),
        description: z.string().max(2000).optional().describe('New description.'),
        amount: amountInput.optional(),
        quantity: z.number().int().min(1).max(100_000).optional().describe('New quantity.'),
        category: categoryInput.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) =>
      runTool('update_purchase_request', async () => {
        const { reference, ...fields } = args;
        const changes = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
        if (Object.keys(changes).length === 0) {
          throw AppError.badRequest('Provide at least one field to update (title, description, amount, quantity or category).');
        }

        const id = await resolveRequestIdByReference(reference);
        const input = updatePurchaseRequestSchema.parse({
          ...changes,
          performedBy: context.clientName ?? 'MCP client',
        });
        const before = await getPurchaseRequest(id);
        const request = await updatePurchaseRequest(id, input, context);

        const rerouted =
          before.approval && request.approval && before.approval.approverRole !== request.approval.approverRole
            ? ` Approval re-routed from ${before.approval.approverRoleLabel} to ${request.approval.approverRoleLabel}.`
            : '';
        const unchanged = before.updatedAt === request.updatedAt;
        const summary = unchanged
          ? `No changes were needed for ${request.reference}; the values already match.`
          : `Updated ${request.reference}. Amount is now ${request.amount.display}; status ${request.status}.${rerouted}`;
        return toolSuccess(summary, { request: presentRequest(request) });
      }),
  );

  /* ------------------------------------------------------------------ */
  server.registerTool(
    'approve_purchase_request',
    {
      title: 'Approve or reject purchase request',
      description:
        'Approve or reject a pending purchase request by its reference (e.g. PR-100001). A rejectionReason is required ' +
        'when action is "reject". A request that has already been approved or rejected cannot be decided again. ' +
        'This client may only decide requests routed to the roles it is authorized for (configured on the server); ' +
        'others must be approved in the SpendGate dashboard. ' +
        'IDENTITY NOTE (demo): approverName is recorded as stated and is NOT verified - always confirm with the user ' +
        'before approving or rejecting.',
      inputSchema: {
        reference: referenceInput,
        action: z.enum(['approve', 'reject']).describe('"approve" or "reject".'),
        approverName: z.string().min(2).max(80).describe('Name of the person making the decision.'),
        rejectionReason: z
          .string()
          .max(1000)
          .optional()
          .describe('Required when action is "reject" (at least 5 characters). Shared with the requester.'),
        comments: z.string().max(1000).optional().describe('Optional note when approving.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('approve_purchase_request', async () => {
        let request;
        if (args.action === 'reject') {
          if (!args.rejectionReason?.trim()) {
            throw AppError.badRequest('rejectionReason is required when rejecting a request.');
          }
          const input = rejectSchema.parse({ approverName: args.approverName, reason: args.rejectionReason });
          request = await rejectRequestByReference(args.reference, input, context);
        } else {
          const input = approveSchema.parse({ approverName: args.approverName, comments: args.comments });
          request = await approveRequestByReference(args.reference, input, context);
        }

        const verb = request.status === 'APPROVED' ? 'Approved' : 'Rejected';
        return toolSuccess(
          `${verb} ${request.reference} (${request.amount.display}) as ${request.approval?.approverRoleLabel}.`,
          { request: presentRequest(request) },
        );
      }),
  );
}
