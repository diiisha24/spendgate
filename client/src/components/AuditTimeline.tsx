import { CheckCircle2, FilePlus2, Pencil, Send, Trash2, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ACTION_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { AuditAction, AuditLog } from '@/types';

const actionIcons: Record<AuditAction, { icon: LucideIcon; className: string }> = {
  CREATED: { icon: FilePlus2, className: 'bg-brand-50 text-brand-600' },
  UPDATED: { icon: Pencil, className: 'bg-canvas text-ink-muted' },
  SUBMITTED: { icon: Send, className: 'bg-warning-50 text-warning-600' },
  APPROVED: { icon: CheckCircle2, className: 'bg-success-50 text-success-600' },
  REJECTED: { icon: XCircle, className: 'bg-danger-50 text-danger-600' },
  CANCELLED: { icon: XCircle, className: 'bg-canvas text-ink-subtle' },
  DELETED: { icon: Trash2, className: 'bg-danger-50 text-danger-600' },
};

const formatValue = (value: unknown): string =>
  value === null || value === undefined || value === '' ? '—' : String(value);

/** Human-readable one-line summary of an audit record's details. */
export function describeAudit(log: AuditLog): string | null {
  const details = log.details ?? {};
  switch (log.action) {
    case 'SUBMITTED':
      return details.routedTo ? `Routed to ${String(details.routedTo)}` : null;
    case 'REJECTED':
      return details.reason ? `Reason: ${String(details.reason)}` : null;
    case 'APPROVED':
      return details.comments ? `Comment: ${String(details.comments)}` : null;
    case 'UPDATED': {
      const changes = details.changes as Record<string, { from: unknown; to: unknown }> | undefined;
      if (!changes) return null;
      const parts = Object.entries(changes).map(
        ([field, change]) => `${field}: ${formatValue(change.from)} → ${formatValue(change.to)}`,
      );
      const rerouted = details.rerouted as { from: string; to: string } | undefined;
      if (rerouted) parts.push(`approver re-routed ${rerouted.from} → ${rerouted.to}`);
      return parts.join(' · ');
    }
    default:
      return null;
  }
}

export function AuditTimeline({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) return <p className="text-sm text-ink-muted">No activity recorded yet.</p>;

  return (
    <ol className="space-y-4">
      {logs.map((log) => {
        const { icon: Icon, className } = actionIcons[log.action];
        const summary = describeAudit(log);
        return (
          <li key={log.id} className="flex gap-3">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${className}`}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{ACTION_LABELS[log.action]}</span> by {log.performedBy}
              </p>
              {summary && <p className="mt-0.5 break-words text-xs text-ink-muted">{summary}</p>}
              <p className="mt-0.5 text-xs text-ink-subtle">{formatDateTime(log.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
