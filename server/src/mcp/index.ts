import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../database/prisma.js';
import { createMcpApp } from './app.js';
import { assertAuthConfig, authEnabled } from './auth.js';

/**
 * Standalone MCP process for local development (separate from the Express
 * REST API, sharing the service layer and database). For a single-port
 * deployment see src/production.ts.
 */

assertAuthConfig();

// Behind a local tunnel, use X-Forwarded-For from loopback for per-client rate limiting.
const app = createMcpApp({ trustProxy: 'loopback' });

async function main(): Promise<void> {
  await connectDatabase();

  // Express 5 also invokes this callback with an error (e.g. EADDRINUSE);
  // the 'error' handler below reports it, so only log success here.
  const httpServer = app.listen(env.MCP_PORT, env.MCP_HOST, (error?: Error) => {
    if (error) return;
    console.log(`[mcp] SpendGate MCP listening on http://${env.MCP_HOST}:${env.MCP_PORT}/mcp`);
    console.log(
      `[mcp] auth: ${authEnabled ? 'bearer token / secret path' : 'DISABLED (loopback dev only)'} · ` +
        `client "${env.MCP_CLIENT_NAME}" may approve: ${env.MCP_APPROVER_ROLES.join(', ') || 'none'}`,
    );
  });

  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `[mcp] Port ${env.MCP_PORT} is already in use - another SpendGate MCP server is probably running. ` +
          'Stop it, or set a different MCP_PORT.',
      );
    } else {
      console.error('[mcp] failed to start:', error);
    }
    process.exit(1);
  });

  const shutdown = (): void => {
    httpServer.close(() => {
      disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[mcp] fatal startup error:', error);
  process.exit(1);
});
