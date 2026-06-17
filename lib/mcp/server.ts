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
import { logAgentAction, hashParams } from '@/lib/audit/agent-action-log';

export function buildMcpServer(ctx: PortalMcpContext): McpServer {
  const server = new McpServer(
    { name: 'simplerdevelopment-portal', version: '0.1.0' },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: `You are connected to the SimplerDevelopment portal for client "${ctx.client.company ?? `#${ctx.client.id}`}" (id ${ctx.client.id}). Use these tools to manage projects, tickets, CRM, content, media, websites, and email campaigns. All operations are automatically scoped to this client.`,
    },
  );

  // ── Audit-log wrapper ────────────────────────────────────────────────────
  // Shadow server.registerTool on this instance so every handler registered
  // by the per-domain registrars is automatically timed and audit-logged.
  // We intercept only the callback (third argument); name and config pass
  // through untouched so the MCP SDK sees exactly what it expects.
  //
  // Uses `unknown[]` rest args + a cast to avoid fighting the SDK's overloaded
  // generic registerTool signature while still being type-safe at the seam we
  // own (name: string, cb: the last arg).
  const originalRegisterTool = server.registerTool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (...args: unknown[]) => {
    const toolName = args[0] as string;
    // The callback is always the last argument.
    const origCb = args[args.length - 1] as (...cbArgs: unknown[]) => Promise<unknown>;

    const wrappedCb = async (...cbArgs: unknown[]): Promise<unknown> => {
      const start = Date.now();
      // First arg to the callback is the validated input object.
      const inputArg = cbArgs[0] ?? {};
      let outcome: 'success' | 'denied' | 'error' = 'success';
      let errorMessage: string | null = null;
      let callResult: unknown;

      try {
        callResult = await origCb(...cbArgs);
        // Treat a result carrying `isError: true` (MCP SDK error envelope) as error.
        if (
          callResult !== null &&
          typeof callResult === 'object' &&
          (callResult as Record<string, unknown>).isError === true
        ) {
          outcome = 'error';
          const content = (callResult as Record<string, unknown>).content;
          if (Array.isArray(content) && content.length > 0) {
            errorMessage = String((content[0] as Record<string, unknown>).text ?? '');
          }
        }
      } catch (err) {
        outcome = 'error';
        errorMessage = err instanceof Error ? err.message : String(err);
        void logAgentAction({
          clientId: ctx.client.id,
          userId: ctx.userId ?? null,
          source: 'mcp',
          tool: toolName,
          paramsHash: hashParams(inputArg),
          outcome,
          errorMessage,
          keyId: ctx.keyId ?? null,
          durationMs: Date.now() - start,
        });
        throw err;
      }

      void logAgentAction({
        clientId: ctx.client.id,
        userId: ctx.userId ?? null,
        source: 'mcp',
        tool: toolName,
        paramsHash: hashParams(inputArg),
        outcome,
        errorMessage,
        keyId: ctx.keyId ?? null,
        durationMs: Date.now() - start,
      });

      return callResult;
    };

    const wrappedArgs = [...args.slice(0, args.length - 1), wrappedCb];
    return originalRegisterTool(...(wrappedArgs as Parameters<typeof originalRegisterTool>));
  };

  // Walk the per-domain registrars in the order declared by the barrel.
  // Each registrar applies its own `hasScope(ctx.scopes, ...)` gate, so a
  // narrowly-scoped key still produces a trimmed registry without any extra
  // logic at the dispatcher level.
  for (const register of allToolRegistrars) {
    register(server, ctx);
  }

  return server;
}
