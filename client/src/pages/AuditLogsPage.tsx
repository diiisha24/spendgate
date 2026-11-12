import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { describeAudit } from '@/components/AuditTimeline';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState, Pagination, Select } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApiQuery';
import { api } from '@/lib/api';
import { ACTION_LABELS, ACTION_OPTIONS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { AuditAction } from '@/types';

const PAGE_SIZE = 20;

const actionTone: Record<AuditAction, string> = {
  CREATED: 'bg-brand-50 text-brand-700',
  UPDATED: 'bg-canvas text-ink-muted ring-1 ring-line',
  SUBMITTED: 'bg-warning-50 text-warning-600',
  APPROVED: 'bg-success-50 text-success-600',
  REJECTED: 'bg-danger-50 text-danger-600',
  CANCELLED: 'bg-canvas text-ink-subtle',
  DELETED: 'bg-danger-50 text-danger-600',
};

export function AuditLogsPage() {
  const [action, setAction] = useState<AuditAction | ''>('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [action]);

  const { data, error, loading, refreshing, reload } = useApiQuery(
    (signal) => api.auditLogs({ action, page, pageSize: PAGE_SIZE }, signal),
    [action, page],
  );

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="An append-only history of every change in SpendGate."
        actions={
          <Select
            value={action}
            onChange={(event) => setAction(event.target.value as AuditAction | '')}
            aria-label="Filter by action"
            className="w-44"
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        }
      />

      <Card>
        <div className="-mx-5 -my-5">
          {loading && <LoadingState label="Loading audit logs…" />}
          {error && (
            <div className="p-5">
              <ErrorState message={error} onRetry={reload} />
            </div>
          )}
          {data && data.items.length === 0 && (
            <EmptyState title="No audit records" description="Activity will be recorded here as requests change." />
          )}
          {data && data.items.length > 0 && (
            <>
              <div className={`overflow-x-auto transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-subtle">
                      <th scope="col" className="px-5 py-3 font-medium">Timestamp</th>
                      <th scope="col" className="px-5 py-3 font-medium">Action</th>
                      <th scope="col" className="px-5 py-3 font-medium">Entity</th>
                      <th scope="col" className="px-5 py-3 font-medium">Performed by</th>
                      <th scope="col" className="px-5 py-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.items.map((log) => {
                      const reference = log.entity?.reference ?? (log.details?.reference as string | undefined);
                      return (
                        <tr key={log.id} className="align-top">
                          <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{formatDateTime(log.createdAt)}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionTone[log.action]}`}>
                              {ACTION_LABELS[log.action]}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {log.entity ? (
                              <Link to={`/purchase-requests/${log.entityId}`} className="font-medium text-ink hover:text-brand-700">
                                {reference}
                              </Link>
                            ) : (
                              <span className="font-medium text-ink-muted">{reference ?? log.entityId}</span>
                            )}
                            <p className="text-xs text-ink-subtle">{log.entity?.title ?? 'Purchase request'}</p>
                          </td>
                          <td className="px-5 py-3 text-ink">{log.performedBy}</td>
                          <td className="max-w-md px-5 py-3 text-xs text-ink-muted">
                            <span className="break-words">{describeAudit(log) ?? '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
