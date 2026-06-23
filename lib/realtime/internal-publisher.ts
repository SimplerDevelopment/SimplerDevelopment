/**
 * Internal publisher — fans MCP-driven (and other server-side) writes into
 * the realtime collab server so any open editor for that document updates
 * live without a refetch.
 *
 * Flow: caller has just persisted a new state to Postgres → caller invokes
 * `publishBlocksUpdate` / `publishSlidesUpdate` with that state → we build a
 * fresh Y.Doc encoding the new state, serialize as a Y update binary, and
 * POST it to the realtime server's privileged `/internal/apply` endpoint.
 * The server applies that update onto its in-memory doc and broadcasts to
 * connected peers.
 *
 * v1 tradeoff (intentional): we are NOT computing a diff between the
 * server's current Y state and the new desired state — we encode the full
 * desired state as a fresh update. When applied to the existing doc this
 * effectively REPLACES the array contents (because doc-model's
 * blocksToYArray/slidesToYArray wipe + refill the array under a Y
 * transaction). That is the correct semantics for MCP for now: the agent's
 * write is authoritative and any in-flight peer edits to the same array
 * lose. If we want true CRDT merge later we can switch to computing the
 * diff via Y.encodeStateAsUpdate against the server's `state vector` — but
 * that requires a round-trip and isn't worth it for the v1 fanout case.
 *
 * Env vars:
 *   - `REALTIME_INTERNAL_URL`    — base URL of the realtime server
 *                                  (default: http://localhost:3030).
 *   - `REALTIME_INTERNAL_SECRET` — shared secret matching the realtime
 *                                  server's expected `X-Internal-Secret`
 *                                  header. If unset we skip the publish
 *                                  (logged as a warning) — MCP writes still
 *                                  succeed.
 *
 * Failure policy: every error path returns `{ ok: false, reason }` and
 * logs a warning. We NEVER throw and NEVER block the caller for more than
 * the 2-second abort timeout. MCP writes must succeed even if the
 * realtime server is unreachable.
 */

import * as Y from 'yjs';
import {
  blocksToYArray,
  slidesToYArray,
  docKey,
  type EntityType,
} from './doc-model';
import type { Block } from '@/types/blocks';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

export interface PublishResult {
  ok: boolean;
  status?: number;
  reason?: string;
}

const DEFAULT_REALTIME_URL = 'http://localhost:3030';
const PUBLISH_TIMEOUT_MS = 2_000;

function realtimeBaseUrl(): string {
  return (process.env.REALTIME_INTERNAL_URL || DEFAULT_REALTIME_URL).replace(/\/+$/, '');
}

/** Encode a Uint8Array as a base64 string (Node 16+ Buffer is always available server-side). */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Apply an arbitrary Y update binary onto the realtime doc identified by
 * `(entityType, entityId)`. Lower-level escape hatch — most callers want
 * `publishBlocksUpdate` or `publishSlidesUpdate`.
 */
export async function publishRawYUpdate(opts: {
  entityType: EntityType;
  entityId: string | number;
  update: Uint8Array;
}): Promise<PublishResult> {
  const secret = process.env.REALTIME_INTERNAL_SECRET;
  if (!secret) {
    console.warn(
      '[realtime/publisher] REALTIME_INTERNAL_SECRET is unset — skipping fanout. ' +
        'Set it in env to enable live MCP→editor updates.',
    );
    return { ok: false, reason: 'missing_secret' };
  }

  const key = docKey(opts.entityType, String(opts.entityId));
  const url = `${realtimeBaseUrl()}/internal/apply`;
  const body = JSON.stringify({ docKey: key, update: toBase64(opts.update) });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLISH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': secret,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(
        `[realtime/publisher] /internal/apply returned ${resp.status} for ${key}: ${text.slice(0, 200)}`,
      );
      return { ok: false, status: resp.status, reason: text || `http_${resp.status}` };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    clearTimeout(timer);
    const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : (err as Error).message;
    console.warn(`[realtime/publisher] publish failed for ${key}: ${reason}`);
    return { ok: false, reason };
  }
}

/**
 * Build a Y update encoding `blocks` as the canonical "blocks" Y.Array and
 * publish it to the realtime server. Use after a DB write that mutated a
 * post's `posts.content` blocks or an email campaign's
 * `email_campaigns.block_content.blocks`.
 */
export async function publishBlocksUpdate(opts: {
  entityType: 'post' | 'email';
  entityId: string | number;
  blocks: Block[];
}): Promise<PublishResult> {
  let update: Uint8Array;
  try {
    const tmpDoc = new Y.Doc();
    blocksToYArray(opts.blocks, tmpDoc.getArray('blocks'));
    update = Y.encodeStateAsUpdate(tmpDoc);
    tmpDoc.destroy();
  } catch (err) {
    const reason = (err as Error).message;
    console.warn(`[realtime/publisher] failed to encode blocks update: ${reason}`);
    return { ok: false, reason };
  }
  return publishRawYUpdate({
    entityType: opts.entityType,
    entityId: opts.entityId,
    update,
  });
}

/**
 * Build a Y update encoding `slides` as the canonical "slides" Y.Array and
 * publish it to the realtime server. Use after a DB write that mutated a
 * pitch deck's `pitch_decks.slides`.
 */
