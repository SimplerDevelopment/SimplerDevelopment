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
import { reachableOf } from '../client-scope';

export function registerMetaTools(server: McpServer, ctx: PortalMcpContext): void {

  // ── META ───────────────────────────────────────────────────────────────
  // Capture the roster at registration time: inside a tool call `ctx.client` is
  // the call's target, so reading it here would report whichever company the
  // whoami call itself named rather than the whole roster.
  const reachable = reachableOf(ctx);
  const defaultClient = ctx.client;

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'Return the authenticated portal user, every company they can act for, and the granted scopes. Call this when you need to know which clientId to pass.',
      inputSchema: {},
    },
    async () => {
      return json({
        userId: ctx.userId,
        // `client` is kept for callers written against the single-client shape.
        client: { id: defaultClient.id, company: defaultClient.company },
        defaultClientId: defaultClient.id,
        clients: reachable.map((r) => ({ id: r.client.id, company: r.client.company, role: r.role })),
        scopes: ctx.scopes,
      });
    }
  );
}
