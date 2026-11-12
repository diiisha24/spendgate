import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';

async function main(): Promise<void> {
  await connectDatabase();
  console.log('[db] connected');

  const app = createApp();
  // Express 5 also invokes this callback with an error; the 'error' handler reports it.
  const server: Server = app.listen(env.API_PORT, env.API_HOST, (error?: Error) => {
    if (error) return;
    console.log(`[api] SpendGate API listening on http://${env.API_HOST}:${env.API_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `[api] Port ${env.API_PORT} is already in use - another SpendGate API is probably running. ` +
          'Stop it, or set a different API_PORT.',
      );
    } else {
      console.error('[api] failed to start:', error);
    }
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => {
      disconnectDatabase()
        .catch((error: unknown) => console.error('[db] disconnect failed:', error))
        .finally(() => process.exit(0));
    });
    // Force exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(async (error: unknown) => {
  console.error('[api] fatal startup error:', error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
