import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import type { HealthReport } from '../types/api.js';

const SERVICE_NAME = 'spendgate-api';
const SERVICE_VERSION = '0.1.0';

/**
 * Builds the health report. Lives in the service layer so the MCP server can
 * reuse it later (e.g. a "ping" tool) without duplicating logic.
 */
export async function getHealthReport(): Promise<HealthReport> {
  const started = performance.now();
  let database: HealthReport['checks']['database'];

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { status: 'ok', latencyMs: Math.round(performance.now() - started) };
  } catch {
    // Do not leak driver errors or connection strings to clients.
    database = { status: 'error', message: 'Database unreachable' };
  }

  return {
    status: database.status === 'ok' ? 'ok' : 'error',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database },
  };
}
