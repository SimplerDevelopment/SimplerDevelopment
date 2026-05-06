// @vitest-environment node
/**
 * Smoke tests for the three Yjs ↔ React bindings:
 *   - bindPostToYjs (lib/realtime/post-binding.ts)
 *   - bindDeckToYjs (lib/realtime/deck-binding.ts)
 *   - bindEmailToYjs (lib/realtime/email-binding.ts)
 *
 * Pure in-memory Y.Doc — no network. Verifies seed/adopt, local→Y, Y→local
 * propagation, the local-origin loop guard, and that `unbind()` detaches.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { bindPostToYjs } from '@/lib/realtime/post-binding';
import { bindDeckToYjs } from '@/lib/realtime/deck-binding';
import { bindEmailToYjs } from '@/lib/realtime/email-binding';
import {
  Y_BLOCKS_KEY,
  blocksToYArray,
  getOrCreateSlidesArray,
  slidesToYArray,
} from '@/lib/realtime/doc-model';
import type { Block } from '@/types/blocks';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

const block = (id: string, text: string): Block =>
  ({ id, type: 'text', order: 0, content: text } as unknown as Block);

/** Wait one microtask tick so `queueMicrotask`-based callbacks can fire. */
const flushMicrotasks = (): Promise<void> => Promise.resolve();

describe('bindPostToYjs', () => {
  it('seeds an empty Y.Array from initialBlocks', () => {
    const ydoc = new Y.Doc();
    const calls: Block[][] = [];
    const bound = bindPostToYjs({
      ydoc,
      initialBlocks: [block('a', 'A')],
      onRemoteBlocks: (b) => calls.push(b),
    });
    const arr = ydoc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY);
    expect(arr.length).toBe(1);
    bound.unbind();
  });

  it('a remote update fires onRemoteBlocks once with the full snapshot', () => {
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    const remoteCalls: Block[][] = [];

    const bound = bindPostToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: (b) => remoteCalls.push(b),
    });

    // Simulate a peer: encode an update on a separate doc and apply it to ours
    // with a non-local origin so the binding's filter doesn't ignore it.
    const remoteArr = remote.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY);
    blocksToYArray([block('r1', 'remote')], remoteArr);
    const update = Y.encodeStateAsUpdate(remote);
    Y.applyUpdate(ydoc, update, 'remote-peer');

    expect(remoteCalls.length).toBeGreaterThan(0);
    const last = remoteCalls[remoteCalls.length - 1];
    expect(last.map((b) => b.id)).toEqual(['r1']);
    bound.unbind();
  });

  it('applyLocalBlocks updates the underlying Y.Array', () => {
    const ydoc = new Y.Doc();
    const bound = bindPostToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: () => {},
    });

    bound.applyLocalBlocks([block('a', 'one'), block('b', 'two')]);
    const arr = ydoc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY);
    expect(arr.length).toBe(2);
    expect((arr.get(0) as Y.Map<unknown>).get('id')).toBe('a');
    expect((arr.get(1) as Y.Map<unknown>).get('id')).toBe('b');
    bound.unbind();
  });

  it('local writes do NOT echo back through onRemoteBlocks (origin filter)', () => {
    const ydoc = new Y.Doc();
    const remoteCalls: Block[][] = [];
    const bound = bindPostToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: (b) => remoteCalls.push(b),
    });

    bound.applyLocalBlocks([block('x', 'mine')]);
    expect(remoteCalls).toHaveLength(0);
    bound.unbind();
  });

  it('unbind() detaches — subsequent remote updates do not fire onRemoteBlocks', () => {
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    const remoteCalls: Block[][] = [];
    const bound = bindPostToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: (b) => remoteCalls.push(b),
    });

    bound.unbind();

    // Apply a remote update post-unbind.
    blocksToYArray([block('r1', 'after-unbind')], remote.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY));
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote), 'remote-peer');

    expect(remoteCalls).toHaveLength(0);
  });

  it('adopts existing Y state on mount (queueMicrotask) when Y.Array is non-empty', async () => {
    const ydoc = new Y.Doc();
    blocksToYArray(
      [block('pre', 'preexisting')],
      ydoc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY),
    );

    const remoteCalls: Block[][] = [];
    const bound = bindPostToYjs({
      ydoc,
      initialBlocks: [block('local', 'should-be-ignored')],
      onRemoteBlocks: (b) => remoteCalls.push(b),
    });

    await flushMicrotasks();
    expect(remoteCalls).toHaveLength(1);
    expect(remoteCalls[0].map((b) => b.id)).toEqual(['pre']);
    bound.unbind();
  });
});

