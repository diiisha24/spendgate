import type { Prisma, PurchaseRequestStatus } from '@prisma/client';
import { APPROVER_ROLE_LABELS, resolveApproverRole } from '../config/approvalRules.js';
import { prisma } from '../database/prisma.js';
import { type DbClient, withWriteTransaction } from '../database/transaction.js';
import { AppError } from '../lib/errors.js';
import { toMajorString, toMinorUnits } from '../lib/money.js';
import type {
  CreatePurchaseRequestInput,
  ListPurchaseRequestsQuery,
  UpdatePurchaseRequestInput,
} from '../validation/purchaseRequest.schemas.js';
import { type ActionContext, WEB_CONTEXT } from '../types/context.js';
import { type AuditLogDto, recordAudit, toAuditLogDto } from './audit.service.js';
import { assertWithinBudget } from './budget.service.js';
import {
  type PurchaseRequestDto,
  type PurchaseRequestWithRelations,
  purchaseRequestInclude,
  toPurchaseRequestDto,
} from './dto.js';

/** Statuses in which a request may still be edited by the requester. */
const EDITABLE_STATUSES = new Set<PurchaseRequestStatus>(['DRAFT', 'PENDING_APPROVAL']);

/** Identical requests created within this window are treated as duplicates. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const REFERENCE_PREFIX = 'PR-';
const FIRST_REFERENCE_NUMBER = 100001;

/**
 * Next sequential reference ("PR-100001"). Fixed-width numbers keep
 * lexical order equal to numeric order. Must run inside a write transaction.
 */
