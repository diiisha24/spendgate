import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState, UtilizationBar } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApiQuery';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

export function BudgetsPage() {
  const { data, error, loading, reload } = useApiQuery((signal) => api.dashboard(signal), []);

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Department allocations, commitments and remaining budget. Pending and approved requests count as committed."
      />

      {loading && <LoadingState label="Loading budgets…" />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}

      {data && data.departments.length === 0 && (
        <Card>
          <EmptyState title="No departments configured" description="Run the seed script to create departments." />
        </Card>
      )}

      {data && data.departments.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.departments.map((budget) => (
              <Card key={budget.id}>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-ink">{budget.name}</h2>
                  <span className="text-xs text-ink-muted">{budget.utilizationPercent}% used</span>
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-ink">
                  {formatMoney(budget.available)}
                </p>
                <p className="text-xs text-ink-subtle">available of {formatMoney(budget.allocated)}</p>
                <div className="mt-4">
                  <UtilizationBar percent={budget.utilizationPercent} label={`${budget.name} utilization`} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-warning-50 px-3 py-2">
                    <dt className="text-warning-600">Pending ({budget.pendingCount})</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-ink">{formatMoney(budget.pending)}</dd>
                  </div>
                  <div className="rounded-lg bg-success-50 px-3 py-2">
                    <dt className="text-success-600">Approved ({budget.approvedCount})</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-ink">{formatMoney(budget.approved)}</dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>

          <Card title="Budget summary" className="mt-6">
            <div className="-mx-5 -my-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-subtle">
                    <th scope="col" className="px-5 py-3 font-medium">Department</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Allocated</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Pending</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Approved</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Committed</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {data.departments.map((budget) => (
                    <tr key={budget.id}>
                      <td className="px-5 py-3 font-medium text-ink">{budget.name}</td>
                      <td className="px-5 py-3 text-right text-ink-muted">{formatMoney(budget.allocated)}</td>
                      <td className="px-5 py-3 text-right text-ink-muted">{formatMoney(budget.pending)}</td>
                      <td className="px-5 py-3 text-right text-ink-muted">{formatMoney(budget.approved)}</td>
                      <td className="px-5 py-3 text-right text-ink">{formatMoney(budget.committed)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-ink">{formatMoney(budget.available)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-canvas/60 font-semibold tabular-nums">
                    <td className="px-5 py-3 text-ink">Total</td>
                    <td className="px-5 py-3 text-right text-ink">{formatMoney(data.totals.allocated)}</td>
                    <td className="px-5 py-3 text-right text-ink">{formatMoney(data.totals.pending)}</td>
                    <td className="px-5 py-3 text-right text-ink">{formatMoney(data.totals.approved)}</td>
                    <td className="px-5 py-3 text-right text-ink">{formatMoney(data.totals.committed)}</td>
                    <td className="px-5 py-3 text-right text-ink">{formatMoney(data.totals.available)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card title="Approval routing rules" className="mt-6">
            <ul className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <li className="rounded-lg bg-canvas px-4 py-3">
                <p className="font-medium text-ink">Team Lead</p>
                <p className="text-xs text-ink-muted">Below {formatMoney(data.approvalRules.teamLeadBelow)}</p>
              </li>
              <li className="rounded-lg bg-canvas px-4 py-3">
                <p className="font-medium text-ink">Department Manager</p>
                <p className="text-xs text-ink-muted">
                  {formatMoney(data.approvalRules.teamLeadBelow)} to {formatMoney(data.approvalRules.departmentManagerUpTo)}
                </p>
              </li>
              <li className="rounded-lg bg-canvas px-4 py-3">
                <p className="font-medium text-ink">Finance Manager</p>
                <p className="text-xs text-ink-muted">Above {formatMoney(data.approvalRules.departmentManagerUpTo)}</p>
              </li>
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
