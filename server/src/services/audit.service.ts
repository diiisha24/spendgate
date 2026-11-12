import type { AuditAction, AuditEntityType, AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import type { DbClient } from '../database/transaction.js';
import type { ActionContext } from '../types/context.js';
import type { ListAuditLogsQuery } from '../validation/auditLog.schemas.js';

export interface AuditEntry {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy: string;
  details?: Record<string, unknown>;
  /** Channel / authenticated client, merged into the stored details. */
  context?: ActionContext;
}

export interface AuditLogDto {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

/** BigInt-safe JSON encoding for audit details. */
function encodeDetails(details?: Record<string, unknown>): string | null {
  if (!details) return null;
  return JSON.stringify(details, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

function decodeDetails(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

export function toAuditLogDto(log: AuditLog): AuditLogDto {
  return {
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    performedBy: log.performedBy,
    details: decodeDetails(log.details),
    createdAt: log.createdAt.toISOString(),
  };
}

/**
 * Appends an audit record. Always call with the same transaction client as
 * the change being audited so the record commits (or rolls back) with it.
 */
export async function recordAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  const context = entry.context
    ? {
        channel: entry.context.channel,
        ...(entry.context.clientName ? { client: entry.context.clientName } : {}),
        // No end-user authentication in the MVP: names are caller-supplied claims.
        identityVerified: false,
      }
    : {};

  await db.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      performedBy: entry.performedBy,
      details: encodeDetails({ ...entry.details, ...context }),
    },
  });
}

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const where: Prisma.AuditLogWhereInput = {
    entityType: query.entityType,
    entityId: query.entityId,
    action: query.action,
  };

  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  // Attach request references so the UI can show "PR-100001" instead of ids.
  const requestIds = logs
    .filter((log) => log.entityType === 'PURCHASE_REQUEST')
    .map((log) => log.entityId);
  const requests = requestIds.length
    ? await prisma.purchaseRequest.findMany({
        where: { id: { in: requestIds } },
        select: { id: true, reference: true, title: true },
      })
    : [];
  const byId = new Map(requests.map((request) => [request.id, request]));

  return {
    items: logs.map((log) => {
      const request = byId.get(log.entityId);
      return {
        ...toAuditLogDto(log),
        entity: request ? { reference: request.reference, title: request.title } : null,
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
