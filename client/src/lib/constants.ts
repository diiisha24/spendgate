import type { ApproverRole, AuditAction, PurchaseCategory, RequestStatus } from '@/types';

export const CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  OFFICE_SUPPLIES: 'Office supplies',
  TRAVEL: 'Travel',
  MARKETING: 'Marketing',
  PROFESSIONAL_SERVICES: 'Professional services',
  OTHER: 'Other',
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const ROLE_LABELS: Record<ApproverRole, string> = {
  TEAM_LEAD: 'Team Lead',
  DEPARTMENT_MANAGER: 'Department Manager',
  FINANCE_MANAGER: 'Finance Manager',
};

export const ACTION_LABELS: Record<AuditAction, string> = {
  CREATED: 'Created',
  UPDATED: 'Edited',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  DELETED: 'Deleted',
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [PurchaseCategory, string][];
export const STATUS_OPTIONS = Object.entries(STATUS_LABELS).filter(
  ([status]) => status !== 'CANCELLED',
) as [RequestStatus, string][];
export const ACTION_OPTIONS = Object.entries(ACTION_LABELS).filter(
  ([action]) => action !== 'CANCELLED',
) as [AuditAction, string][];
