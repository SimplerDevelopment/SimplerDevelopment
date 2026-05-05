/**
 * Shared types and helpers for the MCP tool registry.
 *
 * Extracted from lib/mcp/server.ts during the per-domain tool refactor so each
 * lib/mcp/tools/<domain>.ts module can import the helpers without circling
 * back through the monolithic server file.
 *
 * Two import groups live here:
 *   - Types — `McpToolRegistrar`, `ToolEnvelope` — describe the contract every
 *     domain module satisfies.
 *   - Pure helpers — `json` / `denied` / `serviceDenied` / `dbErrorEnvelope` /
 *     `extractRows` / `assignBlockIds` / `revalidateForWrite` /
 *     `serializePostContent` / `requireScope` / `requireService`. None hold
 *     any module-level state, so importing them from many domain files is
 *     safe.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { revalidatePath } from 'next/cache';
import { hasServiceAccess } from '@/lib/portal-auth';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';

/**
 * Every per-domain tool module exports a function with this signature. The
 * registrar wires its tools onto the supplied `server` instance, gating each
 * registration on the caller's scope set in `ctx`.
 *
 * This mirrors the shape of the pre-existing adapters (e.g.
 * `registerBrandingToolsOnSdk`) so the dispatcher in `lib/mcp/server.ts` can
 * walk a single array of registrars without caring whether a given module was
 * lifted out of the monolith or already lived in a `lib/<feature>/` adapter.
 */
export type McpToolRegistrar = (server: McpServer, ctx: PortalMcpContext) => void;

/** A scope identifier in `<resource>:<action>` form (e.g. `crm:read`). */
export type ToolScope = string;

/**
 * Single text-content tool envelope returned by every handler.
 *
 * Note: this is intentionally a wide structural type — the MCP SDK's
 * `registerTool` signature expects a result whose shape includes an open
 * index signature (`[x: string]: unknown`). Constraining our handlers to a
 * narrow `interface` here would cause every `json(...)` return to fail the
 * SDK's stricter type check. We use a `type` alias so the return is treated
 * structurally and stays assignable.
 */
export type ToolEnvelope = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
};

/** Shape of the JSON-stringified result every tool handler emits. */
export function json(payload: unknown): ToolEnvelope {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Posts in this app store BlockEditorData JSON in the `content` column:
 *   { blocks: Block[], version: '1.0' }
 * The visual editor parses `content` as JSON; raw HTML/markdown renders as
 * "No blocks yet". This helper accepts either a structured `blocks` array or a
 * plain string (wrapped into a single text block) and serializes correctly.
 */
export function serializePostContent(args: { blocks?: unknown; content?: string }): string {
  if (Array.isArray(args.blocks) && args.blocks.length > 0) {
    return JSON.stringify({ blocks: args.blocks, version: '1.0' });
  }
  const raw = args.content ?? '';
  if (!raw.trim()) return JSON.stringify({ blocks: [], version: '1.0' });
  return JSON.stringify({
    blocks: [{ id: `block-${Date.now()}`, type: 'text', order: 0, content: raw }],
    version: '1.0',
  });
}

export function denied(scope: string): ToolEnvelope {
  return {
    content: [{ type: 'text' as const, text: `Permission denied: this API key lacks the "${scope}" scope.` }],
    isError: true,
  };
}

/**
 * `db.execute(sql\`...\`)` returns different shapes across Drizzle adapters:
 * node-postgres yields a QueryResult with a `.rows` array, while some others
 * return the array directly. Normalize so callers can treat both uniformly.
 */
export function extractRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * Surface the actual Postgres error message (code 42703 "column does not
 * exist" and friends) in the MCP tool envelope. Drizzle wraps pg errors in
 * DrizzleQueryError whose `.message` is the rendered SQL + params; the real
 * server message lives on `.cause.message`. Returning only the SQL string
 * hides the root cause and makes schema drift look like an opaque failure.
 */
export function dbErrorEnvelope(err: unknown, tool: string): ToolEnvelope {
  const e = err as {
    message?: string;
    cause?: { message?: string; code?: string; detail?: string };
  };
  const payload = {
    error: `${tool} failed`,
    pgMessage: e.cause?.message,
    pgCode: e.cause?.code,
    pgDetail: e.cause?.detail,
    drizzleMessage: e.message,
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

export function requireScope(ctx: PortalMcpContext, scope: string): boolean {
  return hasScope(ctx.scopes, scope);
}

/**
 * Return the HTTP-routes' "subscription required" error in the MCP tool
 * envelope. Used to gate MCP write tools behind the same service-access
 * rules that `authorizePortal({ requireService })` enforces on the REST
 * surface — prevents the MCP from writing rows the portal UI can't read.
 */
export function serviceDenied(category: string): ToolEnvelope {
  return {
    content: [{ type: 'text' as const, text: `This feature requires an active ${category} subscription for the authenticated client.` }],
    isError: true,
  };
}

export async function requireService(clientId: number, category: string): Promise<boolean> {
  return hasServiceAccess(clientId, category);
}

/**
 * Ensure every block (and nested child blocks) has a stable string `id`.
 * BlockRenderer keys off `block.id` — missing ids trigger React's "unique key"
 * warning and break selection/drag in the visual editor. LLM-authored blocks
 * routinely omit ids; we backfill them here.
 */
export function assignBlockIds(blocks: unknown[]): unknown[] {
  if (!Array.isArray(blocks)) return blocks as unknown[];
  const seen = new Set<string>();
  return blocks.map((b, idx) => {
    if (!b || typeof b !== 'object') return b;
    const block = b as Record<string, unknown>;
    let id = typeof block.id === 'string' && block.id.trim() ? block.id : '';
    if (!id || seen.has(id)) {
      id = `block-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 8)}`;
    }
    seen.add(id);
    const out: Record<string, unknown> = { ...block, id };
    // Recurse into common child-block containers so columns / card-grid / etc.
    // also get ids on their children.
    for (const key of ['blocks', 'items', 'cards', 'columns', 'children']) {
      if (Array.isArray(out[key])) out[key] = assignBlockIds(out[key] as unknown[]);
    }
    return out;
  });
}

/**
 * Invalidate Next.js cache for paths affected by an MCP write.
 * Call after any DB mutation in a tool handler so the CMS (and public site,
 * for post changes) reflects the change on the next request without waiting
 * for the default revalidation interval.
 *
 * Scopes:
 *   'portal'  → /portal/** (projects, kanban, tickets, CRM, email, media)
 *   'posts'   → /portal/** + /sites/** (blocks render on public sites too)
 *   'sites'   → /sites/** only
 *
 * Errors are swallowed — revalidation is best-effort; a failure shouldn't
 * 500 the MCP tool response.
 */
export function revalidateForWrite(scope: 'portal' | 'posts' | 'sites'): void {
  try {
    if (scope === 'portal' || scope === 'posts') {
      revalidatePath('/portal', 'layout');
    }
    if (scope === 'sites' || scope === 'posts') {
      revalidatePath('/sites', 'layout');
    }
  } catch (err) {
    console.warn('[mcp] revalidatePath failed:', err);
  }
}
