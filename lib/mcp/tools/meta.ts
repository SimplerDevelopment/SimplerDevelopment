/**
 * MCP tools — meta + resources.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. Hosts the
 * blocks-schema resource registration plus the unscoped `whoami` tool. Both
 * always register; nothing here is gated by a scope guard.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { json } from '../types';
import { BLOCKS_SCHEMA_REFERENCE } from '../blocks-schema';

export function registerMetaTools(server: McpServer, ctx: PortalMcpContext): void {

  // ── RESOURCES ──────────────────────────────────────────────────────────
  // Visual-editor block schema — used by AI clients to author valid `blocks`
  // arrays for posts_create / posts_update.
  server.registerResource(
    'blocks-schema',
    'blocks://schema',
    {
      title: 'Visual editor block schema',
      description:
        'Reference for the Block types accepted by posts_create and posts_update. Includes field shapes for hero, cta, stats, columns, card-grid, html-render (ACF-style fields/values/loop with template annotations data-field/data-repeat/data-group/data-loop), etc., plus worked examples.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BLOCKS_SCHEMA_REFERENCE }],
    })
  );


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
