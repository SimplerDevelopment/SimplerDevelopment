/**
 * Per-call tenant resolution for the MCP surface.
 *
 * A credential used to be pinned to exactly one portal client: the consent
 * screen made you pick one, `oauth_access_tokens.client_id` stored it, and
 * `PortalMcpContext.client` carried that single row into all ~127 `ctx.client.id`
 * reads across the tool registry. An agent acting for a user with three
 * companies therefore needed three tokens and three MCP connections.
 *
 * Now a credential is tied to the USER and carries an allowlist of clients
 * (`clientIds`), and each tool call names the company it acts on.
 *
 * Two invariants make that safe:
 *
 *  1. **Reach = consent allowlist ∩ live membership.** `hydrateReachable` runs
 *     per request. Losing a `client_members` row cuts MCP access immediately
 *     without revoking the token; joining a new company does NOT widen an
 *     existing grant (that needs re-consent). Neither side alone is enough —
 *     the allowlist is a ceiling, membership is the live truth.
 *
 *  2. **No implicit tenant when the roster is ambiguous.** With more than one
 *     reachable client, omitting `clientId` is a hard error that enumerates the
 *     roster (see `resolveTarget`) rather than falling back to a default. A
 *     silent default is how an agent writes Acme's page into Beta.
 *
 * ## Why resolution happens BEFORE the server is built
 *
 * The obvious implementation — resolve inside the `registerTool` wrapper and
 * expose the target through an AsyncLocalStorage-backed `ctx.client` getter —
 * is wrong here, and quietly so. 31 registrars hoist the tenant at REGISTRATION
 * time (`const clientId = ctx.client.id` at the top of `registerCmsTools`,
 * `registerCrmTools`, …), so a getter would be read once, before any call, and
 * every handler in those modules would keep writing to the credential's default
 * company while appearing to honor the `clientId` argument.
 *
 * So the target is resolved in `app/api/mcp/route.ts` from the JSON-RPC body and
 * applied with `applyTarget` before `buildMcpServer` runs. `ctx.client` then IS
 * the call's company for the whole request, which makes every read correct —
 * hoisted or not, today's and tomorrow's. The transport is stateless (one server
 * per request), so "per request" and "per call" are the same thing; a batch
 * naming two different companies is refused rather than resolved to one.
 */
import type { PortalMcpContext, ReachableClient } from '@/lib/mcp-auth';
import { getPortalClientsWithRoles } from '@/lib/portal-client';
import { ROLE_LEVELS, ACTION_REQUIRED_LEVEL, type PortalRole } from '@/lib/portal-auth';

/**
 * The clients this credential may act for right now.
 *
 * ABSENT (never hydrated — synthetic contexts in tests/scripts) means
 * single-client, so it falls back to `ctx.client`. PRESENT BUT EMPTY means
 * hydration found nothing: the user's access was removed since the grant, and the
 * answer is genuinely "no companies". Collapsing those two would turn a revoked
 * grant back into full access on the default company.
 */
export function reachableOf(ctx: PortalMcpContext): ReachableClient[] {
  return ctx.reachable ?? [{ client: ctx.client, role: null }];
}

/**
 * Resolve `allowlist ∩ live membership`, with each client's current role.
 *
 * Call once per request, BEFORE `buildMcpServer` — the roster feeds the server
 * `instructions` string and the tool schemas, so it has to exist at build time.
 * Kept out of `lib/mcp-auth.ts` deliberately: that module is imported by non-Next
 * callers and must not pull in `next/headers` (which `portal-client` imports).
 *
 * An empty result means the user lost access to every client the grant covers;
 * callers should refuse the request outright rather than build a server.
 */
export async function hydrateReachable(ctx: PortalMcpContext): Promise<PortalMcpContext> {
  // A single-client credential still goes through the join, so the role gate has
  // a real role to work with rather than silently skipping.
  const allowlist = new Set(
    ctx.allowedClientIds?.length ? ctx.allowedClientIds : [ctx.client.id],
  );

  const rows = await getPortalClientsWithRoles(ctx.userId);
  const reachable: ReachableClient[] = rows
    .filter((row) => allowlist.has(row.id))
    .map(({ role, ...client }) => ({ client, role: role as PortalRole }));

  return { ...ctx, reachable };
}

