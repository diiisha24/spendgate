import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/** Works with both the root client and an interactive-transaction client. */
export type DbClient = Prisma.TransactionClient;

/**
 * Runs `fn` in a transaction that takes SQLite's write lock up front.
 *
 * Prisma opens SQLite transactions as DEFERRED, so two concurrent
 * transactions could both read the same "available budget" before either
 * writes. A no-op UPDATE as the first statement acquires the RESERVED lock
 * immediately, serializing writers across processes (REST API + MCP server)
 * so every budget check sees the latest committed state.
 */
export function withWriteTransaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`UPDATE "Department" SET "name" = "name" WHERE 1 = 0`;
      return fn(tx);
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}
