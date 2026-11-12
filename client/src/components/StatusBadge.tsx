import { ROLE_LABELS, STATUS_LABELS } from '@/lib/constants';
import type { ApproverRole, RequestStatus } from '@/types';

const statusStyles: Record<RequestStatus, string> = {
  DRAFT: 'bg-canvas text-ink-muted ring-1 ring-line',
  PENDING_APPROVAL: 'bg-warning-50 text-warning-600',
  APPROVED: 'bg-success-50 text-success-600',
  REJECTED: 'bg-danger-50 text-danger-600',
  CANCELLED: 'bg-canvas text-ink-subtle',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function RoleBadge({ role }: { role: ApproverRole }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
      {ROLE_LABELS[role]}
    </span>
  );
}
