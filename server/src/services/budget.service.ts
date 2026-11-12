import type { PurchaseRequestStatus } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import type { DbClient } from '../database/transaction.js';
import { AppError } from '../lib/errors.js';
import { type MoneyDto, toMoneyDto } from '../lib/money.js';

/**
 * BUDGET RULES (single source of truth - never trust client-side numbers):
 *   committed = sum(amount) of PENDING_APPROVAL + APPROVED requests
 *   available = allocated - committed
 * DRAFT, REJECTED and CANCELLED requests do not consume budget.
 */
export const COMMITTED_STATUSES: PurchaseRequestStatus[] = ['PENDING_APPROVAL', 'APPROVED'];

export interface DepartmentBudget {
  departmentId: string;
  name: string;
  allocatedMinor: bigint;
  pendingMinor: bigint;
  approvedMinor: bigint;
  committedMinor: bigint;
  availableMinor: bigint;
  pendingCount: number;
  approvedCount: number;
}

export interface DepartmentBudgetDto {
  id: string;
  name: string;
  allocated: MoneyDto;
  pending: MoneyDto;
  approved: MoneyDto;
  committed: MoneyDto;
  available: MoneyDto;
  pendingCount: number;
  approvedCount: number;
  /** Committed as a whole-number percentage of allocated (0-100+). */
  utilizationPercent: number;
}

/** Integer percentage computed with BigInt to avoid float drift. */
function utilization(committed: bigint, allocated: bigint): number {
  if (allocated <= 0n) return 0;
  return Number((committed * 100n) / allocated);
}

export function toDepartmentBudgetDto(budget: DepartmentBudget): DepartmentBudgetDto {
  return {
    id: budget.departmentId,
    name: budget.name,
    allocated: toMoneyDto(budget.allocatedMinor),
    pending: toMoneyDto(budget.pendingMinor),
    approved: toMoneyDto(budget.approvedMinor),
    committed: toMoneyDto(budget.committedMinor),
    available: toMoneyDto(budget.availableMinor),
    pendingCount: budget.pendingCount,
    approvedCount: budget.approvedCount,
    utilizationPercent: utilization(budget.committedMinor, budget.allocatedMinor),
  };
}

/**
 * Budget summary for one department (resolved by id) or all departments,
 * with organization-wide totals.
 */
export async function getBudgetSummary(departmentId?: string) {
  const all = await listDepartmentBudgets();
  const selected = departmentId ? all.filter((budget) => budget.departmentId === departmentId) : all;

  const sum = (pick: (budget: DepartmentBudget) => bigint) =>
    selected.reduce((total, budget) => total + pick(budget), 0n);
  const allocated = sum((budget) => budget.allocatedMinor);
  const committed = sum((budget) => budget.committedMinor);

  return {
    departments: selected.map(toDepartmentBudgetDto),
    totals: {
      allocated: toMoneyDto(allocated),
      pending: toMoneyDto(sum((budget) => budget.pendingMinor)),
      approved: toMoneyDto(sum((budget) => budget.approvedMinor)),
      committed: toMoneyDto(committed),
      available: toMoneyDto(allocated - committed),
      utilizationPercent: utilization(committed, allocated),
    },
  };
}

/** Budget position for every department. */
export async function listDepartmentBudgets(db: DbClient = prisma): Promise<DepartmentBudget[]> {
  const [departments, sums] = await Promise.all([
    db.department.findMany({ orderBy: { name: 'asc' } }),
    db.purchaseRequest.groupBy({
      by: ['departmentId', 'status'],
      where: { status: { in: COMMITTED_STATUSES } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  return departments.map((department) => {
    const rows = sums.filter((row) => row.departmentId === department.id);
    const pending = rows.find((row) => row.status === 'PENDING_APPROVAL');
    const approved = rows.find((row) => row.status === 'APPROVED');
    const pendingMinor = pending?._sum.amount ?? 0n;
    const approvedMinor = approved?._sum.amount ?? 0n;
    const committedMinor = pendingMinor + approvedMinor;

    return {
      departmentId: department.id,
      name: department.name,
      allocatedMinor: department.allocatedBudget,
      pendingMinor,
      approvedMinor,
      committedMinor,
      availableMinor: department.allocatedBudget - committedMinor,
      pendingCount: pending?._count._all ?? 0,
      approvedCount: approved?._count._all ?? 0,
    };
  });
}

/**
 * Available budget for one department. `excludeRequestId` removes a request's
 * own amount from committed spend (used when editing a pending request).
 */
export async function getAvailableBudget(
  db: DbClient,
  departmentId: string,
  excludeRequestId?: string,
): Promise<{ departmentName: string; allocatedMinor: bigint; committedMinor: bigint; availableMinor: bigint }> {
  const department = await db.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    throw AppError.badRequest('Department not found', { departmentId });
  }

  const aggregate = await db.purchaseRequest.aggregate({
    where: {
      departmentId,
      status: { in: COMMITTED_STATUSES },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
    },
    _sum: { amount: true },
  });

  const committedMinor = aggregate._sum.amount ?? 0n;
  return {
    departmentName: department.name,
    allocatedMinor: department.allocatedBudget,
    committedMinor,
    availableMinor: department.allocatedBudget - committedMinor,
  };
}

/** Throws 422 BUDGET_EXCEEDED if `amountMinor` does not fit the available budget. */
export async function assertWithinBudget(
  db: DbClient,
  departmentId: string,
  amountMinor: bigint,
  excludeRequestId?: string,
): Promise<{ availableMinor: bigint }> {
  const budget = await getAvailableBudget(db, departmentId, excludeRequestId);

  if (amountMinor > budget.availableMinor) {
    throw AppError.unprocessable(
      'BUDGET_EXCEEDED',
      `Request amount exceeds the available budget for ${budget.departmentName}`,
      {
        department: budget.departmentName,
        requested: toMoneyDto(amountMinor),
        available: toMoneyDto(budget.availableMinor),
        shortfall: toMoneyDto(amountMinor - budget.availableMinor),
      },
    );
  }

  return { availableMinor: budget.availableMinor };
}
