import { ArrowRight, Clock, IndianRupee, Plus, Wallet, WalletCards } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/Card';
import { KpiCard } from '@/components/KpiCard';
import { PageHeader } from '@/components/PageHeader';
import { RoleBadge, StatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState, LoadingState, UtilizationBar } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApiQuery';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';

const linkButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-card hover:bg-brand-700';

export function OverviewPage() {
  const { data, error, loading, reload } = useApiQuery((signal) => api.dashboard(signal), []);
  const pending = useApiQuery(
    (signal) => api.listApprovals({ status: 'PENDING', pageSize: 5 }, signal),
    [],
  );

  return (
    <>
      <PageHeader
        title="Overview"
        description="Spend, budgets and approvals across your organization."
        actions={
          <Link to="/purchase-requests/new" className={linkButton}>
            <Plus className="size-4" aria-hidden="true" />
            New request
          </Link>
        }
      />

      {loading && <LoadingState label="Loading dashboard…" />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total Department Budget"
              value={formatMoney(data.totals.allocated)}
              hint={`Across ${data.departmentCount} departments`}
              icon={Wallet}
            />
            <KpiCard
              label="Committed Spend"
              value={formatMoney(data.totals.committed)}
              hint={`${data.totals.utilizationPercent}% of budget · pending + approved`}
              icon={IndianRupee}
            />
            <KpiCard
              label="Available Budget"
              value={formatMoney(data.totals.available)}
              hint="Budget minus committed spend"
              icon={WalletCards}
            />
            <KpiCard
              label="Pending Approvals"
              value={String(data.pendingApprovals)}
              hint={`${formatMoney(data.totals.pending)} awaiting decision`}
              icon={Clock}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card
              title="Recent purchase requests"
              description="Latest requests submitted by employees"
              action={
                <Link to="/purchase-requests" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  View all
                </Link>
              }
              className="xl:col-span-2"
            >
              {data.recentRequests.length === 0 ? (
                <EmptyState
                  title="No purchase requests yet"
                  description="Create the first request to see it here."
                  action={
                    <Link to="/purchase-requests/new" className={linkButton}>
                      New request
                    </Link>
                  }
                />
              ) : (
                <div className="-mx-5 -my-5 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-ink-subtle">
                        <th scope="col" className="px-5 py-3 font-medium">Request</th>
                        <th scope="col" className="px-5 py-3 font-medium">Department</th>
                        <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                        <th scope="col" className="px-5 py-3 font-medium">Status</th>
                        <th scope="col" className="px-5 py-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.recentRequests.map((request) => (
                        <tr key={request.id} className="hover:bg-canvas/60">
                          <td className="px-5 py-3">
                            <Link
                              to={`/purchase-requests/${request.id}`}
                              className="font-medium text-ink hover:text-brand-700"
                            >
                              {request.title}
                            </Link>
                            <p className="text-xs text-ink-subtle">
                              {request.reference} · {request.requesterName}
                            </p>
                          </td>
                          <td className="px-5 py-3 text-ink-muted">{request.department.name}</td>
                          <td className="px-5 py-3 text-right font-medium tabular-nums text-ink">
                            {formatMoney(request.amount)}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={request.status} />
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                            {formatDate(request.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card
              title="Department budget utilization"
              description="Committed (pending + approved) vs. allocated"
              action={
                <Link to="/budgets" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  Details
                </Link>
              }
            >
              <ul className="space-y-5">
                {data.departments.map((budget) => (
                  <li key={budget.id}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-ink">{budget.name}</span>
                      <span className="text-xs text-ink-muted">{budget.utilizationPercent}% used</span>
                    </div>
                    <div className="mt-2">
                      <UtilizationBar
                        percent={budget.utilizationPercent}
                        label={`${budget.name} budget utilization`}
                      />
                    </div>
                    <p className="mt-1.5 text-xs tabular-nums text-ink-subtle">
                      {formatMoney(budget.committed)} of {formatMoney(budget.allocated)} ·{' '}
                      {formatMoney(budget.available)} available
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card
            title="Pending approvals"
            description="Requests waiting for a decision (oldest first)"
            action={
              <Link
                to="/approvals"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Review <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            }
            className="mt-6"
          >
            {pending.loading && <LoadingState />}
            {pending.error && <ErrorState message={pending.error} onRetry={pending.reload} />}
            {pending.data && pending.data.items.length === 0 && (
              <EmptyState title="All caught up" description="There are no requests awaiting approval." />
            )}
            {pending.data && pending.data.items.length > 0 && (
              <ul className="-my-3 divide-y divide-line">
                {pending.data.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/purchase-requests/${item.request.id}`}
                        className="block truncate text-sm font-medium text-ink hover:text-brand-700"
                      >
                        {item.request.title}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {item.request.reference} · {item.request.requesterName} · {item.request.department.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <RoleBadge role={item.approverRole} />
                      <span className="text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(item.request.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
