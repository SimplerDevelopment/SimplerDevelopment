/**
 * Shared enums, pure helpers, and ownership-check helpers for the Path
 * Visualizations ("Dev Paths") MCP tools.
 *
 * Split out of pathviz.ts (and consumed by pathviz-coordination.ts) so each
 * registrar file stays under the pre-commit file-size budget
 * (scripts/check-file-budget.ts caps NEW files at 800 lines) — see the
 * top-of-file comment in pathviz.ts for the full 3-file split rationale.
 *
 * `authorizeProjectForClient` / `authorizeChart` were closures over a
 * registrar-scoped `clientId` in the pre-split module; here they're plain
 * exported functions that take `clientId` as an explicit parameter so both
 * registrars (graph tools in pathviz.ts, coordination tools in
 * pathviz-coordination.ts) can share one implementation.
 */
import { z } from 'zod';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, pathCharts, pathChartClaims } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ─── shared enums ───────────────────────────────────────────────────────────

export const NODE_KIND = z.enum(['screen', 'component', 'api', 'schema', 'service', 'test', 'job', 'infra']);
export const NODE_STATUS = z.enum(['planned', 'scaffolded', 'wired', 'styled', 'tested', 'shipped', 'blocked', 'error']);
export const EDGE_KIND = z.enum(['nav', 'data']);
export const CHART_STATUS = z.enum(['active', 'archived']);
export const AGENT_LABEL_INPUT = z.string().min(1).max(120).optional()
  .describe('Self-declared session name (e.g. "claude/wallet-ui") to attribute this write to. Defaults to a ctx-derived identity when omitted.');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the label attributed to this write's path_chart_events /
 * path_chart_claims rows.
 *
 * `override` (the tool's optional `agentLabel` input) always wins — it's the
 * primary mechanism the spec describes ("self-declared session name"), since
 * a single credential is routinely shared by many concurrent agent sessions
 * that need to be told apart.
 *
 * Fallback when no override is supplied: PortalMcpContext carries no
 * connection/token *display name* — only a numeric `keyId`, which collides
 * across the `portal_api_keys` and `oauth_access_tokens` id spaces (see
 * lib/mcp-auth.ts's QAD-048 note on `requireCmsApproval` resolution hitting
 * this same trap). Resolving the real credential name (portal_api_keys.name
 * / oauth_clients.clientName) here would need a join this module has no safe
 * way to disambiguate from ctx alone. So the fallback uses the always-present,
 * unambiguous user+client identity instead — callers that want a meaningful
 * label should pass `agentLabel` explicitly.
 */
export function resolveAgentLabel(ctx: PortalMcpContext, override?: string): string {
  if (override && override.trim()) return override.trim().slice(0, 120);
  const who = ctx.userId != null ? `user:${ctx.userId}` : ctx.keyId != null ? `key:${ctx.keyId}` : 'agent';
  return `${who}@${ctx.client.company}`.slice(0, 120);
}

/** Drop null/undefined-valued keys from a slim response object. */
export function omitNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/** Exact match, or a `stored`/`requested` path ending in `*` treated as a prefix. */
export function fileMatches(stored: string, requested: string): boolean {
  if (stored === requested) return true;
  if (stored.endsWith('*') && requested.startsWith(stored.slice(0, -1))) return true;
  if (requested.endsWith('*') && stored.startsWith(requested.slice(0, -1))) return true;
  return false;
}

export function filesIntersect(stored: string[], requested: string[]): boolean {
  return stored.some((s) => requested.some((r) => fileMatches(s, r)));
}

/**
 * Order a batch of node-upsert inputs so a node with a `parentKey` that
 * refers to ANOTHER node in the same batch is processed after its parent
 * (parents-first-within-the-batch, per the tool contract). Nodes whose
 * `parentKey` is absent or refers to a node NOT in this batch (assumed to
 * already exist in the DB, checked at upsert time) are resolved immediately.
 * Any node.parentKey referring back onto itself unresolved after every
 * pass (an inter-batch cycle) is appended in original order — the per-node
 * DB lookup during upsert will then surface it as an "unknown parentKey"
 * error rather than looping forever here.
 */
export function orderNodesForUpsert<T extends { key: string; parentKey?: string }>(nodes: T[]): T[] {
  const byKey = new Set(nodes.map((n) => n.key));
  const resolved = new Set<string>();
  const remaining = [...nodes];
  const order: T[] = [];
  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const n = remaining[i];
      if (!n.parentKey || !byKey.has(n.parentKey) || resolved.has(n.parentKey)) {
        order.push(n);
        resolved.add(n.key);
        remaining.splice(i, 1);
        progressed = true;
      }
    }
  }
  order.push(...remaining);
  return order;
}

export function activeClaimCondition(chartId: number) {
  return and(
    eq(pathChartClaims.chartId, chartId),
    isNull(pathChartClaims.releasedAt),
    gt(pathChartClaims.expiresAt, new Date()),
  );
}

/** Ownership check: the project must belong to `clientId`. */
export async function authorizeProjectForClient(projectId: number, clientId: number) {
  const [proj] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
  return proj ?? null;
}

/** Ownership check: the chart's project must belong to `clientId`. Returns {id, projectId}. */
export async function authorizeChart(chartId: number, clientId: number) {
  const [row] = await db
    .select({ id: pathCharts.id, projectId: pathCharts.projectId })
    .from(pathCharts)
    .innerJoin(projects, eq(projects.id, pathCharts.projectId))
    .where(and(eq(pathCharts.id, chartId), eq(projects.clientId, clientId)))
    .limit(1);
  return row ?? null;
}
