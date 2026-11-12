import { ApprovalStatus, ApproverRole } from '@prisma/client';
import { z } from 'zod';
import { pagination, personName } from './common.js';

export const approveSchema = z.object({
  approverName: personName,
  comments: z.string().trim().max(1000).optional(),
});

export const rejectSchema = z.object({
  approverName: personName,
  reason: z
    .string({ error: 'A rejection reason is required' })
    .trim()
    .min(5, 'Rejection reason must be at least 5 characters')
    .max(1000),
});

export const listApprovalsSchema = z.object({
  status: z.enum(ApprovalStatus).optional(),
  approverRole: z.enum(ApproverRole).optional(),
  ...pagination,
});

export type ApproveInput = z.infer<typeof approveSchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
export type ListApprovalsQuery = z.infer<typeof listApprovalsSchema>;
