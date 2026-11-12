import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { apiRouter } from './routes/index.js';

interface AppOptions {
  /**
   * Absolute path to the built React dashboard (client/dist). When set, the
   * app also serves the dashboard with an SPA fallback (single-port hosting).
   */
  clientDir?: string;
}

/** Builds the Express REST application (no network binding here). */
export function createApp({ clientDir }: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // The dashboard loads the Inter font from Google Fonts.
          'style-src': ["'self'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, server-to-server) with no Origin header.
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRouter);

  if (clientDir) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    // SPA fallback: client-side routes (e.g. /approvals) get index.html.
    app.get(/^\/(?!api\/|mcp(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
