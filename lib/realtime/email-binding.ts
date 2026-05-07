/**
 * email-binding — bidirectional bridge between the Yjs `blocks` Y.Array
 * (shared key with posts) and the React `setBlocks` callback owned by the
 * email-campaign edit page.
 *
 * Mirrors `post-binding.ts` shape but tags its own transactions with a
 * distinct origin so the two bindings never confuse each other if both end
 * up sharing a transient doc somehow. Functionally identical to
 * post-binding for v1.
 *
 * Direction A — local → Y:
 *   The editor calls `applyLocalBlocks(next)`. We diff `next` against the
 *   current Y state and apply the minimum set of operations inside a
 *   `ydoc.transact(..., 'local-email')` so peers receive a focused update.
 *
 * Direction B — Y → local:
 *   We listen on `ydoc` for updates. When the origin is **not**
 *   `'local-email'`, we serialize the Y.Array back to plain JSON Block[]
 *   and call `onRemoteBlocks(blocks)` — the page routes that into React
 *   state without triggering another local broadcast.
 */

import * as Y from 'yjs';
import type { Block } from '@/types/blocks';
import { Y_BLOCKS_KEY, blocksToYArray } from './doc-model';

/** Origin tag for transactions originated by this page's local edits. */
export const LOCAL_EMAIL_ORIGIN = 'local-email';

export interface BindEmailToYjsOptions {
  ydoc: Y.Doc;
  initialBlocks: Block[];
  /** Called whenever a remote update lands (not from our own local writes). */
  onRemoteBlocks: (blocks: Block[]) => void;
}

export interface EmailYjsBinding {
  /** Push the latest React block array into the shared Yjs document. */
  applyLocalBlocks: (blocks: Block[]) => void;
  /** Detach observers and stop bridging updates. Idempotent. */
  unbind: () => void;
}

function ymapToBlock(map: Y.Map<unknown>): Block {
  return map.toJSON() as Block;
}

function getBlockId(block: Block | undefined): string | undefined {
  return block?.id;
}

function snapshotYBlocks(yArr: Y.Array<Y.Map<unknown>>): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < yArr.length; i++) {
    const item = yArr.get(i);
    if (item instanceof Y.Map) out.push(ymapToBlock(item));
  }
  return out;
}

function blockToYMap(block: Block): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(block)) {
    map.set(key, value as unknown);
  }
  return map;
}

/**
 * Update an existing Y.Map in place to match `next`. Adds/overwrites every
 * key in `next` and deletes keys that disappeared.
 */
function patchYMapToBlock(map: Y.Map<unknown>, next: Block): void {
  const nextEntries = Object.entries(next);
  const nextKeys = new Set(nextEntries.map(([k]) => k));

  const toDelete: string[] = [];
  map.forEach((_value, key) => {
    if (!nextKeys.has(key)) toDelete.push(key);
  });
  for (const key of toDelete) map.delete(key);

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
  next: Block[]
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
        if (map instanceof Y.Map) patchYMapToBlock(map, next[i]!);
      }
      return;
    }
  }

  // Fast path 2: pure append.
  if (
    next.length > cur.length &&
    cur.every((b, i) => getBlockId(b) === getBlockId(next[i]))
  ) {
    for (let i = 0; i < cur.length; i++) {
      const map = yArr.get(i);
      if (map instanceof Y.Map) patchYMapToBlock(map, next[i]!);
    }
    const tail = next.slice(cur.length).map(blockToYMap);
    yArr.push(tail);
    return;
  }

  // Fast path 3: pure delete from the end.
  if (
    next.length < cur.length &&
    next.every((b, i) => getBlockId(b) === getBlockId(cur[i]))
  ) {
    for (let i = 0; i < next.length; i++) {
      const map = yArr.get(i);
      if (map instanceof Y.Map) patchYMapToBlock(map, next[i]!);
    }
    yArr.delete(next.length, cur.length - next.length);
    return;
  }

  // Fallback: id sequences diverge — wipe and refill.
  blocksToYArray(next, yArr);
}

/**
 * Bind a Y.Doc's `blocks` array to a React `setBlocks` callback. Returns
 * an `applyLocalBlocks` writer + an `unbind` cleanup function.
 *
 * On first call, if the Y.Array is empty, it is seeded from `initialBlocks`.
 * If the Y.Array already has content (the room joined a session that's
 * been editing for a while), the current Y state is broadcast to React via
 * `onRemoteBlocks` so the editor adopts the shared truth instead of
 * overwriting it.
 */
export function bindEmailToYjs(
  opts: BindEmailToYjsOptions
): EmailYjsBinding {
  const { ydoc, initialBlocks, onRemoteBlocks } = opts;
  const yArr = ydoc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY);

  // ── Seed or adopt ──────────────────────────────────────────────────────
  if (yArr.length === 0 && initialBlocks.length > 0) {
    ydoc.transact(() => {
      blocksToYArray(initialBlocks, yArr);
    }, LOCAL_EMAIL_ORIGIN);
  } else if (yArr.length > 0) {
    // Adopt the shared truth on the next microtask so React renders aren't
    // re-entrantly triggered from inside the binding call.
    queueMicrotask(() => onRemoteBlocks(snapshotYBlocks(yArr)));
  }

  // ── Listen for remote updates ──────────────────────────────────────────
  const updateListener = (_update: Uint8Array, origin: unknown): void => {
    if (origin === LOCAL_EMAIL_ORIGIN) return;
    onRemoteBlocks(snapshotYBlocks(yArr));
  };
  ydoc.on('update', updateListener);

  let unbound = false;
  return {
    applyLocalBlocks(next: Block[]) {
      if (unbound) return;
      ydoc.transact(() => {
        diffApplyBlocks(yArr, next);
      }, LOCAL_EMAIL_ORIGIN);
    },
    unbind() {
      if (unbound) return;
      unbound = true;
      ydoc.off('update', updateListener);
    },
  };
}
