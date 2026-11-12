import type {
  ApprovalListItem,
  ApprovalStatus,
  AuditAction,
  AuditLog,
  DashboardSummary,
  DepartmentBudget,
  HealthReport,
  Paginated,
  PurchaseCategory,
  PurchaseRequest,
  PurchaseRequestDetail,
  PurchaseRequestInput,
  RequestStatus,
} from '@/types';
import { notifyDataChanged } from './events';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

/**
 * Thin fetch wrapper. The UI only renders data - all business rules
 * (budget checks, routing, status transitions) live in the backend.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the SpendGate API. Is the server running?');
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (body ?? {}) as ErrorEnvelope;
    throw new ApiError(
      response.status,
      envelope.error?.code ?? 'HTTP_ERROR',
      envelope.error?.message ?? `Request failed with status ${response.status}`,
      envelope.error?.details,
    );
  }

  return body as T;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Runs a mutation and broadcasts a data-change event so all views refresh. */
async function mutate<T>(path: string, init: RequestInit): Promise<T> {
  const result = await apiFetch<T>(path, init);
  notifyDataChanged();
  return result;
}

const json = (body: unknown): string => JSON.stringify(body);

export const api = {
  health: (signal?: AbortSignal) => apiFetch<HealthReport>('/api/health', { signal }),

  dashboard: (signal?: AbortSignal) =>
    apiFetch<DashboardSummary>('/api/dashboard/summary', { signal }),

  departments: (signal?: AbortSignal) =>
    apiFetch<{ items: DepartmentBudget[] }>('/api/departments', { signal }),

  listRequests: (
    params: {
      search?: string;
      status?: RequestStatus | '';
      departmentId?: string;
      category?: PurchaseCategory | '';
      page?: number;
      pageSize?: number;
    },
    signal?: AbortSignal,
  ) => apiFetch<Paginated<PurchaseRequest>>(`/api/purchase-requests${toQuery(params)}`, { signal }),

  getRequest: (id: string, signal?: AbortSignal) =>
    apiFetch<PurchaseRequestDetail>(`/api/purchase-requests/${encodeURIComponent(id)}`, { signal }),

  createRequest: (input: PurchaseRequestInput & { submit: boolean }) =>
    mutate<PurchaseRequest>('/api/purchase-requests', { method: 'POST', body: json(input) }),

  updateRequest: (id: string, input: Partial<PurchaseRequestInput> & { performedBy: string }) =>
    mutate<PurchaseRequest>(`/api/purchase-requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json(input),
    }),

  submitRequest: (id: string, performedBy: string) =>
    mutate<PurchaseRequest>(`/api/purchase-requests/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: json({ performedBy }),
    }),

  deleteRequest: (id: string, performedBy: string) =>
    mutate<void>(`/api/purchase-requests/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: json({ performedBy }),
    }),

  listApprovals: (
    params: { status?: ApprovalStatus; page?: number; pageSize?: number },
    signal?: AbortSignal,
  ) => apiFetch<Paginated<ApprovalListItem>>(`/api/approvals${toQuery(params)}`, { signal }),

  approve: (approvalId: string, input: { approverName: string; comments?: string }) =>
    mutate<PurchaseRequest>(`/api/approvals/${encodeURIComponent(approvalId)}/approve`, {
      method: 'POST',
      body: json(input),
    }),

  reject: (approvalId: string, input: { approverName: string; reason: string }) =>
    mutate<PurchaseRequest>(`/api/approvals/${encodeURIComponent(approvalId)}/reject`, {
      method: 'POST',
      body: json(input),
    }),

  auditLogs: (
    params: { action?: AuditAction | ''; entityId?: string; page?: number; pageSize?: number },
    signal?: AbortSignal,
  ) => apiFetch<Paginated<AuditLog>>(`/api/audit-logs${toQuery(params)}`, { signal }),
};

/** Turns any thrown value into a user-facing message. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      const first = error.details[0] as { message?: string; path?: unknown[] } | undefined;
      if (first?.message) {
        const field = first.path?.join('.');
        return field ? `${field}: ${first.message}` : first.message;
      }
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}

/** Back-compat for the Phase 1 health hook. */
export const getHealth = api.health;
