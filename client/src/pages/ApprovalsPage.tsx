import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApprovalDialog, type ApprovalTarget } from '@/components/ApprovalDialog';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { RoleBadge } from '@/components/StatusBadge';
import { Button, EmptyState, ErrorState, LoadingState, Pagination } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApiQuery';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { ApprovalListItem, ApprovalStatus } from '@/types';

const TABS: { status: ApprovalStatus; label: string }[] = [
  { status: 'PENDING', label: 'Pending' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'REJECTED', label: 'Rejected' },
];
const PAGE_SIZE = 10;

export function ApprovalsPage() {
  const [tab, setTab] = useState<ApprovalStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ target: ApprovalTarget; mode: 'approve' | 'reject' } | null>(null);

  useEffect(() => setPage(1), [tab]);

  const { data, error, loading, refreshing, reload } = useApiQuery(
    (signal) => api.listApprovals({ status: tab, page, pageSize: PAGE_SIZE }, signal),
    [tab, page],
  );

  const open = (item: ApprovalListItem, mode: 'approve' | 'reject') =>
    setDialog({
      mode,
      target: {
        approvalId: item.id,
        reference: item.request.reference,
        title: item.request.title,
        amount: item.request.amount,
        approverRole: item.approverRole,
      },
    });

  return (
    <>
      <PageHeader title="Approvals" description="Review and act on requests awaiting a decision." />

      <div className="mb-4 inline-flex rounded-lg border border-line bg-surface p-1 shadow-card" role="tablist">
        {TABS.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={tab === status}
            onClick={() => setTab(status)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === status ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <div className="-mx-5 -my-5">
          {loading && <LoadingState label="Loading approvals…" />}
          {error && (
            <div className="p-5">
              <ErrorState message={error} onRetry={reload} />
            </div>
          )}
          {data && data.items.length === 0 && (
            <EmptyState
              title={tab === 'PENDING' ? 'All caught up' : `No ${tab.toLowerCase()} requests`}
              description={
                tab === 'PENDING'
                  ? 'There are no requests waiting for approval.'
                  : 'Decisions will appear here once requests are processed.'
              }
            />
          )}
          {data && data.items.length > 0 && (
            <>
              <ul className={`divide-y divide-line transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
                {data.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <Link
                        to={`/purchase-requests/${item.request.id}`}
                        className="text-sm font-medium text-ink hover:text-brand-700"
                      >
                        {item.request.title}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {item.request.reference} · {item.request.requesterName} · {item.request.department.name}
                      </p>
                      {item.status !== 'PENDING' && (
                        <p className="mt-1 text-xs text-ink-muted">
                          {item.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {item.approverName}
                          {item.decidedAt && ` on ${formatDateTime(item.decidedAt)}`}
                          {item.comments && (
                            <span className="block text-ink-subtle">
                              {item.status === 'REJECTED' ? 'Reason' : 'Comment'}: {item.comments}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <RoleBadge role={item.approverRole} />
                      <span className="min-w-24 text-right text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(item.request.amount)}
                      </span>
                      {item.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" icon={<X className="size-3.5" />} onClick={() => open(item, 'reject')}>
                            Reject
                          </Button>
                          <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={() => open(item, 'approve')}>
                            Approve
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
            </>
          )}
        </div>
      </Card>

      <ApprovalDialog target={dialog?.target ?? null} mode={dialog?.mode ?? 'approve'} onClose={() => setDialog(null)} />
    </>
  );
}
