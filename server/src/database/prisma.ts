import { PrismaClient } from '@prisma/client';
import { isProduction } from '../config/env.js';

/**
 * Single shared Prisma Client for the whole process. Both the REST API and the
 * MCP server import services that use this instance - never create ad-hoc
 * clients elsewhere.
 */
export const prisma = new PrismaClient({
  log: isProduction ? ['error'] : ['warn', 'error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  // SQLite pragmas: enforce FK constraints and use WAL for better concurrency
  // between the API and MCP processes sharing the same file.
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
