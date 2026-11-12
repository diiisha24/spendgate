import type { ApprovalStatus, Prisma } from '@prisma/client';
import { APPROVER_ROLE_LABELS } from '../config/approvalRules.js';
import { prisma } from '../database/prisma.js';
import { withWriteTransaction } from '../database/transaction.js';
import { AppError } from '../lib/errors.js';
import { toMajorString } from '../lib/money.js';
import { type ActionContext, WEB_CONTEXT } from '../types/context.js';
import type { ApproveInput, ListApprovalsQuery, RejectInput } from '../validation/approval.schemas.js';
import { recordAudit } from './audit.service.js';
import {
  type ApprovalDto,
  type PurchaseRequestDto,
  purchaseRequestInclude,
  toApprovalDto,
  toPurchaseRequestDto,
} from './dto.js';
import { resolveRequestIdByReference } from './purchaseRequest.service.js';

type Decision =
  | { outcome: 'APPROVED'; approverName: string; comments?: string }
  | { outcome: 'REJECTED'; approverName: string; reason: string };

/**
 * Name recorded for the decision. For non-web channels the caller-supplied
 * name is a claim, so the authenticated client is appended to keep the audit
 * trail honest, e.g. "Asha Rao (via Claude MCP)".
 */
function recordedApproverName(name: string, context: ActionContext): string {
  if (context.channel === 'web') return name;
  return `${name} (via ${context.clientName ?? context.channel.toUpperCase()})`;
}

/**
 * Records an approval decision atomically: approval record, request status
 * and audit log commit together or not at all. Conditional updates make the
 * operation safe against double-clicks and concurrent approvers.
 *
 * Budget note: pending requests already count as committed spend, so
 * approving does not change availability, and rejecting releases it.
 */
async function decide(
  approvalId: string,
  decision: Decision,
  context: ActionContext,
): Promise<PurchaseRequestDto> {
  const requestId = await withWriteTransaction(async (tx) => {
    const approval = await tx.approval.findUnique({
      where: { id: approvalId },
      include: { purchaseRequest: true },
    });
    if (!approval) throw AppError.notFound('Approval not found');

    if (approval.status !== 'PENDING') {
      throw AppError.conflict(
        `${approval.purchaseRequest.reference} has already been ${approval.status.toLowerCase()}`,
        { status: approval.status, decidedBy: approval.approverName },
        'APPROVAL_ALREADY_PROCESSED',
      );
    }

    // Role authorization comes from server-side configuration of the caller,
    // never from the request payload.
    if (context.allowedApproverRoles && !context.allowedApproverRoles.includes(approval.approverRole)) {
      throw AppError.forbidden(
        `${approval.purchaseRequest.reference} requires ${APPROVER_ROLE_LABELS[approval.approverRole]} approval, ` +
          'which this client is not permitted to give. Please approve it from the SpendGate dashboard.',
        {
          requiredRole: approval.approverRole,
          allowedRoles: context.allowedApproverRoles,
        },
      );
    }

    const approverName = recordedApproverName(decision.approverName, context);
    const comments = decision.outcome === 'REJECTED' ? decision.reason : decision.comments ?? null;
    const decidedAt = new Date();

    const approvalUpdate = await tx.approval.updateMany({
      where: { id: approvalId, status: 'PENDING' },
      data: { status: decision.outcome, approverName, comments, decidedAt },
    });

    const requestUpdate = await tx.purchaseRequest.updateMany({
      where: { id: approval.purchaseRequestId, status: 'PENDING_APPROVAL' },
      data: { status: decision.outcome },
    });

    if (approvalUpdate.count !== 1 || requestUpdate.count !== 1) {
      throw AppError.conflict(
        'This request has already been processed',
        undefined,
        'APPROVAL_ALREADY_PROCESSED',
      );
    }

    const request = approval.purchaseRequest;
    await recordAudit(tx, {
      entityType: 'PURCHASE_REQUEST',
      entityId: request.id,
      action: decision.outcome,
      performedBy: approverName,
      context,
      details: {
        reference: request.reference,
        approvalId,
        approverRole: APPROVER_ROLE_LABELS[approval.approverRole],
        amount: toMajorString(request.amount),
        decidedAt: decidedAt.toISOString(),
        ...(decision.outcome === 'REJECTED'
          ? { reason: decision.reason }
          : decision.comments
            ? { comments: decision.comments }
            : {}),
      },
    });

    return request.id;
  });

  const updated = await prisma.purchaseRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: purchaseRequestInclude,
  });
  return toPurchaseRequestDto(updated);
}

