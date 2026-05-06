/**
 * post-binding — bidirectional bridge between the Yjs `blocks` Y.Array and
 * the React `setBlocks` callback owned by `usePostForm`.
 *
 * Direction A — local → Y:
 *   The editor calls `applyLocalBlocks(next)` whenever the user edits a
 *   block. We diff `next` against the current Y state and apply the minimum
 *   set of operations inside a `ydoc.transact(..., 'local')` so other peers
 *   receive a focused update.
 *
 * Direction B — Y → local:
 *   We listen to `ydoc` updates. When the origin is **not** `'local'`, we
 *   serialize the Y.Array back to plain JSON Block[] and call
 *   `onRemoteBlocks(blocks)`. The hook routes that into React state without
 *   triggering another local broadcast.
 *
 * v1 simplification — full clear+push when the diff isn't a clean
 * id-aligned edit:
 *   For a first cut we only optimize three common cases (same length, only
 *   value diffs / append / single-row replace). Anything else (insertions in
 *   the middle, reorders, deletes) falls back to wiping the Y.Array and
 *   pushing the new array. Yjs still merges with concurrent peers correctly
 *   because their inserts/deletes have already been applied to the shared
 *   doc by the time our local replace lands — but the resulting "noisy"
 *   transaction does mean concurrent edits to the same block at the same
 *   moment as a reorder will resolve last-write-wins on the field level.
 *   Acceptable for v1 — promote to a proper LCS diff (or ports of
 *   y-array-diff helpers) when we need finer granularity.
 */

import * as Y from 'yjs';
import type { Block } from '@/types/blocks';
import { Y_BLOCKS_KEY, blocksToYArray } from './doc-model';

const LOCAL_ORIGIN = 'local';

export interface BindPostToYjsOptions {
  ydoc: Y.Doc;
  initialBlocks: Block[];
  /** Called whenever a remote update lands (not from our own local writes). */
  onRemoteBlocks: (blocks: Block[]) => void;
  /**
   * Returns true when a `setBlocks` call is currently in flight from React —
   * used to suppress remote-echo reflows that would clobber transient state.
   * Today this is reserved for future use; the binding ignores incoming
   * remote updates with the LOCAL origin string regardless.
   */
  isLocalUpdate?: () => boolean;
  /**
   * Marks the next y-update as having origin "local". Today the binding
   * always tags its own transactions with the LOCAL origin, so callers don't
   * need to invoke this manually — it's exposed for parity with the spec.
   */
  markLocalUpdate?: () => void;
}

export interface BoundPost {
  /** Push the latest React block array into the shared Yjs document. */
  applyLocalBlocks: (blocks: Block[]) => void;
  /** Detach observers and stop bridging updates. */
  unbind: () => void;
}

/**
 * Plain-JSON snapshot of a Y.Map<unknown> (Y representation of one Block).
 */
function ymapToBlock(map: Y.Map<unknown>): Block {
  return map.toJSON() as Block;
}

function getBlockId(block: Block | undefined): string | undefined {
  return block?.id;
}

/**
 * Read all current Y.Map entries as plain Block[].
 */
function snapshotYBlocks(yArr: Y.Array<Y.Map<unknown>>): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < yArr.length; i++) {
    const item = yArr.get(i);
    if (item instanceof Y.Map) out.push(ymapToBlock(item));
  }
  return out;
}

/**
 * Build a fresh Y.Map for one block.
 */
function blockToYMap(block: Block): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(block)) {
    map.set(key, value as unknown);
  }
  return map;
}

/**
 * Update an existing Y.Map in place to match `next`. Adds/overwrites every
 * key in `next` and deletes keys that disappeared. Field-level granularity —
 * two peers editing different fields on the same block will not clobber each
 * other (modulo the v1 same-field LWW caveat documented in doc-model.ts).
 */
function patchYMapToBlock(map: Y.Map<unknown>, next: Block): void {
  const nextEntries = Object.entries(next);
  const nextKeys = new Set(nextEntries.map(([k]) => k));

  // Delete keys that are no longer present.
  const toDelete: string[] = [];
  map.forEach((_value, key) => {
    if (!nextKeys.has(key)) toDelete.push(key);
  });
  for (const key of toDelete) map.delete(key);

  // Set / overwrite remaining keys. We `JSON.stringify` compare to skip
  // no-op writes — Yjs would still emit an update for an identical value.
  for (const [key, value] of nextEntries) {
    const cur = map.get(key);
    if (JSON.stringify(cur) === JSON.stringify(value)) continue;
    map.set(key, value as unknown);
  }
}

