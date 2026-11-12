import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Loads and validates environment configuration.
 *
 * The single `.env` file lives at the monorepo root (spendgate/.env) so that
 * the Prisma CLI, the REST API and the MCP server all share one source of
 * truth. This file resolves to the root from both `src/` (tsx) and `dist/`
 * (compiled) because both sit at server/<dir>/config/.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(currentDir, '../../../.env');

dotenv.config({ path: rootEnvPath, quiet: true });

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: csv.default(['http://localhost:5173', 'http://127.0.0.1:5173']),
  MCP_HOST: z.string().min(1).default('127.0.0.1'),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  // Approval routing thresholds in whole rupees (see config/approvalRules.ts).
  APPROVAL_TEAM_LEAD_BELOW: z.coerce.number().int().positive().default(10_000),
  APPROVAL_DEPARTMENT_MANAGER_UP_TO: z.coerce.number().int().positive().default(50_000),

  // --- MCP security (see src/mcp/auth.ts) ---
  /** Shared secret for MCP clients. Required unless bound to loopback in development. */
  MCP_AUTH_TOKEN: z
    .string()
    .trim()
    .min(32, 'MCP_AUTH_TOKEN must be at least 32 characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Identity recorded in the audit log for actions taken through MCP. */
  MCP_CLIENT_NAME: z.string().trim().min(2).max(60).default('Claude MCP'),
  /** Approver roles the MCP client may decide on (server-side authorization). */
  MCP_APPROVER_ROLES: csv
    .pipe(z.array(z.enum(['TEAM_LEAD', 'DEPARTMENT_MANAGER', 'FINANCE_MANAGER'])))
    .default(['TEAM_LEAD', 'DEPARTMENT_MANAGER']),
  /** Extra Host header values to accept, e.g. your tunnel hostname. */
  MCP_ALLOWED_HOSTS: csv.default([]),
  /** Simple per-IP request limit for the MCP endpoint. */
  MCP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  /** Dashboard base URL, used to give Claude clickable links to records. */
  DASHBOARD_URL: z.string().url().optional(),

  // --- Single-port production hosting (src/production.ts) ---
  /** Port injected by the hosting platform (e.g. Render). Falls back to API_PORT. */
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  /** Public hostname / URL set automatically by Render. */
  RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  /** Create fictional sample requests on startup when the database is empty. */
  SEED_DEMO_DATA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  DASHBOARD_URL: parsed.data.DASHBOARD_URL ?? parsed.data.RENDER_EXTERNAL_URL ?? 'http://localhost:5173',
});

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
export const isMcpLoopback = LOOPBACK_HOSTS.has(env.MCP_HOST);

// Prisma Client reads DATABASE_URL from process.env; make sure the validated
// (or defaulted) value is visible to it.
process.env.DATABASE_URL = env.DATABASE_URL;

export const isProduction = env.NODE_ENV === 'production';

export type Env = typeof env;
