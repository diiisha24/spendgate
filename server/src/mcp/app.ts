import type { Express, Request, Response } from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from '../config/env.js';
import type { ActionContext } from '../types/context.js';
import { requireBearerToken, requirePathSecret } from './auth.js';
import { rateLimit } from './rateLimit.js';
import { MCP_SERVER_INFO, createMcpServer } from './server.js';

/**
 * Caller identity and permissions come from server configuration, never from
 * the MCP request. One shared token = one client identity in this MVP.
 */
export const mcpContext: ActionContext = Object.freeze({
  channel: 'mcp',
  clientName: env.MCP_CLIENT_NAME,
  allowedApproverRoles: env.MCP_APPROVER_ROLES,
});

interface McpAppOptions {
  /** Express "trust proxy" setting, so rate limiting sees the real client IP. */
  trustProxy: boolean | number | string;
}

/**
 * Builds the MCP Express app (Streamable HTTP, stateless). It is a separate
 * app from the REST API: it can run as its own process (src/mcp/index.ts) or
 * be co-hosted with the API behind one port (src/production.ts).
 *
 *   POST /mcp            - Authorization: Bearer <MCP_AUTH_TOKEN>
 *   POST /mcp/:secret    - secret-URL variant for clients without header support
 *   GET  /mcp/health     - liveness (no auth, no data)
 */
export function createMcpApp({ trustProxy }: McpAppOptions): Express {
  // Host header allow-list (DNS-rebinding protection) incl. tunnel / hosting hostnames.
  const allowedHosts = [
    '127.0.0.1',
    'localhost',
    '[::1]',
    ...env.MCP_ALLOWED_HOSTS,
    ...(env.RENDER_EXTERNAL_HOSTNAME ? [env.RENDER_EXTERNAL_HOSTNAME] : []),
  ];
  const app = createMcpExpressApp({ host: env.MCP_HOST, allowedHosts });

  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  const health = (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: MCP_SERVER_INFO.name, version: MCP_SERVER_INFO.version });
  };
  app.get('/health', health); // standalone process (Phase 1 URL)
  app.get('/mcp/health', health); // co-hosted deployments

  const handleMcpRequest = async (req: Request, res: Response): Promise<void> => {
    // Stateless: a fresh server + transport per request avoids cross-client
    // request-ID collisions and keeps horizontal scaling simple.
    const server = createMcpServer(mcpContext);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[mcp] request failed:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  };

  // Stateless mode offers no server-initiated SSE stream or sessions;
  // per the MCP spec, GET/DELETE are answered with 405.
  const methodNotAllowed = (_req: Request, res: Response): void => {
    res
      .status(405)
      .set('Allow', 'POST')
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  };

  const limiter = rateLimit(env.MCP_RATE_LIMIT_PER_MINUTE);

  app.post('/mcp', limiter, requireBearerToken, handleMcpRequest);
  app.post('/mcp/:secret', limiter, requirePathSecret, handleMcpRequest);
  // GET /mcp/health is registered above, so it takes precedence over this route.
  app.get(['/mcp', '/mcp/:secret'], methodNotAllowed);
  app.delete(['/mcp', '/mcp/:secret'], methodNotAllowed);

  return app;
}
