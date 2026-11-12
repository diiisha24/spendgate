import type {
  Approval,
  ApprovalStatus,
  ApproverRole,
  Department,
  PurchaseCategory,
  PurchaseRequest,
  PurchaseRequestStatus,
} from '@prisma/client';
import { APPROVER_ROLE_LABELS } from '../config/approvalRules.js';
import { type MoneyDto, toMoneyDto } from '../lib/money.js';

export interface ApprovalDto {
  id: string;
  purchaseRequestId: string;
  approverRole: ApproverRole;
  approverRoleLabel: string;
  approverName: string | null;
  approvalLevel: number;
  status: ApprovalStatus;
  comments: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface PurchaseRequestDto {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  amount: MoneyDto;
  quantity: number;
  category: PurchaseCategory;
  requesterName: string;
  department: { id: string; name: string };
  status: PurchaseRequestStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Latest approval record, if the request has been submitted. */
  approval: ApprovalDto | null;
}

export type PurchaseRequestWithRelations = PurchaseRequest & {
  department: Department;
  approvals: Approval[];
};

export function toApprovalDto(approval: Approval): ApprovalDto {
  return {
    id: approval.id,
    purchaseRequestId: approval.purchaseRequestId,
    approverRole: approval.approverRole,
    approverRoleLabel: APPROVER_ROLE_LABELS[approval.approverRole],
    approverName: approval.approverName,
    approvalLevel: approval.approvalLevel,
    status: approval.status,
    comments: approval.comments,
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString(),
  };
}

export function toPurchaseRequestDto(request: PurchaseRequestWithRelations): PurchaseRequestDto {
  const latestApproval = [...request.approvals].sort(
    (a, b) => b.approvalLevel - a.approvalLevel,
  )[0];

  return {
    id: request.id,
    reference: request.reference,
    title: request.title,
    description: request.description,
    amount: toMoneyDto(request.amount),
    quantity: request.quantity,
    category: request.category,
    requesterName: request.requesterName,
    department: { id: request.department.id, name: request.department.name },
    status: request.status,
    submittedAt: request.submittedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    approval: latestApproval ? toApprovalDto(latestApproval) : null,
  };
}

/** Prisma `include` used everywhere a PurchaseRequestDto is produced. */
export const purchaseRequestInclude = {
  department: true,
  approvals: true,
} as const;