export function approveRequest(
  approvalId: string,
  input: ApproveInput,
  context: ActionContext = WEB_CONTEXT,
): Promise<PurchaseRequestDto> {
  return decide(
    approvalId,
    { outcome: 'APPROVED', approverName: input.approverName, comments: input.comments },
    context,
  );
}

export function rejectRequest(
  approvalId: string,
  input: RejectInput,
  context: ActionContext = WEB_CONTEXT,
): Promise<PurchaseRequestDto> {
  return decide(
    approvalId,
    { outcome: 'REJECTED', approverName: input.approverName, reason: input.reason },
    context,
  );
}

/**
 * Finds the pending approval for a request reference. Gives a precise error
 * for drafts and already-decided requests instead of a generic "not found".
 */
async function resolvePendingApprovalId(reference: string): Promise<string> {
  const requestId = await resolveRequestIdByReference(reference);
  const request = await prisma.purchaseRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { approvals: true },
  });

  const pending = request.approvals.find((approval) => approval.status === 'PENDING');
  if (pending) return pending.id;

  if (request.status === 'DRAFT') {
    throw AppError.conflict(
      `${request.reference} is still a draft and has not been submitted for approval`,
      { status: request.status },
      'NOT_SUBMITTED',
    );
  }

  const decided = request.approvals.find((approval) => approval.status !== 'PENDING');
  throw AppError.conflict(
    `${request.reference} has already been processed (status: ${request.status})`,
    { status: request.status, decidedBy: decided?.approverName ?? null },
    'APPROVAL_ALREADY_PROCESSED',
  );
}

export async function approveRequestByReference(
  reference: string,
  input: ApproveInput,
  context: ActionContext = WEB_CONTEXT,
): Promise<PurchaseRequestDto> {
  return approveRequest(await resolvePendingApprovalId(reference), input, context);
}

export async function rejectRequestByReference(
  reference: string,
  input: RejectInput,
  context: ActionContext = WEB_CONTEXT,
): Promise<PurchaseRequestDto> {
  return rejectRequest(await resolvePendingApprovalId(reference), input, context);
}

export interface ApprovalListItem extends ApprovalDto {
  request: Pick<PurchaseRequestDto, 'id' | 'reference' | 'title' | 'amount' | 'requesterName' | 'department' | 'category' | 'status'>;
}

export async function listApprovals(query: ListApprovalsQuery) {
  const where: Prisma.ApprovalWhereInput = {
    status: query.status as ApprovalStatus | undefined,
    approverRole: query.approverRole,
  };

  const [total, approvals] = await prisma.$transaction([
    prisma.approval.count({ where }),
    prisma.approval.findMany({
      where,
      include: { purchaseRequest: { include: purchaseRequestInclude } },
      // Pending: oldest first (FIFO queue). Processed: most recent decision first.
      orderBy: query.status === 'PENDING' ? { createdAt: 'asc' } : { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const items: ApprovalListItem[] = approvals.map((approval) => {
    const request = toPurchaseRequestDto(approval.purchaseRequest);
    return {
      ...toApprovalDto(approval),
      request: {
        id: request.id,
        reference: request.reference,
        title: request.title,
        amount: request.amount,
        requesterName: request.requesterName,
        department: request.department,
        category: request.category,
        status: request.status,
      },
    };
  });

  return { items, total, page: query.page, pageSize: query.pageSize };
}
