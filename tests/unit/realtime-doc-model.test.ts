/**
 * Smoke tests for the realtime doc-model serializer. Pure Yjs in-memory —
 * no DB, no WebSocket. Verifies that JSON blocks round-trip through the
 * Y.Array<Y.Map> representation and that two concurrent doc updates merge
 * into a deterministic final state.
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  blocksToYArray,
  yArrayToBlocks,
  yArrayToJSON,
  slidesToYArray,
  yArrayToSlides,
  getOrCreateBlocksArray,
  getOrCreateSlidesArray,
  docKey,
  parseDocKey,
} from '@/lib/realtime/doc-model';
import type { Block } from '@/types/blocks';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

describe('realtime doc-model', () => {
  it('round-trips a simple block array', () => {
    const blocks: Block[] = [
      {
        id: 'a',
        type: 'heading',
        text: 'Hello',
        level: 'h1',
      } as unknown as Block,
      {
        id: 'b',
        type: 'text',
        text: 'World',
      } as unknown as Block,
    ];

    const doc = new Y.Doc();
    const arr = getOrCreateBlocksArray(doc);
    blocksToYArray(blocks, arr);

    const out = yArrayToBlocks(arr);
    expect(out).toEqual(blocks);
  });

  it('round-trips slides containing nested blocks', () => {
    const slides: PitchDeckSlideV2[] = [
      {
        id: 's1',
        label: 'Cover',
        blocks: [
          { id: 'b1', type: 'heading', text: 'Title', level: 'h1' } as unknown as Block,
        ],
      },
    ];

    const doc = new Y.Doc();
    const arr = getOrCreateSlidesArray(doc);
    slidesToYArray(slides, arr);

    const out = yArrayToSlides(arr);
    expect(out).toEqual(slides);
  });

  it('yArrayToJSON returns a plain JSON snapshot for snapshot persistence', () => {
    const doc = new Y.Doc();
    const arr = getOrCreateBlocksArray(doc);
    blocksToYArray(
      [
        { id: 'x', type: 'text', text: 'first' } as unknown as Block,
        { id: 'y', type: 'text', text: 'second' } as unknown as Block,
      ],
      arr
    );

    const snap = yArrayToJSON(arr);
    expect(snap).toHaveLength(2);
    expect((snap[0] as { id: string }).id).toBe('x');
  });

  it('docKey + parseDocKey are inverses', () => {
    const k = docKey('post', 'abc-123');
    expect(k).toBe('post:abc-123');
    const parsed = parseDocKey(k);
    expect(parsed).toEqual({ entityType: 'post', entityId: 'abc-123' });
  });

  it('parseDocKey rejects malformed keys', () => {
    expect(parseDocKey('post')).toBeNull();
    expect(parseDocKey(':abc')).toBeNull();
    expect(parseDocKey('thing:abc')).toBeNull();
  });

  it('two docs converge after exchanging updates (Y array merge)', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const arrA = getOrCreateBlocksArray(docA);
    blocksToYArray(
      [
        { id: '1', type: 'text', text: 'A0' } as unknown as Block,
        { id: '2', type: 'text', text: 'A1' } as unknown as Block,
      ],
      arrA
    );

    // Sync A → B.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // A inserts at the front while B appends. Both edits should survive.
    const arrA2 = getOrCreateBlocksArray(docA);
    arrA2.insert(0, [
      (() => {
        const m = new Y.Map<unknown>();
        m.set('id', '0');
        m.set('type', 'text');
        m.set('text', 'inserted-front');
        return m;
      })(),
    ]);

    const arrB2 = getOrCreateBlocksArray(docB);
    arrB2.push([
      (() => {
        const m = new Y.Map<unknown>();
        m.set('id', '3');
        m.set('type', 'text');
        m.set('text', 'appended-end');
        return m;
      })(),
    ]);

    // Cross-sync.
    const updateAB = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateBA = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
    Y.applyUpdate(docB, updateAB);
    Y.applyUpdate(docA, updateBA);

    const finalA = yArrayToBlocks(getOrCreateBlocksArray(docA));
    const finalB = yArrayToBlocks(getOrCreateBlocksArray(docB));

    // Both replicas converge on the same array.
    expect(finalA).toEqual(finalB);
    expect(finalA).toHaveLength(4);
    // The front insert and the append both survived.
    expect(finalA[0]?.id).toBe('0');
    expect(finalA[finalA.length - 1]?.id).toBe('3');
  });
});
