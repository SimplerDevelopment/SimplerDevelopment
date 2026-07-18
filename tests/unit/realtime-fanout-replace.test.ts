/**
 * Regression test for the MCP realtime fan-out duplication bug.
 *
 * Repro chain (all in-repo):
 *   posts_update writes [C,D] to the DB (correct, synchronous)
 *     → lib/mcp/pending-changes.ts publishEntityFromDb (fire-and-forget)
 *     → lib/realtime/internal-publisher.ts encodes a FRESH Y.Doc holding only
 *       [C,D] via Y.encodeStateAsUpdate
 *     → packages/realtime-server/src/handlers.ts DocRoom.applyExternalUpdate
 *
 * The incoming update is insert-only (a fresh doc has no causal knowledge of a
 * live room's existing items), so a bare `Y.applyUpdate` onto a room still
 * holding stale [A,B] MERGES additively → [A,B,C,D], which the 2s debounce then
 * persists back over the correct DB write. The fix makes applyExternalUpdate
 * clear the canonical arrays in the same transaction first, so an authoritative
 * MCP replace is a true replace regardless of what the room held.
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { blocksToYArray, yArrayToBlocks } from '@/lib/realtime/doc-model';
import type { Block } from '@/types/blocks';
import { DocRoom } from '../../packages/realtime-server/src/handlers';
import type { SnapshotPersistence } from '../../packages/realtime-server/src/persistence';

const A = { id: 'AAA', type: 'text', order: 0, content: 'A' } as unknown as Block;
const B = { id: 'BBB', type: 'text', order: 1, content: 'B' } as unknown as Block;
const C = { id: 'CCC', type: 'text', order: 0, content: 'C' } as unknown as Block;
const D = { id: 'DDD', type: 'text', order: 1, content: 'D' } as unknown as Block;

/** Persistence stub — DocRoom only calls scheduleFlush() on doc updates. */
const stubPersistence = { scheduleFlush() {} } as unknown as SnapshotPersistence;

/** Encode an authoritative replacement exactly as internal-publisher does. */
function encodeReplacement(blocks: Block[]): Uint8Array {
  const tmp = new Y.Doc();
  blocksToYArray(blocks, tmp.getArray('blocks'));
  const update = Y.encodeStateAsUpdate(tmp);
  tmp.destroy();
  return update;
}

const ids = (room: DocRoom) =>
  yArrayToBlocks(room.doc.getArray('blocks') as Y.Array<Y.Map<unknown>>).map((b) => b.id);

describe('DocRoom.applyExternalUpdate — authoritative replace, not merge', () => {
  it('replaces a STALE populated room ([A,B]) with the fan-out payload ([C,D])', () => {
    const room = new DocRoom('post:1', stubPersistence);
    blocksToYArray([A, B], room.doc.getArray('blocks')); // room seeded pre-write
    room.applyExternalUpdate(encodeReplacement([C, D]), 'mcp-test');
    expect(ids(room)).toEqual(['CCC', 'DDD']); // NOT ['AAA','BBB','CCC','DDD']
  });

  it('applies cleanly to an EMPTY room (first fan-out, no editor open)', () => {
    const room = new DocRoom('post:2', stubPersistence);
    room.applyExternalUpdate(encodeReplacement([C, D]), 'mcp-test');
    expect(ids(room)).toEqual(['CCC', 'DDD']);
  });

  it('documents the underlying Yjs defect the fix removes (bare applyUpdate merges)', () => {
    // A plain doc + bare Y.applyUpdate (the pre-fix behavior) duplicates: all four
    // blocks survive instead of the stale [A,B] being replaced by [C,D].
    const doc = new Y.Doc();
    blocksToYArray([A, B], doc.getArray('blocks'));
    Y.applyUpdate(doc, encodeReplacement([C, D]));
    const merged = yArrayToBlocks(doc.getArray('blocks') as Y.Array<Y.Map<unknown>>).map((b) => b.id);
    // The defect is the MERGE (all four present), not any particular order — Yjs orders the
    // two position-0 insert-runs by its random per-doc clientID tiebreak, so assert the SET.
    expect(merged).toHaveLength(4);
    expect([...merged].sort()).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
  });
});
