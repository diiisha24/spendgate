import type { ApproverRole } from '@prisma/client';

/**
 * Who is performing an operation and through which channel. Built by the
 * transport layer (REST controller or MCP server) from SERVER-SIDE
 * configuration - never from values supplied by the caller.
 */
export interface ActionContext {
  channel: 'web' | 'mcp';
  /** Authenticated client identity (e.g. the MCP token's configured name). */
  clientName?: string;
  /**
   * Approver roles this caller may decide on. `undefined` = unrestricted
   * (web dashboard demo, which has no authentication yet).
   */
  allowedApproverRoles?: readonly ApproverRole[];
}

/** Context for the web dashboard (demo identity, no authentication in the MVP). */
export const WEB_CONTEXT: ActionContext = Object.freeze({ channel: 'web' });
