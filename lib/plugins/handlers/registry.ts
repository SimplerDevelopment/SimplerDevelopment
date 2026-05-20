// Plugin callback handler registry.
//
// Maps `(appSlug, method, pathSuffix)` → `CallbackHandler` + extracted params.
// Self-populating: each plugin's index file (e.g. `postcaptain-tools/index.ts`)
// calls `registerAppHandlers(slug, [...])` at module-import time. The
// dispatcher in `app/api/plugin-callback/[appId]/[...path]/route.ts` does a
// side-effect import of every known plugin index so the registry is hot
// before the first request lands.
//
// Route matching:
//   - exact literal segments are case-sensitive
//   - a segment that begins with `:` is a single-segment placeholder
//   - we only support `:id` (or any `:name`) — no regex segments, no
//     wildcards inside a segment. Multi-segment captures aren't a v1 need.
//
// Match precedence: when two handlers could both match (e.g. `/runs` and
// `/runs/:id`), the more specific one (more literal segments) wins. The
// registry sorts on insert so lookup is a simple linear scan in priority
// order — fine for a handful of routes per app.

import type { CallbackHandler } from './types';

interface RegisteredRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Original path string for diagnostics ('/scripts/runs/:id'). */
  path: string;
  /** Path split into segments; `:name` → `{ param: 'name' }`, else literal. */
  segments: Array<{ kind: 'literal'; value: string } | { kind: 'param'; name: string }>;
  /** Number of literal segments — used as the priority weight. */
  literalCount: number;
  handler: CallbackHandler;
}

const registry = new Map<string, RegisteredRoute[]>();

function splitPath(path: string): Array<{ kind: 'literal'; value: string } | { kind: 'param'; name: string }> {
  // Normalise: trim leading slash, drop empty trailing segment.
  const trimmed = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed === '') return [];
  return trimmed.split('/').map((seg) => {
    if (seg.startsWith(':')) {
      const name = seg.slice(1);
      if (name.length === 0) {
        throw new Error(`Invalid route segment in '${path}': empty param name.`);
      }
      return { kind: 'param', name } as const;
    }
    return { kind: 'literal', value: seg } as const;
  });
}

/**
 * Register a batch of handlers for one app slug. Idempotent: calling twice
 * with the same (method, path) tuple replaces the prior handler. This makes
 * the function safe to invoke at module-import time even if the test runner
 * re-imports the file.
 */
export function registerAppHandlers(
  appSlug: string,
  handlers: CallbackHandler[],
): void {
  const existing = registry.get(appSlug) ?? [];
  for (const h of handlers) {
    const segments = splitPath(h.path);
    const literalCount = segments.filter((s) => s.kind === 'literal').length;
    // Replace any prior handler for the same (method, path) tuple — last
    // registration wins. This matters for hot-reload + test scenarios.
    const dupIdx = existing.findIndex(
      (r) => r.method === h.method && r.path === h.path,
    );
    const record: RegisteredRoute = {
      method: h.method,
      path: h.path,
      segments,
      literalCount,
      handler: h,
    };
    if (dupIdx >= 0) existing[dupIdx] = record;
    else existing.push(record);
  }
  // Sort so more-specific (more literal segments) handlers are tried first.
  existing.sort((a, b) => b.literalCount - a.literalCount);
  registry.set(appSlug, existing);
}

interface LookupOk {
  handler: CallbackHandler;
  params: Record<string, string>;
}

/**
 * Find the registered handler for (appSlug, method, pathSuffix). `pathSuffix`
 * is the part after `/api/plugin-callback/<appSlug>` — leading slash optional.
 * Returns null when nothing matches.
 */
export function lookupHandler(
  appSlug: string,
  method: string,
  pathSuffix: string,
): LookupOk | null {
  const routes = registry.get(appSlug);
  if (!routes || routes.length === 0) return null;

  const inboundSegs = pathSuffix
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter((s) => s.length > 0);

  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.segments.length !== inboundSegs.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      const inbound = inboundSegs[i];
      if (seg.kind === 'literal') {
        if (seg.value !== inbound) {
          matched = false;
          break;
        }
      } else {
        // param — capture the URL-decoded segment value.
        try {
          params[seg.name] = decodeURIComponent(inbound);
        } catch {
          // Bad encoding — refuse the match rather than throwing.
          matched = false;
          break;
        }
      }
    }
    if (matched) {
      return { handler: route.handler, params };
    }
  }
  return null;
}

/** Test helper: forget all registrations. */
export function __clearRegistry(): void {
  registry.clear();
}

/** Diagnostic: list the registered routes for an app slug. */
export function listRoutes(appSlug: string): Array<{ method: string; path: string; scope: string }> {
  const routes = registry.get(appSlug) ?? [];
  return routes.map((r) => ({ method: r.method, path: r.path, scope: r.handler.scope }));
}
