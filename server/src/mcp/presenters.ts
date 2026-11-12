import { env } from '../config/env.js';
import type { DepartmentBudgetDto } from '../services/budget.service.js';
import type { PurchaseRequestDto } from '../services/dto.js';

/**
 * Compact, model-friendly shapes for tool output. Amounts are shown in INR
 * (display strings) - Claude never needs to do money arithmetic.
 */

const STATUS_LABELS: Record<PurchaseRequestDto['status'], string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function dashboardLink(requestId: string): string {
  return `${env.DASHBOARD_URL.replace(/\/$/, '')}/purchase-requests/${requestId}`;
}

export function presentRequest(request: PurchaseRequestDto) {
  return {
    reference: request.reference,
    title: request.title,
    description: request.description,
    status: request.status,
    statusLabel: STATUS_LABELS[request.status],
    amount: request.amount.display,
    amountINR: request.amount.major,
    quantity: request.quantity,
    category: request.category,
    department: request.department.name,
    requesterName: request.requesterName,
    createdAt: request.createdAt,
    submittedAt: request.submittedAt,
    approval: request.approval
      ? {
          routedTo: request.approval.approverRoleLabel,
          status: request.approval.status,
          decidedBy: request.approval.approverName,
          decidedAt: request.approval.decidedAt,
          comments: request.approval.comments,
        }
      : null,
    dashboardUrl: dashboardLink(request.id),
  };
}

/** Shorter form for list results. */
export function presentRequestSummary(request: PurchaseRequestDto) {
  return {
    reference: request.reference,
    title: request.title,
    amount: request.amount.display,
    department: request.department.name,
    status: request.status,
    statusLabel: STATUS_LABELS[request.status],
    category: request.category,
    requesterName: request.requesterName,
    approverRole: request.approval?.approverRoleLabel ?? null,
    createdAt: request.createdAt,
  };
}

export function presentBudget(budget: DepartmentBudgetDto) {
  return {
    department: budget.name,
    allocated: budget.allocated.display,
    pendingCommitted: budget.pending.display,
    approvedCommitted: budget.approved.display,
    totalCommitted: budget.committed.display,
    available: budget.available.display,
    utilizationPercent: budget.utilizationPercent,
    pendingRequests: budget.pendingCount,
    approvedRequests: budget.approvedCount,
  };
}
