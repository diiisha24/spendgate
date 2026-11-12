import type { Request, Response } from 'express';
import { listAuditLogs } from '../services/audit.service.js';
import { listDepartmentBudgets, toDepartmentBudgetDto } from '../services/budget.service.js';
import { getDashboardSummary } from '../services/dashboard.service.js';
import { listAuditLogsSchema } from '../validation/auditLog.schemas.js';

export async function departments(_req: Request, res: Response): Promise<void> {
  const budgets = await listDepartmentBudgets();
  res.json({ items: budgets.map(toDepartmentBudgetDto) });
}

export async function dashboard(_req: Request, res: Response): Promise<void> {
  res.json(await getDashboardSummary());
}

export async function auditLogs(req: Request, res: Response): Promise<void> {
  const query = listAuditLogsSchema.parse(req.query);
  res.json(await listAuditLogs(query));
}
