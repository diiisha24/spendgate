import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActionContext } from '../types/context.js';
import { registerTools } from './tools.js';

export const MCP_SERVER_INFO = {
  name: 'spendgate-mcp',
  version: '0.3.0',
} as const;

const INSTRUCTIONS = [
  'SpendGate manages department budgets, employee purchase requests and their approvals (amounts in INR).',
  'Requests are identified by references like PR-100001.',
  'Use get_budget_summary before creating large requests if the user is unsure about budget.',
  'Pending and approved requests count as committed spend; available = allocated - committed.',
  'Always confirm with the user before approving, rejecting or submitting requests.',
  'Approver names are recorded as provided and are not identity-verified in this demo.',
].join(' ');

/**
 * Creates a SpendGate MCP server instance bound to an authenticated caller
 * context. Tools are thin adapters over src/services (shared with the REST
 * API). This project never calls any AI API and stores no AI API keys.
 */
export function createMcpServer(context: ActionContext): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server, context);
  return server;
}
