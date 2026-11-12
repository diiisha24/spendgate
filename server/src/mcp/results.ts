import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/**
 * Successful tool result: a one-line human summary followed by JSON data,
 * plus the same data as structuredContent for clients that support it.
 */
export function toolSuccess(summary: string, data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
    structuredContent: data,
  };
}

/**
 * Converts any error into a safe tool error. Business errors (AppError) and
 * validation errors are explained to the model so it can correct itself or
 * inform the user; unexpected errors are logged server-side and replaced with
 * a generic message (no stack traces or internals leak to the client).
 */
export function toolError(error: unknown, toolName: string): CallToolResult {
  let text: string;

  if (error instanceof AppError) {
    text = `Error [${error.code}]: ${error.message}`;
    if (error.details !== undefined) text += `\nDetails: ${JSON.stringify(error.details)}`;
  } else if (error instanceof ZodError) {
    const issues = error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    text = `Error [VALIDATION_ERROR]: ${issues}`;
  } else {
    console.error(`[mcp] tool ${toolName} failed unexpectedly:`, error);
    text = 'Error [INTERNAL_ERROR]: The operation could not be completed. No changes were saved.';
  }

  return { isError: true, content: [{ type: 'text', text }] };
}

/** Wraps a tool handler with error mapping and a one-line access log (no arguments logged). */
export async function runTool(
  toolName: string,
  handler: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const started = performance.now();
  try {
    const result = await handler();
    console.log(`[mcp] ${toolName} ok (${Math.round(performance.now() - started)}ms)`);
    return result;
  } catch (error) {
    const result = toolError(error, toolName);
    const code = error instanceof AppError ? error.code : error instanceof ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    console.log(`[mcp] ${toolName} error ${code} (${Math.round(performance.now() - started)}ms)`);
    return result;
  }
}
