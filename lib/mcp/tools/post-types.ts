/**
 * MCP tools — custom post types (re-export).
 *
 * The post-types tool definitions live in lib/post-types/mcp-sdk-adapter.ts.
 * This module is the per-domain entry point for the dispatcher in
 * lib/mcp/server.ts and simply forwards to that adapter.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { registerPostTypeToolsOnSdk } from '@/lib/post-types/mcp-sdk-adapter';

export function registerPostTypesTools(server: McpServer, ctx: PortalMcpContext): void {
  registerPostTypeToolsOnSdk(server, ctx);
}
