/**
 * MCP server bootstrap.
 *
 * `buildMcpServer(ctx)` constructs an McpServer for the authenticated portal
 * USER — over every company that user can act for — and walks the per-domain
 * registrar list to compose the full tool catalogue. Which company a given call
 * applies to is resolved per call; see `./client-scope.ts` for why and how.
 *
 * Each registrar lives under `lib/mcp/tools/<domain>.ts` and is responsible for
 * guarding its own tools with `hasScope(ctx.scopes, ...)`.
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
import { z } from 'zod';
import type { PortalMcpContext, ReachableClient } from '@/lib/mcp-auth';
import { allToolRegistrars } from './tools';
import { isTenantExemptTool, reachableOf, roleDenial } from './client-scope';
import { logAgentAction, hashParams } from '@/lib/audit/agent-action-log';
import { isBrainEntitled } from '@/lib/brain/entitlement';
import { serviceDenied } from '@/lib/mcp/types';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { isHighRiskTool } from '@/lib/mcp/high-risk-tools';
import { credentialKey, checkHighRiskAnomaly, persistHighRiskCapture } from '@/lib/mcp/telemetry';

/** Capped at 10 so a large roster can't crowd out the rest of the instructions —
 *  past that the model is pointed at whoami for the full list. */
const ROSTER_PREVIEW_LIMIT = 10;

function describeRoster(reachable: ReachableClient[]): string {
  const shown = reachable.slice(0, ROSTER_PREVIEW_LIMIT);
  const lines = shown.map(
    (r) => `  ${r.client.id}  ${r.client.company ?? `client #${r.client.id}`}${r.role ? ` (${r.role})` : ''}`,
  );
  if (reachable.length > shown.length) {
    lines.push(`  …and ${reachable.length - shown.length} more — call whoami for the full list.`);
  }
  return lines.join('\n');
}

