/**
 * MCP tools — branding (re-export).
 *
 * The branding tool definitions live in lib/branding/mcp-sdk-adapter.ts —
 * this module is the per-domain entry point for the dispatcher in
 * lib/mcp/server.ts and simply forwards to that adapter.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { registerBrandingToolsOnSdk } from '@/lib/branding/mcp-sdk-adapter';

export function registerBrandingTools(server: McpServer, ctx: PortalMcpContext): void {
  registerBrandingToolsOnSdk(server, ctx);
}