async function nextReference(tx: DbClient): Promise<string> {
  const latest = await tx.purchaseRequest.findFirst({
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const lastNumber = latest ? Number(latest.reference.slice(REFERENCE_PREFIX.length)) : 0;
  const next = Math.max(lastNumber + 1, FIRST_REFERENCE_NUMBER);
  return `${REFERENCE_PREFIX}${next}`;
}

async function loadRequest(db: DbClient, id: string): Promise<PurchaseRequestWithRelations> {
  const request = await db.purchaseRequest.findUnique({
    where: { id },
    include: purchaseRequestInclude,
  });
  if (!request) throw AppError.notFound('Purchase request not found');
  return request;
}

/**
 * Moves a DRAFT request to PENDING_APPROVAL: validates budget, routes the
 * approval and writes the audit record. Caller must provide a write transaction.
 */
async function submitWithinTransaction(
  tx: DbClient,
  request: PurchaseRequestWithRelations,
  performedBy: string,
  context: ActionContext,
): Promise<void> {
  if (request.status !== 'DRAFT') {
    throw AppError.conflict(
      `Request ${request.reference} has already been submitted (status: ${request.status})`,
      { status: request.status },
      'ALREADY_SUBMITTED',
    );
  }

  const { availableMinor } = await assertWithinBudget(tx, request.departmentId, request.amount);
  const approverRole = resolveApproverRole(request.amount);

  // Conditional transition guards against duplicate submissions.
  const transitioned = await tx.purchaseRequest.updateMany({
    where: { id: request.id, status: 'DRAFT' },
    data: { status: 'PENDING_APPROVAL', submittedAt: new Date() },
  });
  if (transitioned.count !== 1) {
    throw AppError.conflict('Request has already been submitted', undefined, 'ALREADY_SUBMITTED');
  }

  await tx.approval.create({
    data: { purchaseRequestId: request.id, approverRole, approvalLevel: 1, status: 'PENDING' },
  });

  await recordAudit(tx, {
    entityType: 'PURCHASE_REQUEST',
    entityId: request.id,
    action: 'SUBMITTED',
    performedBy,
    context,
    details: {
      reference: request.reference,
      amount: toMajorString(request.amount),
      routedTo: APPROVER_ROLE_LABELS[approverRole],
      availableBudgetBefore: toMajorString(availableMinor),
      availableBudgetAfter: toMajorString(availableMinor - request.amount),
    },
  });
}

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
  context: ActionContext = WEB_CONTEXT,
): Promise<PurchaseRequestDto> {
  const amountMinor = toMinorUnits(input.amount);

  const id = await withWriteTransaction(async (tx) => {
    const department = await tx.department.findUnique({ where: { id: input.departmentId } });
    if (!department) throw AppError.badRequest('Department not found', { departmentId: input.departmentId });

    // Duplicate protection (double-clicks, client retries).
    const duplicate = await tx.purchaseRequest.findFirst({
      where: {
        title: input.title,
        requesterName: input.requesterName,
        departmentId: input.departmentId,
        amount: amountMinor,
        status: { in: ['DRAFT', 'PENDING_APPROVAL'] },
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { reference: true },
    });
    if (duplicate) {
      throw AppError.conflict(
        `An identical request (${duplicate.reference}) was just created`,
        { reference: duplicate.reference },
        'DUPLICATE_REQUEST',
      );
    }

    const created = await tx.purchaseRequest.create({
      data: {
        reference: await nextReference(tx),
        title: input.title,
        description: input.description || null,
        amount: amountMinor,
        quantity: input.quantity,
        category: input.category,
        requesterName: input.requesterName,
        departmentId: input.departmentId,
        status: 'DRAFT',
      },
      include: purchaseRequestInclude,
    });

    await recordAudit(tx, {
      entityType: 'PURCHASE_REQUEST',
      entityId: created.id,
      action: 'CREATED',
      performedBy: input.requesterName,
      context,
      details: {
        reference: created.reference,
        title: created.title,
        amount: toMajorString(created.amount),
        department: department.name,
        category: created.category,
      },
    });

    // Rolls back the whole creation if the budget check fails.
    if (input.submit) {
      await submitWithinTransaction(tx, created, input.requesterName, context);
    }

    return created.id;
  });

  return toPurchaseRequestDto(await loadRequest(prisma, id));
}

export async function submitPurchaseRequest(
  id: string,
  performedBy: string,
  context: ActionContext = WEB_CONTEXT,
): Promise<PurchaseRequestDto> {
  await withWriteTransaction(async (tx) => {
    const request = await loadRequest(tx, id);
    await submitWithinTransaction(tx, request, performedBy, context);
  });
  return toPurchaseRequestDto(await loadRequest(prisma, id));
}

type ChangeSet = Record<string, { from: unknown; to: unknown }>;

export async function updatePurchaseRequest(
  id: string,
  input: UpdatePurchaseRequestInput,
  context: ActionContext = WEB_CONTEXT,
): Promise<PurchaseRequestDto> {
  await withWriteTransaction(async (tx) => {
    const request = await loadRequest(tx, id);

    if (!EDITABLE_STATUSES.has(request.status)) {
      throw AppError.conflict(
        `Request ${request.reference} can no longer be edited (status: ${request.status})`,
        { status: request.status },
        'REQUEST_LOCKED',
      );
    }

    const data: Prisma.PurchaseRequestUncheckedUpdateInput = {};
    const changes: ChangeSet = {};

    const track = <K extends keyof typeof request>(field: K, next: (typeof request)[K] | undefined) => {
      if (next === undefined || next === request[field]) return;
      (data as Record<string, unknown>)[field as string] = next;
      changes[field as string] = { from: request[field], to: next };
    };

    track('title', input.title);
    track('quantity', input.quantity);
    track('category', input.category);
    track('requesterName', input.requesterName);
    track('departmentId', input.departmentId);
    if (input.description !== undefined) track('description', input.description || null);

    const newAmount = input.amount !== undefined ? toMinorUnits(input.amount) : request.amount;
    if (newAmount !== request.amount) {
      data.amount = newAmount;
      changes.amount = { from: toMajorString(request.amount), to: toMajorString(newAmount) };
    }

    if (Object.keys(changes).length === 0) return; // nothing to do, no audit noise

    const targetDepartmentId = (data.departmentId as string | undefined) ?? request.departmentId;
    if (data.departmentId) {
      const exists = await tx.department.findUnique({ where: { id: targetDepartmentId } });
      if (!exists) throw AppError.badRequest('Department not found', { departmentId: targetDepartmentId });
    }

    let rerouted: { from: string; to: string } | undefined;

    if (request.status === 'PENDING_APPROVAL') {
      // Re-validate against the (possibly new) department, excluding this
      // request's own previously committed amount.
      await assertWithinBudget(tx, targetDepartmentId, newAmount, request.id);

      const pendingApproval = request.approvals.find((approval) => approval.status === 'PENDING');
      const newRole = resolveApproverRole(newAmount);
      if (pendingApproval && pendingApproval.approverRole !== newRole) {
        await tx.approval.update({ where: { id: pendingApproval.id }, data: { approverRole: newRole } });
        rerouted = {
          from: APPROVER_ROLE_LABELS[pendingApproval.approverRole],
          to: APPROVER_ROLE_LABELS[newRole],
        };
      }
    }

    // Conditional update: fails if status changed concurrently (e.g. approved).
    const updated = await tx.purchaseRequest.updateMany({
      where: { id, status: request.status },
      data,
    });
    if (updated.count !== 1) {
      throw AppError.conflict('Request was modified by another operation', undefined, 'REQUEST_LOCKED');
    }

    await recordAudit(tx, {
      entityType: 'PURCHASE_REQUEST',
      entityId: id,
      action: 'UPDATED',
      performedBy: input.performedBy,
      context,
      details: { reference: request.reference, changes, ...(rerouted ? { rerouted } : {}) },
    });
  });

  return toPurchaseRequestDto(await loadRequest(prisma, id));
}

/** Only drafts can be deleted; submitted requests are kept for the audit trail. */
export async function deletePurchaseRequest(
  id: string,
  performedBy: string,
  context: ActionContext = WEB_CONTEXT,
): Promise<void> {
  await withWriteTransaction(async (tx) => {
    const request = await loadRequest(tx, id);
    if (request.status !== 'DRAFT') {
      throw AppError.conflict(
        'Only draft requests can be deleted',
        { status: request.status },
        'REQUEST_LOCKED',
      );
    }

    await tx.purchaseRequest.delete({ where: { id } });
    await recordAudit(tx, {
      entityType: 'PURCHASE_REQUEST',
      entityId: id,
      action: 'DELETED',
      performedBy,
      context,
      details: {
        reference: request.reference,
        title: request.title,
        amount: toMajorString(request.amount),
      },
    });
  });
}

export async function getPurchaseRequest(
  id: string,
): Promise<PurchaseRequestDto & { history: AuditLogDto[] }> {
  const request = await loadRequest(prisma, id);
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'PURCHASE_REQUEST', entityId: id },
    orderBy: { createdAt: 'desc' },
  });
  return { ...toPurchaseRequestDto(request), history: history.map(toAuditLogDto) };
}

