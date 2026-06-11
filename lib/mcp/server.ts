/**
 * MCP server bootstrap.
 *
 * `buildMcpServer(ctx)` constructs an McpServer scoped to the authenticated
 * portal client and walks the per-domain registrar list to compose the full
 * tool catalogue. Each registrar lives under `lib/mcp/tools/<domain>.ts` and
 * is responsible for guarding its own tools with `hasScope(ctx.scopes, ...)`.
 *
 * History: this module used to inline ~6300 LOC of `server.registerTool(...)`
 * blocks. The 2026 refactor extracted them into one file per domain so that
 *   - adding a tool is a one-domain change instead of editing the monolith
 *   - the visible surface of the server file is the dispatch policy
 *   - the per-feature adapters that already lived in `lib/<feature>/mcp-*.ts`
 *     are first-class citizens of the same registry
 *
 * The list of expected tool names is locked in by
 * `tests/unit/mcp-tool-registry-baseline.test.ts` — that test
 * fails if any registration drifts.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { allToolRegistrars } from './tools';

export function buildMcpServer(ctx: PortalMcpContext): McpServer {
  const server = new McpServer(
    { name: 'simplerdevelopment-portal', version: '0.1.0' },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: `You are connected to the SimplerDevelopment portal for client "${ctx.client.company ?? `#${ctx.client.id}`}" (id ${ctx.client.id}). Use these tools to manage projects, tickets, CRM, content, media, websites, and email campaigns. All operations are automatically scoped to this client.`,
    },
  );

  // Walk the per-domain registrars in the order declared by the barrel.
  // Each registrar applies its own `hasScope(ctx.scopes, ...)` gate, so a
  // narrowly-scoped key still produces a trimmed registry without any extra
  // logic at the dispatcher level.
  for (const register of allToolRegistrars) {
    register(server, ctx);
  }

  return server;
}