export type TargetResolution =
  | { ok: true; target: ReachableClient }
  | { ok: false; message: string };

function roster(list: ReachableClient[]): string {
  return list
    .map((r) => `  ${r.client.id}  ${r.client.company ?? `client #${r.client.id}`}${r.role ? ` (${r.role})` : ''}`)
    .join('\n');
}

/**
 * Pick the client a tool call acts on.
 *
 * Omitted + exactly one reachable → that one (the common case stays frictionless).
 * Omitted + several reachable → refuse and enumerate, so the model asks the user.
 * Named but not reachable → refuse; the message distinguishes "not yours" from
 * "yours, but not in this grant" because the fixes differ (nothing vs re-consent).
 */
export function resolveTarget(ctx: PortalMcpContext, requested: unknown): TargetResolution {
  const list = ctx.reachable ?? [];
  if (list.length === 0) {
    return { ok: false, message: 'This credential can no longer act for any company. Your access may have been removed — re-authorize the connection.' };
  }

  if (requested == null) {
    if (list.length === 1) return { ok: true, target: list[0] };
    return {
      ok: false,
      message:
        `clientId is required: this credential can act for ${list.length} companies.\n${roster(list)}\n` +
        `Re-call this tool with clientId set. If the user has not said which company they mean, ASK — do not guess.`,
    };
  }

  const wanted = typeof requested === 'number' ? requested : parseInt(String(requested), 10);
  if (!Number.isFinite(wanted)) {
    return { ok: false, message: `clientId must be a number. Reachable companies:\n${roster(list)}` };
  }

  const match = list.find((r) => r.client.id === wanted);
  if (!match) {
    return {
      ok: false,
      message:
        `clientId ${wanted} is not available to this credential. Nothing was read or written.\n` +
        `Reachable companies:\n${roster(list)}\n` +
        `If you do have access to ${wanted} in the portal, it was not granted when this connection was authorized — re-authorize it to add the company.`,
    };
  }
  return { ok: true, target: match };
}

/**
 * Fold a resolution into the context the server is built from.
 *
 * On success `client` becomes the target — the single point that makes all ~127
 * `ctx.client.id` reads, including the 31 hoisted at registration time, act on
 * the right company. On failure the default client is left in place (nothing will
 * run) and `targetError` carries the message every tool call returns instead.
 */
export function applyTarget(ctx: PortalMcpContext, resolution: TargetResolution): PortalMcpContext {
  if (!resolution.ok) return { ...ctx, target: undefined, targetError: resolution.message };
  return { ...ctx, client: resolution.target.client, target: resolution.target, targetError: undefined };
}

/**
 * Write-verb segments. Checked FIRST and by exact segment match, so
 * `crm_deal_artifact_link` is a write while `brain_initiatives_links` is not
 * caught by it.
 */
const WRITE_VERBS = new Set([
  'create', 'update', 'delete', 'remove', 'add', 'set', 'move', 'publish', 'send',
  'schedule', 'approve', 'reject', 'submit', 'upload', 'fork', 'invite', 'assign',
  'unassign', 'attach', 'detach', 'link', 'unlink', 'toggle', 'void', 'cancel',
  'issue', 'revoke', 'merge', 'import', 'promote', 'archive', 'unarchive',
  'restore', 'reorder', 'advance', 'abort', 'complete', 'skip', 'start', 'reply',
  'mark', 'apply', 'adjust', 'moderate', 'checkin', 'propose', 'claim', 'release',
  'touch', 'note', 'log', 'upsert', 'replace', 'rename', 'sync', 'configure',
  'revise', 'activate', 'acknowledge', 'supersede', 'edit', 'bulk',
]);

/** Read-verb segments. A tool with no write verb AND no read verb is treated as
 *  a WRITE — the classifier fails closed, so a new tool is over-restricted
 *  rather than silently writable by a viewer. */
const READ_VERBS = new Set([
  'list', 'lists', 'get', 'search', 'lookup', 'tree', 'status', 'balance',
  'ledger', 'report', 'analytics', 'entities', 'links', 'summary', 'revisions',
  'responses', 'who', 'export', 'audit', 'contrast', 'messaging', 'compliance',
]);

/** Oddballs with no verb segment at all. */
const READ_ONLY_TOOLS = new Set(['whoami']);

/**
 * Tools that need no company because they describe the CREDENTIAL, not tenant
 * data. `whoami` is how the model discovers which clientId to pass, so refusing
 * it for not naming a company is a catch-22: the caller cannot learn the roster
 * without already knowing it.
 */
const TENANT_EXEMPT_TOOLS = new Set(['whoami']);

export function isTenantExemptTool(name: string): boolean {
  return TENANT_EXEMPT_TOOLS.has(name);
}

export function isReadOnlyTool(name: string): boolean {
  if (READ_ONLY_TOOLS.has(name)) return true;
  const segments = name.split('_');
  if (segments.some((s) => WRITE_VERBS.has(s))) return false;
  return segments.some((s) => READ_VERBS.has(s));
}

/**
 * Per-client role gate — the same ladder `authorizePortal`'s `roleGate` applies
 * to REST routes, which the MCP surface never had: it checked scopes only, so a
 * `viewer` on a company with a `crm:write` token could write it. That was
 * survivable while a token covered one company; spanning companies multiplies it
 * by the size of the roster.
 *
 * Rolled out log-only exactly like `roleGate` did — set `AUTH_ROLE_ENFORCE=1` to
 * deny — so real multi-member traffic can be observed first. Returns a denial
 * message when the call should be refused, else null.
 */
export function roleDenial(toolName: string, target: ReachableClient, userId: number): string | null {
  const { role } = target;
  // No role resolved (synthetic contexts in tests/scripts) — nothing to enforce.
  if (!role) return null;

  const action = isReadOnlyTool(toolName) ? 'read' : 'write';
  if (ROLE_LEVELS[role] >= ACTION_REQUIRED_LEVEL[action]) return null;

  const enforced = process.env.AUTH_ROLE_ENFORCE === '1';
  console.warn(
    JSON.stringify({
      level: 'warn',
      event: 'mcp.role.insufficient',
      tool: toolName,
      role,
      action,
      clientId: target.client.id,
      userId,
      enforced,
    }),
  );
  if (!enforced) return null;

  return `Permission denied: your role (${role}) on ${target.client.company ?? `client #${target.client.id}`} cannot ${action === 'read' ? 'view this resource' : 'create or edit content'}.`;
}

/**
 * Pull the `clientId` argument out of a JSON-RPC request body.
 *
 * Returns `{ kind: 'none' }` for anything that isn't a tool call (initialize,
 * tools/list, notifications — nothing tenant-scoped executes), and
 * `{ kind: 'conflict' }` when a batch names more than one company: the transport
 * would run both against one context, so the request is refused instead. Bodies
 * are parsed defensively — a malformed body is the transport's error to report,
 * not ours.
 */
export function clientIdFromRpcBody(
  body: unknown,
): { kind: 'none' } | { kind: 'call'; clientId: unknown } | { kind: 'conflict' } {
  const messages = Array.isArray(body) ? body : [body];
  const ids: unknown[] = [];
  let sawCall = false;

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as { method?: unknown; params?: { arguments?: unknown } };
    if (m.method !== 'tools/call') continue;
    sawCall = true;
    const args = m.params?.arguments;
    const id = args && typeof args === 'object' ? (args as Record<string, unknown>).clientId : undefined;
    ids.push(id ?? null);
  }

  if (!sawCall) return { kind: 'none' };
  const distinct = new Set(ids.map((v) => (v == null ? 'null' : String(v))));
  if (distinct.size > 1) return { kind: 'conflict' };
  const [only] = ids;
  return { kind: 'call', clientId: only ?? undefined };
}