/**
 * Normalizes user-typed references: "pr-100001", "PR100001" and "100001"
 * all become "PR-100001". Returns null if the input is not a reference.
 */
export function normalizeReference(input: string): string | null {
  const match = /^\s*(?:pr)?[-\s]?(\d{6})\s*$/i.exec(input);
  return match ? `${REFERENCE_PREFIX}${match[1]}` : null;
}

/** Resolves a human-readable reference (e.g. "PR-100001") to the request id. */
export async function resolveRequestIdByReference(reference: string): Promise<string> {
  const normalized = normalizeReference(reference);
  if (!normalized) {
    throw AppError.badRequest(
      `"${reference}" is not a valid request reference. Expected a format like PR-100001.`,
    );
  }
  const request = await prisma.purchaseRequest.findUnique({
    where: { reference: normalized },
    select: { id: true },
  });
  if (!request) throw AppError.notFound(`Purchase request ${normalized} not found`);
  return request.id;
}

export async function getPurchaseRequestByReference(reference: string) {
  return getPurchaseRequest(await resolveRequestIdByReference(reference));
}

export async function listPurchaseRequests(query: ListPurchaseRequestsQuery) {
  const search = query.search?.trim();
  const where: Prisma.PurchaseRequestWhereInput = {
    status: query.status,
    departmentId: query.departmentId || undefined,
    category: query.category,
    ...(search
      ? {
          // SQLite LIKE is case-insensitive for ASCII.
          OR: [
            { title: { contains: search } },
            { reference: { contains: search } },
            { requesterName: { contains: search } },
            { description: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, requests] = await prisma.$transaction([
    prisma.purchaseRequest.count({ where }),
    prisma.purchaseRequest.findMany({
      where,
      include: purchaseRequestInclude,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: requests.map(toPurchaseRequestDto),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