export function buildMcpServer(ctx: PortalMcpContext): McpServer {
  // `ctx.client` is already the company this request acts on — the route resolved
  // it from the JSON-RPC body and applied it (see ./client-scope.ts). Registrars
  // may therefore keep hoisting `const clientId = ctx.client.id`.
  const reachable = reachableOf(ctx);
  // A credential reaching several companies must be told which one on every
  // call; one reaching a single company keeps today's implicit scoping (and,
  // deliberately, today's tool schemas — an unused clientId param on 264 tools
  // is a real chunk of the tools/list token budget).
  const multiClient = reachable.length > 1;

  const server = new McpServer(
    { name: 'simplerdevelopment-portal', version: '0.1.0' },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
      instructions: multiClient
        ? `You are connected to the SimplerDevelopment portal as a user who acts for ${reachable.length} companies:\n` +
          `${describeRoster(reachable)}\n` +
          `Pass "clientId" on EVERY tool call to say which company it applies to. If the user has not said which company they mean, ASK — never guess, and never assume the last one used. Call whoami for the full roster.`
        : `You are connected to the SimplerDevelopment portal for client "${ctx.client.company ?? `#${ctx.client.id}`}" (id ${ctx.client.id}). Use these tools to manage projects, tickets, CRM, content, media, websites, and email campaigns. All operations are automatically scoped to this client.`,
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
  // Memoized PER CLIENT, not per request: one request can now target any company
  // on the roster, and a single cached boolean would apply the first company's
  // Brain entitlement to all the others — either a paywall bypass or a false deny.
  const brainEntitledByClient = new Map<number, Promise<boolean>>();
  const brainEntitled = (clientId: number) => {
    let p = brainEntitledByClient.get(clientId);
    if (!p) {
      // Promise.resolve().then(...) so a synchronous throw OR an async rejection
      // in the entitlement check both fail closed (deny), never leak.
      p = Promise.resolve(clientId).then(isBrainEntitled).catch(() => false);
      brainEntitledByClient.set(clientId, p);
    }
    return p;
  };

  const originalRegisterTool = server.registerTool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (...args: unknown[]) => {
    const toolName = args[0] as string;
    // The callback is always the last argument.
    const origCb = args[args.length - 1] as (...cbArgs: unknown[]) => Promise<unknown>;

    // Multi-company credentials get a `clientId` param on every tenant-scoped
    // tool, injected here so the ~264 registrations stay untouched. The SDK strips
    // keys the schema doesn't declare, so without this the handler would never see
    // it. Exempt tools (whoami) are skipped — advertising a required company on
    // the tool you call to LEARN the companies would contradict itself.
    if (multiClient && !isTenantExemptTool(toolName)) {
      const config = args[1] as { inputSchema?: Record<string, unknown> } | undefined;
      if (config && typeof config === 'object') {
        config.inputSchema = {
          ...(config.inputSchema ?? {}),
          // Optional in the SCHEMA, required in practice: a Zod-level rejection
          // would replace the roster-enumerating error with an opaque validation
          // failure, and that error is what lets the model ask the user which
          // company they meant. Coerced because resolveTarget deliberately
          // accepts numeric strings — without coercion the SDK rejects "19"
          // before resolution ever sees it (LLMs emit numeric strings often
          // enough that 44 tool schemas in this registry already coerce).
          clientId: z.coerce
            .number()
            .optional()
            .describe('Which company (portal client id) this call acts on. Required — see whoami.'),
        };
      }
    }

    const wrappedCb = async (...cbArgs: unknown[]): Promise<unknown> => {
      const start = Date.now();
      // First arg to the callback is the validated input object.
      const inputArg = (cbArgs[0] ?? {}) as Record<string, unknown>;
      let outcome: 'success' | 'denied' | 'error' = 'success';
      let errorMessage: string | null = null;
      let callResult: unknown;

      // ── Which company? ───────────────────────────────────────────────────
      // The route already resolved this from the request body; an unresolved
      // target means the call could not name its company (omitted on an
      // ambiguous roster) or named one outside the grant. Refuse before touching
      // data, consuming rate-limit budget, or attributing the call to whichever
      // company happened to be the default.
      // An empty roster reaches here only if the route's guard was bypassed
      // (a synthetic caller); refuse rather than fall back to any company.
      // `whoami` is exempt — it reports the roster, so needing a company first
      // would leave the caller no way to learn one.
      const targetError = isTenantExemptTool(toolName)
        ? null
        : ctx.targetError ??
          (reachable.length === 0
            ? 'This credential can no longer act for any company. Your access may have been removed — re-authorize the connection.'
            : null);
      if (targetError) {
        void logAgentAction({
          clientId: ctx.client.id,
          userId: ctx.userId ?? null,
          source: 'mcp',
          tool: toolName,
          paramsHash: hashParams(inputArg),
          outcome: 'denied',
          errorMessage: 'client target unresolved',
          keyId: ctx.keyId ?? null,
          durationMs: Date.now() - start,
        });
        return { content: [{ type: 'text' as const, text: targetError }], isError: true };
      }
      // Synthetic contexts (tests, CLI manifest) carry no resolved target; they
      // are single-client by construction, so fall back to that one. The last
      // fallback only fires for an exempt tool on an empty roster.
      const target = ctx.target ?? reachable[0] ?? { client: ctx.client, role: null };
      const targetClientId = target.client.id;

      // Per-client role gate — a viewer on this company cannot write it even
      // when the credential's scopes allow writes elsewhere on the roster.
      const denial = roleDenial(toolName, target, ctx.userId);
      if (denial) {
        void logAgentAction({
          clientId: targetClientId,
          userId: ctx.userId ?? null,
          source: 'mcp',
          tool: toolName,
          paramsHash: hashParams(inputArg),
          outcome: 'denied',
          errorMessage: 'insufficient role',
          keyId: ctx.keyId ?? null,
          durationMs: Date.now() - start,
        });
        return { content: [{ type: 'text' as const, text: denial }], isError: true };
      }

      // Entitlement gate: brain_* tools require an active Brain subscription,
      // independent of the key's scopes. Fail closed.
      if (toolName.startsWith('brain_') && !(await brainEntitled(targetClientId))) {
        void logAgentAction({
          clientId: targetClientId,
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
          clientId: targetClientId,
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
            clientId: targetClientId,
            toolName,
            keyId: ctx.keyId ?? null,
            userId: ctx.userId ?? null,
            inputArgs: inputArg,
          });
        }
        throw err;
      }

      void logAgentAction({
        clientId: targetClientId,
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
          clientId: targetClientId,
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