export async function publishSlidesUpdate(opts: {
  entityId: string | number;
  slides: PitchDeckSlideV2[];
}): Promise<PublishResult> {
  let update: Uint8Array;
  try {
    const tmpDoc = new Y.Doc();
    slidesToYArray(opts.slides, tmpDoc.getArray('slides'));
    update = Y.encodeStateAsUpdate(tmpDoc);
    tmpDoc.destroy();
  } catch (err) {
    const reason = (err as Error).message;
    console.warn(`[realtime/publisher] failed to encode slides update: ${reason}`);
    return { ok: false, reason };
  }
  return publishRawYUpdate({
    entityType: 'deck',
    entityId: opts.entityId,
    update,
  });
}

// ─── Convenience: publish-by-pending-change-entity ───────────────────────────

/**
 * Map a pending-change entity-type string (as used in `mcp_pending_changes`)
 * to the realtime entity-type (as used by docKey). Returns null for
 * entity-types that don't correspond to a live editor doc (proposal, etc).
 */
function pendingEntityToRealtime(
  pendingEntityType: string,
): 'post' | 'deck' | 'email' | null {
  switch (pendingEntityType) {
    case 'post':
      return 'post';
    case 'pitch_deck':
    case 'pitch_deck_slides':
      return 'deck';
    case 'email_campaign':
      return 'email';
    default:
      return null;
  }
}

/**
 * Look up the entity's CURRENT state in Postgres and publish it to the
 * realtime server. Use after a DB mutation (direct apply OR post-approval)
 * so connected editors update without a refetch.
 *
 * Fire-and-forget contract: never throws, returns a `PublishResult`. If the
 * entity-type isn't editor-backed (e.g. 'proposal') we no-op with
 * `{ ok: false, reason: 'no_editor_for_entity' }`.
 */
export async function publishEntityFromDb(opts: {
  entityType: string;
  entityId: number | string | null;
}): Promise<PublishResult> {
  const target = pendingEntityToRealtime(opts.entityType);
  if (!target) return { ok: false, reason: 'no_editor_for_entity' };
  if (opts.entityId == null) return { ok: false, reason: 'missing_entity_id' };

  // Lazy-import the DB layer so that this module is loadable in unit tests
  // (and other Node contexts) where DATABASE_URL is unset. The DB read only
  // runs on the apply path, never at import time.
  let db: typeof import('@/lib/db').db;
  let posts: typeof import('@/lib/db/schema').posts;
  let pitchDecks: typeof import('@/lib/db/schema').pitchDecks;
  let emailCampaigns: typeof import('@/lib/db/schema').emailCampaigns;
  let eq: typeof import('drizzle-orm').eq;
  try {
    ({ db } = await import('@/lib/db'));
    ({ posts, pitchDecks, emailCampaigns } = await import('@/lib/db/schema'));
    ({ eq } = await import('drizzle-orm'));
  } catch (err) {
    const reason = (err as Error).message;
    console.warn(`[realtime/publisher] DB module load failed: ${reason}`);
    return { ok: false, reason };
  }

  try {
    if (target === 'post') {
      const id = Number(opts.entityId);
      if (!Number.isFinite(id)) return { ok: false, reason: 'non_numeric_entity_id' };
      const [row] = await db
        .select({ content: posts.content })
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
      if (!row) return { ok: false, reason: 'entity_not_found' };
      const blocks = parsePostContentBlocks(row.content);
      return publishBlocksUpdate({ entityType: 'post', entityId: id, blocks });
    }

    if (target === 'deck') {
      const id = Number(opts.entityId);
      if (!Number.isFinite(id)) return { ok: false, reason: 'non_numeric_entity_id' };
      const [row] = await db
        .select({ slides: pitchDecks.slides })
        .from(pitchDecks)
        .where(eq(pitchDecks.id, id))
        .limit(1);
      if (!row) return { ok: false, reason: 'entity_not_found' };
      const slides = (Array.isArray(row.slides) ? row.slides : []) as PitchDeckSlideV2[];
      return publishSlidesUpdate({ entityId: id, slides });
    }

    if (target === 'email') {
      const id = Number(opts.entityId);
      if (!Number.isFinite(id)) return { ok: false, reason: 'non_numeric_entity_id' };
      const [row] = await db
        .select({ blockContent: emailCampaigns.blockContent })
        .from(emailCampaigns)
        .where(eq(emailCampaigns.id, id))
        .limit(1);
      if (!row) return { ok: false, reason: 'entity_not_found' };
      const blocks = extractEmailBlocks(row.blockContent);
      // If the campaign has no block_content (purely htmlContent), there is
      // no blocks-based editor doc to fan out to — skip cleanly.
      if (!blocks) return { ok: false, reason: 'no_block_content' };
      return publishBlocksUpdate({ entityType: 'email', entityId: id, blocks });
    }

    return { ok: false, reason: 'no_editor_for_entity' };
  } catch (err) {
    const reason = (err as Error).message;
    console.warn(
      `[realtime/publisher] publishEntityFromDb(${opts.entityType}:${opts.entityId}) failed: ${reason}`,
    );
    return { ok: false, reason };
  }
}

function parsePostContentBlocks(content: string | null | undefined): Block[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (parsed && Array.isArray(parsed.blocks)) return parsed.blocks as Block[];
    return [];
  } catch {
    return [];
  }
}

function extractEmailBlocks(blockContent: unknown): Block[] | null {
  if (!blockContent || typeof blockContent !== 'object') return null;
  const candidate = (blockContent as { blocks?: unknown }).blocks;
  if (!Array.isArray(candidate)) return null;
  return candidate as Block[];
}
