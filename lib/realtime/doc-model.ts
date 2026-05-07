/**
 * Realtime doc-model — shared between the realtime-server (Node) and the
 * browser client. Maps the canonical Block / PitchDeckSlideV2 JSON shape into
 * a Y.Doc representation and back.
 *
 * Y representation tradeoff (v1):
 * Each block (or slide) is stored as a Y.Map at the top level. Inside the
 * Y.Map we store **plain JSON values** for each key (`type`, `props`,
 * `style`, etc) — we do NOT recursively Y-ify nested objects. This gives:
 *   - Field-level merge for top-level keys (two users editing different
 *     props on the same block won't clobber each other on flush).
 *   - O(1) serialize back to JSON via `value.toJSON()`.
 *   - Massively simpler interop with our existing JSON schema.
 *
 * The downside is that two users editing the SAME nested key (e.g. both
 * touching `props.headline`) will last-write-win on that field. Fine for
 * v1 — the array-level reorder/insert/delete is what Y excels at and what
 * we cared about most. We can promote individual hot keys (rich-text bodies)
 * to Y.Text in a future revision without a wire-format break.
 *
 * Keys used on the root Y.Doc:
 *   - "blocks" (Y.Array<Y.Map<unknown>>) — for posts and emails.
 *   - "slides" (Y.Array<Y.Map<unknown>>) — for pitch decks. Each slide map
 *     stores its `blocks` field as a plain JSON array (same tradeoff as
 *     above).
 */

import * as Y from 'yjs';
import type { Block } from '@/types/blocks';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

export type EntityType = 'post' | 'deck' | 'email';
export type DocKey = `${EntityType}:${string}`;

export const docKey = (t: EntityType, id: string): DocKey =>
  `${t}:${id}` as DocKey;

export function parseDocKey(
  key: string
): { entityType: EntityType; entityId: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const entityType = key.slice(0, idx);
  const entityId = key.slice(idx + 1);
  if (entityType !== 'post' && entityType !== 'deck' && entityType !== 'email')
    return null;
  if (!entityId) return null;
  return { entityType, entityId };
}

/** Top-level Y.Doc key used for the blocks array (posts, emails). */
export const Y_BLOCKS_KEY = 'blocks';
/** Top-level Y.Doc key used for the slides array (pitch decks). */
export const Y_SLIDES_KEY = 'slides';

/** Returns/creates the Y.Array<Y.Map<unknown>> at the canonical "blocks" key. */
export function getOrCreateBlocksArray(
  doc: Y.Doc
): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY);
}

/** Returns/creates the Y.Array<Y.Map<unknown>> at the canonical "slides" key. */
export function getOrCreateSlidesArray(
  doc: Y.Doc
): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>(Y_SLIDES_KEY);
}

// ─── Blocks ←→ Y ─────────────────────────────────────────────────────────────

/**
 * Replace the contents of `yArr` with the given JSON `blocks`. Each block is
 * wrapped in a Y.Map with one key per top-level Block field.
 */
export function blocksToYArray(
  blocks: Block[],
  yArr: Y.Array<Y.Map<unknown>>
): void {
  // Wipe and refill — caller should have run this inside a transaction.
  if (yArr.length > 0) yArr.delete(0, yArr.length);
  const maps = blocks.map(blockToYMap);
  yArr.push(maps);
}

/** Convert a Y.Array of Y.Maps back to plain JSON Block[]. */
export function yArrayToBlocks(yArr: Y.Array<Y.Map<unknown>>): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < yArr.length; i++) {
    const map = yArr.get(i);
    if (map instanceof Y.Map) {
      out.push(yMapToBlock(map));
    }
  }
  return out;
}

/** Generic Y.Array<Y.Map> → plain JSON array (used by snapshot persistence). */
export function yArrayToJSON<T = unknown>(
  yArr: Y.Array<Y.Map<unknown>>
): T[] {
  const out: T[] = [];
  for (let i = 0; i < yArr.length; i++) {
    const item = yArr.get(i);
    if (item instanceof Y.Map) {
      out.push(item.toJSON() as T);
    } else if (item !== undefined && item !== null) {
      out.push(item as T);
    }
  }
  return out;
}

function blockToYMap(block: Block): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(block)) {
    // Plain JSON values — Yjs accepts numbers, strings, booleans, null,
    // objects, arrays. Nested objects/arrays go in as plain JSON (see
    // tradeoff comment at top of file).
    map.set(key, value);
  }
  return map;
}

function yMapToBlock(map: Y.Map<unknown>): Block {
  // `.toJSON()` recursively unwraps nested Y types and returns plain JSON.
  return map.toJSON() as Block;
}

// ─── Slides ←→ Y ─────────────────────────────────────────────────────────────

/**
 * Replace the contents of `yArr` with the given JSON `slides`. Each slide is
 * a Y.Map; inside, the `blocks` field stays as a plain JSON array (see
 * tradeoff comment at top of file).
 */
export function slidesToYArray(
  slides: PitchDeckSlideV2[],
  yArr: Y.Array<Y.Map<unknown>>
): void {
  if (yArr.length > 0) yArr.delete(0, yArr.length);
  const maps = slides.map(slideToYMap);
  yArr.push(maps);
}

/** Convert a Y.Array of slide Y.Maps back to plain JSON PitchDeckSlideV2[]. */
export function yArrayToSlides(
  yArr: Y.Array<Y.Map<unknown>>
): PitchDeckSlideV2[] {
  const out: PitchDeckSlideV2[] = [];
  for (let i = 0; i < yArr.length; i++) {
    const map = yArr.get(i);
    if (map instanceof Y.Map) {
      out.push(map.toJSON() as PitchDeckSlideV2);
    }
  }
  return out;
}

function slideToYMap(slide: PitchDeckSlideV2): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(slide)) {
    map.set(key, value);
  }
  return map;
}

// ─── Awareness presence shape (typed; not enforced by Yjs) ───────────────────

export interface AwarenessUser {
  id: string;
  name: string;
  color: string;
  avatar?: string | null;
}

export interface PresenceState {
  user: AwarenessUser;
  cursor?: { x: number; y: number } | null;
  selection?: { blockId: string } | null;
  activeSlide?: number | null;
  focusedField?: string | null;
}
