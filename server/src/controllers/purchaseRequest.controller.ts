import type { Request, Response } from 'express';
import * as purchaseRequests from '../services/purchaseRequest.service.js';
import { idParam } from '../validation/common.js';
import {
  createPurchaseRequestSchema,
  deletePurchaseRequestSchema,
  listPurchaseRequestsSchema,
  submitPurchaseRequestSchema,
  updatePurchaseRequestSchema,
} from '../validation/purchaseRequest.schemas.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listPurchaseRequestsSchema.parse(req.query);
  res.json(await purchaseRequests.listPurchaseRequests(query));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json(await purchaseRequests.getPurchaseRequest(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createPurchaseRequestSchema.parse(req.body);
  res.status(201).json(await purchaseRequests.createPurchaseRequest(input));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const input = updatePurchaseRequestSchema.parse(req.body);
  res.json(await purchaseRequests.updatePurchaseRequest(id, input));
}

export async function submit(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const { performedBy } = submitPurchaseRequestSchema.parse(req.body);
  res.json(await purchaseRequests.submitPurchaseRequest(id, performedBy));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const { performedBy } = deletePurchaseRequestSchema.parse(req.body ?? {});
  await purchaseRequests.deletePurchaseRequest(id, performedBy);
  res.status(204).end();
}
