/**
 * MCP tools — Company Brain (re-export).
 *
 * The brain tool definitions live in lib/brain/mcp-sdk-adapter.ts. This module
 * is the per-domain entry point for the dispatcher in lib/mcp/server.ts and
 * simply forwards to that adapter.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { registerBrainToolsOnSdk } from '@/lib/brain/mcp-sdk-adapter';

export function registerBrainTools(server: McpServer, ctx: PortalMcpContext): void {
  registerBrainToolsOnSdk(server, ctx);
}
