import type { Request, Response } from 'express';
import * as approvals from '../services/approval.service.js';
import { approveSchema, listApprovalsSchema, rejectSchema } from '../validation/approval.schemas.js';
import { idParam } from '../validation/common.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listApprovalsSchema.parse(req.query);
  res.json(await approvals.listApprovals(query));
}

export async function approve(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const input = approveSchema.parse(req.body);
  res.json(await approvals.approveRequest(id, input));
}

export async function reject(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const input = rejectSchema.parse(req.body);
  res.json(await approvals.rejectRequest(id, input));
}
