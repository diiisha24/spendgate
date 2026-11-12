import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { RoleBadge, StatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState, Input, LoadingState, Pagination, Select } from '@/components/ui';
import { useApiQuery, useDebouncedValue } from '@/hooks/useApiQuery';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, STATUS_OPTIONS } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import type { PurchaseCategory, RequestStatus } from '@/types';

const PAGE_SIZE = 10;

export function PurchaseRequestsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [departmentId, setDepartmentId] = useState('');
  const [category, setCategory] = useState<PurchaseCategory | ''>('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());

  useEffect(() => setPage(1), [debouncedSearch, status, departmentId, category]);

  const departments = useApiQuery((signal) => api.departments(signal), []);
  const requests = useApiQuery(
    (signal) =>
      api.listRequests(
        { search: debouncedSearch, status, departmentId, category, page, pageSize: PAGE_SIZE },
        signal,
      ),
    [debouncedSearch, status, departmentId, category, page],
  );

  const hasFilters = Boolean(debouncedSearch || status || departmentId || category);

  return (
    <>
      <PageHeader
        title="Purchase Requests"
        description="Create, track and manage employee purchase requests."
        actions={
          <Link
            to="/purchase-requests/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-card hover:bg-brand-700"
          >
            <Plus className="size-4" aria-hidden="true" />
            New request
          </Link>
        }
      />

      <Card>
        <div className="-mx-5 -mt-5 grid grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, reference, requester"
              aria-label="Search purchase requests"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as RequestStatus | '')}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.data?.items.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value as PurchaseCategory | '')}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="-mx-5 -mb-5">
          {requests.loading && <LoadingState label="Loading requests…" />}
          {requests.error && (
            <div className="p-5">
              <ErrorState message={requests.error} onRetry={requests.reload} />
            </div>
          )}
          {requests.data && requests.data.items.length === 0 && (
            <EmptyState
              title={hasFilters ? 'No matching requests' : 'No purchase requests yet'}
              description={
                hasFilters
                  ? 'Try adjusting your search or filters.'
                  : 'Create your first purchase request to get started.'
              }
            />
          )}
          {requests.data && requests.data.items.length > 0 && (
            <>
              <div className={`overflow-x-auto transition-opacity ${requests.refreshing ? 'opacity-60' : ''}`}>
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-subtle">
                      <th scope="col" className="px-5 py-3 font-medium">Request</th>
                      <th scope="col" className="px-5 py-3 font-medium">Department</th>
                      <th scope="col" className="px-5 py-3 font-medium">Category</th>
                      <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                      <th scope="col" className="px-5 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3 font-medium">Approver</th>
                      <th scope="col" className="px-5 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {requests.data.items.map((request) => (
                      <tr
                        key={request.id}
                        className="cursor-pointer hover:bg-canvas/60"
                        onClick={() => navigate(`/purchase-requests/${request.id}`)}
                      >
                        <td className="px-5 py-3">
                          <Link
                            to={`/purchase-requests/${request.id}`}
                            className="font-medium text-ink hover:text-brand-700"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {request.title}
                          </Link>
                          <p className="text-xs text-ink-subtle">
                            {request.reference} · {request.requesterName}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-ink-muted">{request.department.name}</td>
                        <td className="px-5 py-3 text-ink-muted">{CATEGORY_LABELS[request.category]}</td>
                        <td className="px-5 py-3 text-right font-medium tabular-nums text-ink">
                          {formatMoney(request.amount)}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={request.status} />
                        </td>
                        <td className="px-5 py-3">
                          {request.approval ? (
                            <RoleBadge role={request.approval.approverRole} />
                          ) : (
                            <span className="text-xs text-ink-subtle">Not submitted</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                          {formatDate(request.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={requests.data.page}
                pageSize={requests.data.pageSize}
                total={requests.data.total}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