/**
 * Diff-apply `next` into `yArr`. Tries cheap paths first, falls back to a
 * full clear+push if the array shape changed in a way we don't optimize.
 */
function diffApplyBlocks(
  yArr: Y.Array<Y.Map<unknown>>,
  next: Block[],
): void {
  const cur = snapshotYBlocks(yArr);

  // Fast path 1: same length and same id at every index → patch in place.
  if (cur.length === next.length) {
    let aligned = true;
    for (let i = 0; i < cur.length; i++) {
      if (getBlockId(cur[i]) !== getBlockId(next[i])) {
        aligned = false;
        break;
      }
    }
    if (aligned) {
      for (let i = 0; i < next.length; i++) {
        const map = yArr.get(i);
        if (map instanceof Y.Map) patchYMapToBlock(map, next[i]);
      }
      return;
    }
  }

  // Fast path 2: pure append — old prefix matches by id, new tail extends.
  if (
    next.length > cur.length &&
    cur.every((b, i) => getBlockId(b) === getBlockId(next[i]))
  ) {
    // Patch the prefix in case any field changed (rare combo, but cheap).
    for (let i = 0; i < cur.length; i++) {
      const map = yArr.get(i);
      if (map instanceof Y.Map) patchYMapToBlock(map, next[i]);
    }
    const tail = next.slice(cur.length).map(blockToYMap);
    yArr.push(tail);
    return;
  }

  // Fast path 3: pure delete from the end — new is a prefix of old by id.
  if (
    next.length < cur.length &&
    next.every((b, i) => getBlockId(b) === getBlockId(cur[i]))
  ) {
    for (let i = 0; i < next.length; i++) {
      const map = yArr.get(i);
      if (map instanceof Y.Map) patchYMapToBlock(map, next[i]);
    }
    yArr.delete(next.length, cur.length - next.length);
    return;
  }

  // Fallback: id sequences diverge (insertion in middle, reorder, etc.).
  // v1 — full replace. See top-of-file note on the tradeoff.
  blocksToYArray(next, yArr);
}

/**
 * Bind a Y.Doc's `blocks` array to a React `setBlocks` callback. Returns
 * an `applyLocalBlocks` writer + an `unbind` cleanup function.
 *
 * On first call, if the Y.Array is empty, it is seeded from `initialBlocks`.
 * If the Y.Array already has content (the room joined a session that's been
 * editing for a while), the current Y state is broadcast to React via
 * `onRemoteBlocks` so the editor adopts the shared truth instead of
 * overwriting it.
 */
export function bindPostToYjs(opts: BindPostToYjsOptions): BoundPost {
  const { ydoc, initialBlocks, onRemoteBlocks } = opts;
  const yArr = ydoc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY);

  // ── Seed or adopt ──────────────────────────────────────────────────────
  if (yArr.length === 0 && initialBlocks.length > 0) {
    ydoc.transact(() => {
      blocksToYArray(initialBlocks, yArr);
    }, LOCAL_ORIGIN);
  } else if (yArr.length > 0) {
    // Adopt the shared truth — fire one remote update so React mirrors Y.
    queueMicrotask(() => onRemoteBlocks(snapshotYBlocks(yArr)));
  }

  // ── Listen for remote updates ──────────────────────────────────────────
  const updateListener = (
    _update: Uint8Array,
    origin: unknown,
  ): void => {
    if (origin === LOCAL_ORIGIN) return;
    onRemoteBlocks(snapshotYBlocks(yArr));
  };
  ydoc.on('update', updateListener);

  // ── Local writer ───────────────────────────────────────────────────────
  const applyLocalBlocks = (next: Block[]): void => {
    ydoc.transact(() => {
      diffApplyBlocks(yArr, next);
    }, LOCAL_ORIGIN);
  };

  return {
    applyLocalBlocks,
    unbind: () => {
      ydoc.off('update', updateListener);
    },
  };
}
