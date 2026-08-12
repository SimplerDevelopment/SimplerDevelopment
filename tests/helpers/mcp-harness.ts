/**
 * Invoke a real MCP tool handler against a real database.
 *
 * The unit-layer specs (mcp-tool-registry-baseline, mcp-server-guards) build
 * the server only to *introspect* what got registered — they mock `@/lib/db`
 * and never run a handler. That is the right call for drift-locking, but it
 * means no existing spec proves a handler's SQL is correct, and per
 * tests/CLAUDE.md a mocked DB cannot catch a missing tenant filter at all: it
 * returns whatever the mock was told to return.
 *
 * This helper closes that gap for the integration layer. It reaches into the
 * SDK's private `_registeredTools` (same access the baseline spec documents)
 * to call a handler directly, skipping transport but exercising the genuine
 * scope guard, Zod schema and query path.
 */
import { buildMcpServer } from '@/lib/mcp/server';
import { applyTarget, hydrateReachable, resolveTarget } from '@/lib/mcp/client-scope';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import type { TenantCtx } from './session';

type RegisteredTool = {
  callback?: (args: unknown, extra?: unknown) => Promise<unknown> | unknown;
  handler?: (args: unknown, extra?: unknown) => Promise<unknown> | unknown;
};

/**
 * Build a server bound to a seeded tenant. Scopes default to `*` because these
 * specs are about data correctness; scope *filtering* is already locked by the
 * registry baseline spec and does not need re-proving here.
 */
export async function buildMcpServerForTest(
  tenant: TenantCtx,
  scopes: string[] = ['*'],
  /**
   * Consent-time client allowlist, for specs about multi-company credentials.
   * Passed through the REAL `hydrateReachable`, so the spec exercises the
   * allowlist ∩ live-membership intersection rather than a hand-built roster —
   * an id here that the user has no `client_members` row for is expected to
   * drop out, and specs assert exactly that.
   */
  allowedClientIds?: number[],
  /**
   * The company this server's calls act on — what `app/api/mcp/route.ts` reads off
   * the JSON-RPC body. Pass it whenever `allowedClientIds` covers several
   * companies; omitting it reproduces a call that named none, which is expected
   * to be refused. Ignored for single-company credentials.
   */
  targetClientId?: number,
): Promise<unknown> {
  const base: PortalMcpContext = {
    userId: tenant.user.id,
    keyId: 1,
    scopes,
    // TenantCtx exposes { id, name } — `name` IS the clients.company column
    // (see tests/helpers/session.ts). Note tsconfig excludes tests/, so a
    // wrong property name here is only caught by running the spec, never by
    // `tsc --noEmit`.
    client: {
      id: tenant.client.id,
      company: tenant.client.name,
    } as PortalMcpContext['client'],
    ...(allowedClientIds?.length ? { allowedClientIds } : {}),
  };
  if (!allowedClientIds?.length) return buildMcpServer(base);

  // Mirror the route: hydrate the roster, then resolve + apply the target before
  // the registry is built. Resolution deliberately does NOT live in the tool
  // wrapper — see the note at the top of lib/mcp/client-scope.ts.
  const roster = await hydrateReachable(base);
  return buildMcpServer(applyTarget(roster, resolveTarget(roster, targetClientId)));
}

/**
 * Call a registered tool by name and return its decoded JSON payload.
 *
 * Tool handlers return the MCP content envelope
 * (`{ content: [{ type: 'text', text: '<json>' }] }`); every assertion in a
 * spec wants the parsed body, so unwrap here rather than in each test. A
 * handler that returns `{ error }` is a normal not-found/refused result and is
 * returned as-is — callers assert on it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the payload
// shape differs per tool; specs assert on it directly.
export async function callTool(
  server: unknown,
  name: string,
  args: Record<string, unknown>,
): Promise<any> {
  const registry = (server as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
  const tool = registry?.[name];
  if (!tool) {
    // A renamed or unregistered tool must fail loudly here — silently
    // returning undefined would let a spec "pass" against nothing.
    throw new Error(`Tool "${name}" is not registered. Available: ${Object.keys(registry ?? {}).length} tools.`);
  }

  const fn = tool.callback ?? tool.handler;
  if (typeof fn !== 'function') throw new Error(`Tool "${name}" has no invocable handler.`);

  const result = await fn(args, {});
  const text = (result as { content?: { type: string; text?: string }[] })?.content?.[0]?.text;
  if (typeof text !== 'string') return result as never;
  try {
    return JSON.parse(text);
  } catch {
    return text as never;
  }
}
