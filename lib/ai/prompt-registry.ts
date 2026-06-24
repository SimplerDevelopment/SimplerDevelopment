/**
 * Prompt registry resolver — the production read-path for the hybrid prompt
 * registry (see vault/05 - Feature Specs/Prompt Eval Dashboard).
 *
 * `resolvePrompt(key, fallback)` returns the ACTIVE version's body for a prompt,
 * with the in-code constant (`fallback`) as the safety net:
 *   - registry disabled (default) → fallback, no DB hit
 *   - cache hit (<TTL)            → cached body
 *   - DB row present              → active version body (cached)
 *   - no row / DB error           → fallback (cached briefly)
 *
 * GATED OFF by default (`PROMPT_REGISTRY_ENABLED`). Until the dashboard +
 * promote flow ship, production keeps using the in-code constants verbatim and
 * pays zero hot-path DB cost. Flipping the flag to '1' is the deliberate
 * "go-live" step for the registry.
 *
 * Note: this is normal app runtime — `Date.now()` is fine here (the no-Date.now
 * rule applies only to Workflow scripts).
 */
import { db } from '@/lib/db';
import { promptRegistry, promptVersions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

const CACHE_TTL_MS = 60_000;

function registryEnabled(): boolean {
  return process.env.PROMPT_REGISTRY_ENABLED === '1';
}

interface CacheEntry {
  body: string | null;
  at: number;
}
const cache = new Map<string, CacheEntry>();

async function loadActiveBody(key: string): Promise<string | null> {
  // Defensive: require the pointed-at version to actually be `active`, so a
  // stale activeVersionId pointing at a draft/archived row can't reach prod.
  const [row] = await db
    .select({ body: promptVersions.body })
    .from(promptRegistry)
    .innerJoin(promptVersions, eq(promptVersions.id, promptRegistry.activeVersionId))
    .where(and(eq(promptRegistry.key, key), eq(promptVersions.status, 'active')))
    .limit(1);
  return row?.body ?? null;
}

/**
 * Resolve a prompt's active body, or `fallback` (the in-code constant) if the
 * registry is disabled / has no active version / errors.
 */
export async function resolvePrompt(key: string, fallback: string): Promise<string> {
  if (!registryEnabled()) return fallback;

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.body ?? fallback;

  try {
    const body = await loadActiveBody(key);
    cache.set(key, { body, at: now });
    return body ?? fallback;
  } catch {
    // DB unavailable / schema missing → fall back to code and cache the miss
    // briefly so we don't hammer a struggling DB on every call.
    cache.set(key, { body: null, at: now });
    return fallback;
  }
}

/** Fetch a SPECIFIC version's body (used by the eval worker to target any
 *  version, not just the active one). Returns null if not found. */
export async function getPromptVersionBody(versionId: number): Promise<string | null> {
  const [row] = await db
    .select({ body: promptVersions.body })
    .from(promptVersions)
    .where(eq(promptVersions.id, versionId))
    .limit(1);
  return row?.body ?? null;
}

/** Clear the in-process cache. Call after a promote so the new active version
 *  is picked up immediately rather than within TTL; also used by tests. */
export function clearPromptCache(): void {
  cache.clear();
}
