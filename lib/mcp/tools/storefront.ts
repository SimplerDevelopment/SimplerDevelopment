/**
 * MCP tools — storefront / commerce (re-export).
 *
 * The storefront tool definitions live in lib/storefront/mcp-sdk-adapter.ts.
 * This module is the per-domain entry point for the dispatcher in
 * lib/mcp/server.ts and simply forwards to that adapter.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { registerStoreToolsOnSdk } from '@/lib/storefront/mcp-sdk-adapter';

export function registerStorefrontTools(server: McpServer, ctx: PortalMcpContext): void {
  registerStoreToolsOnSdk(server, ctx);
}
