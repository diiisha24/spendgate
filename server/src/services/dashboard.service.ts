import { approvalThresholds } from '../config/approvalRules.js';
import { prisma } from '../database/prisma.js';
import { toMoneyDto } from '../lib/money.js';
import { listDepartmentBudgets, toDepartmentBudgetDto } from './budget.service.js';
import { purchaseRequestInclude, toPurchaseRequestDto } from './dto.js';

const RECENT_REQUESTS_LIMIT = 5;

/** All dashboard figures are computed server-side from the database. */
export async function getDashboardSummary() {
  const [budgets, pendingApprovals, recent, statusCounts] = await Promise.all([
    listDepartmentBudgets(),
    prisma.approval.count({ where: { status: 'PENDING' } }),
    prisma.purchaseRequest.findMany({
      include: purchaseRequestInclude,
      orderBy: { createdAt: 'desc' },
      take: RECENT_REQUESTS_LIMIT,
    }),
    prisma.purchaseRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const totals = budgets.reduce(
    (acc, budget) => ({
      allocated: acc.allocated + budget.allocatedMinor,
      committed: acc.committed + budget.committedMinor,
      pending: acc.pending + budget.pendingMinor,
      approved: acc.approved + budget.approvedMinor,
    }),
    { allocated: 0n, committed: 0n, pending: 0n, approved: 0n },
  );

  return {
    totals: {
      allocated: toMoneyDto(totals.allocated),
      committed: toMoneyDto(totals.committed),
      pending: toMoneyDto(totals.pending),
      approved: toMoneyDto(totals.approved),
      available: toMoneyDto(totals.allocated - totals.committed),
      utilizationPercent:
        totals.allocated > 0n ? Number((totals.committed * 100n) / totals.allocated) : 0,
    },
    pendingApprovals,
    departmentCount: budgets.length,
    requestCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
    departments: budgets.map(toDepartmentBudgetDto),
    recentRequests: recent.map(toPurchaseRequestDto),
    approvalRules: {
      teamLeadBelow: toMoneyDto(approvalThresholds.teamLeadBelowMinor),
      departmentManagerUpTo: toMoneyDto(approvalThresholds.departmentManagerUpToMinor),
    },
    generatedAt: new Date().toISOString(),
  };
}
