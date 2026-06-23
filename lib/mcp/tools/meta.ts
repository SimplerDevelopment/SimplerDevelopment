/**
 * MCP tools — meta.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. Hosts the
 * unscoped `whoami` tool. Read-only context documents (block schema, brand
 * profile, capabilities) live in `./resources.ts`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { json } from '../types';

export function registerMetaTools(server: McpServer, ctx: PortalMcpContext): void {

  // ── META ───────────────────────────────────────────────────────────────
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Return the authenticated portal user and client context.',
      inputSchema: {},
    },
    async () => {
      return json({
        userId: ctx.userId,
        client: { id: ctx.client.id, company: ctx.client.company },
        scopes: ctx.scopes,
      });
    }
  );
}
