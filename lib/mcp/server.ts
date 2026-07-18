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
import { isBrainEntitled } from '@/lib/brain/entitlement';
import { serviceDenied } from '@/lib/mcp/types';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { isHighRiskTool } from '@/lib/mcp/high-risk-tools';
import { credentialKey, checkHighRiskAnomaly, persistHighRiskCapture } from '@/lib/mcp/telemetry';

export function buildMcpServer(ctx: PortalMcpContext): McpServer {
  const server = new McpServer(
    { name: 'simplerdevelopment-portal', version: '0.1.0' },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
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
  // ── Brain paid-module entitlement gate ───────────────────────────────────
  // Scope (hasScope) verifies key permission; entitlement verifies an active
  // Brain subscription. The 100+ brain_* MCP tools guard scope but NOT
  // entitlement, so a client with a wildcard-scoped key and no Brain SKU could
  // read/write the entire Brain — the paywall bypass the REST layer already
  // closes via requireBrainEntitlement on 100% of /api/portal/brain/** routes.
  // Resolve entitlement once per request (memoized), fail closed on error, and
  // deny any brain_* CALL from an unentitled client. isBrainEntitled honors the
  // test-runtime bypass, brainTrialUntil trials, and bundle subscriptions.
  let brainEntitledPromise: Promise<boolean> | null = null;
  const brainEntitled = () =>
    // Promise.resolve().then(...) so a synchronous throw OR an async rejection
    // in the entitlement check both fail closed (deny), never leak.
    (brainEntitledPromise ??= Promise.resolve(ctx.client.id).then(isBrainEntitled).catch(() => false));

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

      // Entitlement gate: brain_* tools require an active Brain subscription,
      // independent of the key's scopes. Fail closed.
      if (toolName.startsWith('brain_') && !(await brainEntitled())) {
        void logAgentAction({
          clientId: ctx.client.id,
          userId: ctx.userId ?? null,
          source: 'mcp',
          tool: toolName,
          paramsHash: hashParams(inputArg),
          outcome: 'denied',
          errorMessage: 'brain not entitled',
          keyId: ctx.keyId ?? null,
          durationMs: Date.now() - start,
        });
        return serviceDenied('brain');
      }

      // AAF-003: per-credential rate limit + high-risk-burst anomaly signal.
      // Placed AFTER the brain-entitlement gate so a denied brain_* call
      // (which never reaches origCb) doesn't consume the caller's rate-limit
      // budget. Mirrors `wrapRegisterTool` in `./telemetry` exactly — see
      // that module for the ADR context. Fails OPEN: any error from
      // checkRateLimit allows the call through rather than blocking it.
      const cred = credentialKey(ctx);
      if (cred) {
        try {
          const allowed = await checkRateLimit(
            'mcp-tool:' + cred,
            Number(process.env.MCP_TOOL_RATE_LIMIT) || 240,
            60_000,
          );
          if (!allowed) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Rate limit exceeded: too many MCP tool calls in the last minute. Slow down and retry shortly.',
                },
              ],
              isError: true,
            };
          }
        } catch (err) {
          console.warn('[mcp] rate limit check failed, allowing call:', err);
        }

        // Detective backstop — fire-and-forget, never gates execution.
        checkHighRiskAnomaly(toolName, cred, ctx);
      }

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
        // AAF-001: durably persist the encrypted forensic capture for
        // high-risk tools even when the call threw — awaited so it commits
        // before this request ends (a fire-and-forget insert can be dropped
        // when the serverless invocation tears down right after responding).
        if (isHighRiskTool(toolName)) {
          await persistHighRiskCapture({
            clientId: ctx.client.id,
            toolName,
            keyId: ctx.keyId ?? null,
            userId: ctx.userId ?? null,
            inputArgs: inputArg,
          });
        }
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
      // AAF-001: same durable capture on the success (including logical
      // isError) path — see the catch-path comment above.
      if (isHighRiskTool(toolName)) {
        await persistHighRiskCapture({
          clientId: ctx.client.id,
          toolName,
          keyId: ctx.keyId ?? null,
          userId: ctx.userId ?? null,
          inputArgs: inputArg,
        });
      }

      return callResult;
    };

    const wrappedArgs = [...args.slice(0, args.length - 1), wrappedCb];
    // Cast to a rest-param fn: `Parameters<typeof originalRegisterTool>` collapses
    // to a non-tuple for the SDK's overloaded registerTool signature, which makes
    // the spread itself a type error. A `(...a: unknown[])` shape accepts the
    // spread cleanly while preserving the return type.
    const register = originalRegisterTool as (...a: unknown[]) => ReturnType<typeof originalRegisterTool>;
    return register(...wrappedArgs);
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
