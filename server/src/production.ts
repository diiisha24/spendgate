import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { createMcpApp } from './mcp/app.js';
import { assertAuthConfig } from './mcp/auth.js';

/**
 * Single-port production entry point for platforms that expose one port per
 * service (e.g. Render). Co-hosts three things in one Node process:
 *
 *   /mcp, /mcp/*   -> MCP app (separate Express app, Streamable HTTP)
 *   /api/*         -> REST API
 *   everything else-> built React dashboard (client/dist)
 *
 * The MCP and REST apps stay independent modules; they share only the
 * service layer and the SQLite database, exactly as in local development.
 */

assertAuthConfig();

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(currentDir, '../../client/dist');

// Hosting platforms terminate TLS at one proxy hop in front of the app.
const mcpApp = createMcpApp({ trustProxy: 1 });
const restApp = createApp({ clientDir });

const root = express();
root.disable('x-powered-by');
root.set('trust proxy', 1);
root.use((req, res, next) => {
  if (req.path === '/mcp' || req.path.startsWith('/mcp/')) {
    mcpApp(req, res, next);
    return;
  }
  next();
});
root.use(restApp);

async function main(): Promise<void> {
  await connectDatabase();

  const port = env.PORT ?? env.API_PORT;
  const server = root.listen(port, env.API_HOST, (error?: Error) => {
    if (error) return;
    console.log(`[prod] SpendGate listening on http://${env.API_HOST}:${port} (dashboard, /api, /mcp)`);
  });

  server.on('error', (error) => {
    console.error('[prod] failed to start:', error);
    process.exit(1);
  });

  const shutdown = (): void => {
    server.close(() => {
      disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[prod] fatal startup error:', error);
  process.exit(1);
});
