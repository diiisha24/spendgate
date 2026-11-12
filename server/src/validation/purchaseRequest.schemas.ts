import { PurchaseCategory, PurchaseRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { pagination, personName, rupeeAmount } from './common.js';

const title = z.string().trim().min(3, 'Title must be at least 3 characters').max(120);
const description = z.string().trim().max(2000).optional().nullable();
const quantity = z.coerce.number().int().min(1).max(100_000);
const category = z.enum(PurchaseCategory);
const departmentId = z.string().trim().min(1, 'Department is required').max(64);

export const createPurchaseRequestSchema = z.object({
  title,
  description,
  amount: rupeeAmount,
  quantity: quantity.default(1),
  category,
  requesterName: personName,
  departmentId,
  /** When true, the request is submitted for approval immediately. */
  submit: z.boolean().default(false),
});

export const updatePurchaseRequestSchema = z
  .object({
    title: title.optional(),
    description,
    amount: rupeeAmount.optional(),
    quantity: quantity.optional(),
    category: category.optional(),
    requesterName: personName.optional(),
    departmentId: departmentId.optional(),
    /** Who is making the edit (recorded in the audit log). */
    performedBy: personName,
  })
  .strict();

export const submitPurchaseRequestSchema = z.object({ performedBy: personName });

export const deletePurchaseRequestSchema = z.object({ performedBy: personName });

export const listPurchaseRequestsSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(PurchaseRequestStatus).optional(),
  departmentId: z.string().trim().max(64).optional(),
  category: z.enum(PurchaseCategory).optional(),
  ...pagination,
});

export type CreatePurchaseRequestInput = z.infer<typeof createPurchaseRequestSchema>;
export type UpdatePurchaseRequestInput = z.infer<typeof updatePurchaseRequestSchema>;
export type ListPurchaseRequestsQuery = z.infer<typeof listPurchaseRequestsSchema>;
