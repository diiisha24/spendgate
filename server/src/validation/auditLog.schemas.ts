import { AuditAction, AuditEntityType } from '@prisma/client';
import { z } from 'zod';
import { pagination } from './common.js';

export const listAuditLogsSchema = z.object({
  entityType: z.enum(AuditEntityType).optional(),
  entityId: z.string().trim().max(64).optional(),
  action: z.enum(AuditAction).optional(),
  ...pagination,
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsSchema>;
