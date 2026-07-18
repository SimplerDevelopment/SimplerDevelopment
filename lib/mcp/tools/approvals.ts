/**
 * MCP tools — approvals (re-export).
 *
 * The approvals tool definitions live in lib/mcp/approvals.ts. This module is
 * the per-domain entry point for the dispatcher in lib/mcp/server.ts and
 * simply forwards to that module.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { registerApprovalToolsOnSdk } from '../approvals';

export function registerApprovalsTools(server: McpServer, ctx: PortalMcpContext): void {
  registerApprovalToolsOnSdk(server, ctx);
}
