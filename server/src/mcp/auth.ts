import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env, isMcpLoopback, isProduction } from '../config/env.js';

/**
 * Lightweight shared-secret authentication for the MCP endpoint.
 *
 * Accepted credentials (either):
 *   1. `Authorization: Bearer <MCP_AUTH_TOKEN>`   - Claude Code, Claude Desktop (mcp-remote), Inspector
 *   2. Secret URL path `/mcp/<MCP_AUTH_TOKEN>`    - for clients that cannot set headers
 *      (e.g. claude.ai custom connectors, which support only OAuth or no auth).
 *      Treat this URL like a password; it may appear in proxy logs.
 *
 * When MCP_AUTH_TOKEN is unset, the endpoint is open ONLY if bound to a
 * loopback address in development (enforced at startup by assertAuthConfig).
 */

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** Constant-time comparison (hashing first equalizes lengths). */
function tokenMatches(candidate: string | undefined): boolean {
  if (!env.MCP_AUTH_TOKEN || !candidate) return false;
  return timingSafeEqual(digest(candidate), digest(env.MCP_AUTH_TOKEN));
}

export const authEnabled = Boolean(env.MCP_AUTH_TOKEN);

/** Refuses to start an unauthenticated MCP server that could be reached remotely. */
export function assertAuthConfig(): void {
  if (authEnabled) return;
  if (!isMcpLoopback || isProduction) {
    console.error(
      '[mcp] MCP_AUTH_TOKEN is required when MCP_HOST is not a loopback address or NODE_ENV=production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
    process.exit(1);
  }
  console.warn('[mcp] WARNING: MCP_AUTH_TOKEN is not set - endpoint is unauthenticated (loopback/dev only).');
}

function unauthorized(res: Response): void {
  res
    .status(401)
    .set('WWW-Authenticate', 'Bearer realm="spendgate-mcp"')
    .json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
}

/** Middleware for `POST /mcp` (header token). */
export function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled) {
    next();
    return;
  }
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (tokenMatches(match?.[1]?.trim())) {
    next();
    return;
  }
  console.warn(`[mcp] rejected unauthenticated request from ${req.ip}`);
  unauthorized(res);
}

/** Middleware for `POST /mcp/:secret` (secret path). Disabled when no token is configured. */
export function requirePathSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = typeof req.params.secret === 'string' ? req.params.secret : undefined;
  if (authEnabled && tokenMatches(secret)) {
    next();
    return;
  }
  console.warn(`[mcp] rejected secret-path request from ${req.ip}`);
  unauthorized(res);
}
