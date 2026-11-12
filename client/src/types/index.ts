import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export type ServiceStatus = 'ok' | 'error';

/** Mirrors server/src/types/api.ts HealthReport. */
export interface HealthReport {
  status: ServiceStatus;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: { status: ServiceStatus; latencyMs?: number; message?: string };
  };
}

/** Money as returned by the API. `minor` = paise (string, exact). */
export interface Money {
  minor: string;
  major: string;
  currency: string;
}

export type RequestStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type PurchaseCategory =
  | 'SOFTWARE'
  | 'HARDWARE'
  | 'OFFICE_SUPPLIES'
  | 'TRAVEL'
  | 'MARKETING'
  | 'PROFESSIONAL_SERVICES'
  | 'OTHER';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApproverRole = 'TEAM_LEAD' | 'DEPARTMENT_MANAGER' | 'FINANCE_MANAGER';
export type AuditAction =
  | 'CREATED'
  | 'UPDATED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'DELETED';
export type AuditEntityType = 'DEPARTMENT' | 'PURCHASE_REQUEST' | 'APPROVAL';

export interface Approval {
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

export interface PurchaseRequest {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  amount: Money;
  quantity: number;
  category: PurchaseCategory;
  requesterName: string;
  department: { id: string; name: string };
  status: RequestStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  approval: Approval | null;
}

export interface AuditLog {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  entity?: { reference: string; title: string } | null;
}

export interface PurchaseRequestDetail extends PurchaseRequest {
  history: AuditLog[];
}

export interface DepartmentBudget {
  id: string;
  name: string;
  allocated: Money;
  pending: Money;
  approved: Money;
  committed: Money;
  available: Money;
  pendingCount: number;
  approvedCount: number;
  utilizationPercent: number;
}

export interface ApprovalListItem extends Approval {
  request: Pick<
    PurchaseRequest,
    'id' | 'reference' | 'title' | 'amount' | 'requesterName' | 'department' | 'category' | 'status'
  >;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummary {
  totals: {
    allocated: Money;
    committed: Money;
    pending: Money;
    approved: Money;
    available: Money;
    utilizationPercent: number;
  };
  pendingApprovals: number;
  departmentCount: number;
  requestCounts: Partial<Record<RequestStatus, number>>;
  departments: DepartmentBudget[];
  recentRequests: PurchaseRequest[];
  approvalRules: { teamLeadBelow: Money; departmentManagerUpTo: Money };
  generatedAt: string;
}

/** Form payload (amount entered in rupees as a string). */
export interface PurchaseRequestInput {
  title: string;
  description?: string | null;
  amount: string;
  quantity: number;
  category: PurchaseCategory;
  requesterName: string;
  departmentId: string;
}