describe('bindDeckToYjs', () => {
  const slide = (id: string, label: string): PitchDeckSlideV2 =>
    ({ id, label, blocks: [] } as unknown as PitchDeckSlideV2);

  it('seeds an empty slides Y.Array from initialSlides', () => {
    const ydoc = new Y.Doc();
    const bound = bindDeckToYjs({
      ydoc,
      initialSlides: [slide('s1', 'Cover'), slide('s2', 'Agenda')],
      onRemoteSlides: () => {},
    });
    expect(getOrCreateSlidesArray(ydoc).length).toBe(2);
    bound.unbind();
  });

  it('fires onRemoteSlides synchronously when Y already has slides on mount', () => {
    const ydoc = new Y.Doc();
    slidesToYArray([slide('pre', 'Pre')], getOrCreateSlidesArray(ydoc));

    const calls: PitchDeckSlideV2[][] = [];
    const bound = bindDeckToYjs({
      ydoc,
      initialSlides: [],
      onRemoteSlides: (s) => calls.push(s),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]?.id).toBe('pre');
    bound.unbind();
  });

  it('applyLocalSlides replaces the Y array contents', () => {
    const ydoc = new Y.Doc();
    const bound = bindDeckToYjs({
      ydoc,
      initialSlides: [slide('s1', 'a')],
      onRemoteSlides: () => {},
    });

    bound.applyLocalSlides([slide('s2', 'b'), slide('s3', 'c')]);
    const out = getOrCreateSlidesArray(ydoc);
    expect(out.length).toBe(2);
    expect((out.get(0) as Y.Map<unknown>).get('id')).toBe('s2');
    bound.unbind();
  });

  it('local applyLocalSlides does not re-fire onRemoteSlides (origin filter)', () => {
    const ydoc = new Y.Doc();
    const calls: PitchDeckSlideV2[][] = [];
    const bound = bindDeckToYjs({
      ydoc,
      initialSlides: [],
      onRemoteSlides: (s) => calls.push(s),
    });

    bound.applyLocalSlides([slide('s1', 'fresh')]);
    expect(calls).toHaveLength(0);
    bound.unbind();
  });

  it('a remote update fires onRemoteSlides', () => {
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    const calls: PitchDeckSlideV2[][] = [];

    const bound = bindDeckToYjs({
      ydoc,
      initialSlides: [],
      onRemoteSlides: (s) => calls.push(s),
    });

    slidesToYArray([slide('rs', 'remote')], getOrCreateSlidesArray(remote));
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote), 'remote-peer');

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]?.[0]?.id).toBe('rs');
    bound.unbind();
  });

  it('unbind() prevents further onRemoteSlides invocations', () => {
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    const calls: PitchDeckSlideV2[][] = [];
    const bound = bindDeckToYjs({
      ydoc,
      initialSlides: [],
      onRemoteSlides: (s) => calls.push(s),
    });

    bound.unbind();
    slidesToYArray([slide('rs', 'late')], getOrCreateSlidesArray(remote));
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote), 'remote-peer');

    expect(calls).toHaveLength(0);
  });

  it('unbind() is idempotent', () => {
    const ydoc = new Y.Doc();
    const bound = bindDeckToYjs({
      ydoc,
      initialSlides: [],
      onRemoteSlides: () => {},
    });
    bound.unbind();
    expect(() => bound.unbind()).not.toThrow();
  });
});

describe('bindEmailToYjs', () => {
  it('seeds the blocks Y.Array from initialBlocks', () => {
    const ydoc = new Y.Doc();
    const bound = bindEmailToYjs({
      ydoc,
      initialBlocks: [block('a', 'A')],
      onRemoteBlocks: () => {},
    });
    expect(ydoc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY).length).toBe(1);
    bound.unbind();
  });

  it('local applyLocalBlocks does not re-enter onRemoteBlocks', () => {
    const ydoc = new Y.Doc();
    const calls: Block[][] = [];
    const bound = bindEmailToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: (b) => calls.push(b),
    });

    bound.applyLocalBlocks([block('a', 'mine')]);
    expect(calls).toHaveLength(0);
    bound.unbind();
  });

  it('remote update with a non-email origin fires onRemoteBlocks', () => {
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    const calls: Block[][] = [];
    const bound = bindEmailToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: (b) => calls.push(b),
    });

    blocksToYArray(
      [block('r', 'remote')],
      remote.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY),
    );
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote), 'remote-peer');

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]?.map((b) => b.id)).toEqual(['r']);
    bound.unbind();
  });

  it('unbind detaches the listener', () => {
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    const calls: Block[][] = [];
    const bound = bindEmailToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: (b) => calls.push(b),
    });

    bound.unbind();
    blocksToYArray([block('r', 'late')], remote.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY));
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote), 'remote-peer');
    expect(calls).toHaveLength(0);
  });

  it('unbind is idempotent', () => {
    const ydoc = new Y.Doc();
    const bound = bindEmailToYjs({
      ydoc,
      initialBlocks: [],
      onRemoteBlocks: () => {},
    });
    bound.unbind();
    expect(() => bound.unbind()).not.toThrow();
  });

  it('adopts existing Y state on mount (queueMicrotask) when Y.Array is non-empty', async () => {
    const ydoc = new Y.Doc();
    blocksToYArray(
      [block('pre', 'pre-existing')],
      ydoc.getArray<Y.Map<unknown>>(Y_BLOCKS_KEY),
    );

    const calls: Block[][] = [];
    const bound = bindEmailToYjs({
      ydoc,
      initialBlocks: [block('local', 'should-not-overwrite')],
      onRemoteBlocks: (b) => calls.push(b),
    });

    await flushMicrotasks();
    expect(calls).toHaveLength(1);
    expect(calls[0].map((b) => b.id)).toEqual(['pre']);
    bound.unbind();
  });
});
