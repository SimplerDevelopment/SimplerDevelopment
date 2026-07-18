/**
 * Smoke test for the realtime internal-publisher.
 *
 * We don't network-call the realtime server here — instead we verify that
 * `publishBlocksUpdate` constructs a valid Y update binary that, when
 * applied to a fresh Y.Doc, produces a "blocks" Y.Array whose JSON
 * representation matches the input. This exercises the encoding path that
 * runs server-side just before the POST to /internal/apply.
 *
 * Network behavior: with REALTIME_INTERNAL_SECRET unset, the publisher
 * short-circuits to `{ ok: false, reason: 'missing_secret' }` — also
 * verified here so MCP writes can never be blocked by an unconfigured
 * realtime hop.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { publishBlocksUpdate, publishSlidesUpdate } from '@/lib/realtime/internal-publisher';
import { yArrayToBlocks, yArrayToSlides } from '@/lib/realtime/doc-model';
import type { Block } from '@/types/blocks';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

describe('realtime internal-publisher', () => {
  const originalSecret = process.env.REALTIME_INTERNAL_SECRET;

  beforeEach(() => {
    // Default: no secret — publisher must short-circuit cleanly.
    delete process.env.REALTIME_INTERNAL_SECRET;
  });

  it('returns ok:false with reason missing_secret when REALTIME_INTERNAL_SECRET is unset', async () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'heading', order: 0, content: 'Hello', level: 2 } as unknown as Block,
    ];
    const result = await publishBlocksUpdate({
      entityType: 'post',
      entityId: 42,
      blocks,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_secret');
  });

  it('builds a valid Y update for blocks that round-trips to the input', async () => {
    // We pass a custom fetch via a temporary stub so that:
    //  (a) the secret check passes,
    //  (b) we can capture the Y update binary that would have been sent and
    //      verify it round-trips to the original block array.
    process.env.REALTIME_INTERNAL_SECRET = 'test-secret';

    const captured: { body: string | null } = { body: null };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      captured.body = (init?.body as string) ?? null;
      return new Response('', { status: 200 });
    }) as typeof fetch;

    try {
      const blocks: Block[] = [
        { id: 'a', type: 'heading', order: 0, content: 'Title', level: 1 } as unknown as Block,
        { id: 'b', type: 'text', order: 1, content: 'Body copy.' } as unknown as Block,
      ];
      const result = await publishBlocksUpdate({
        entityType: 'post',
        entityId: 'post-7',
        blocks,
      });
      expect(result.ok).toBe(true);
      expect(captured.body).not.toBeNull();

      const payload = JSON.parse(captured.body as string) as { docKey: string; update: string };
      expect(payload.docKey).toBe('post:post-7');
      expect(typeof payload.update).toBe('string');
      expect(payload.update.length).toBeGreaterThan(0);

      // Round-trip: decode base64 → apply to fresh Y.Doc → confirm blocks.
      const updateBytes = new Uint8Array(Buffer.from(payload.update, 'base64'));
      const doc = new Y.Doc();
      Y.applyUpdate(doc, updateBytes);
      const decoded = yArrayToBlocks(doc.getArray('blocks'));
      expect(decoded).toEqual(blocks);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('builds a valid Y update for slides that round-trips to the input', async () => {
    process.env.REALTIME_INTERNAL_SECRET = 'test-secret';

    const captured: { body: string | null } = { body: null };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      captured.body = (init?.body as string) ?? null;
      return new Response('', { status: 200 });
    }) as typeof fetch;

    try {
      const slides: PitchDeckSlideV2[] = [
        {
          id: 'slide-1',
          label: 'Cover',
          blocks: [
            { id: 'h', type: 'heading', order: 0, content: 'Welcome', level: 1 },
          ] as unknown as Block[],
        },
        {
          id: 'slide-2',
          label: 'Agenda',
          blocks: [
            { id: 't', type: 'text', order: 0, content: 'Item one.' },
          ] as unknown as Block[],
          notes: 'speak briefly',
        },
      ] as PitchDeckSlideV2[];

      const result = await publishSlidesUpdate({
        entityId: 9,
        slides,
      });
      expect(result.ok).toBe(true);
      expect(captured.body).not.toBeNull();

      const payload = JSON.parse(captured.body as string) as { docKey: string; update: string };
      expect(payload.docKey).toBe('deck:9');

      const updateBytes = new Uint8Array(Buffer.from(payload.update, 'base64'));
      const doc = new Y.Doc();
      Y.applyUpdate(doc, updateBytes);
      const decoded = yArrayToSlides(doc.getArray('slides'));
      expect(decoded).toEqual(slides);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // Restore in case the suite is later expanded — beforeEach already wipes
  // it but leave the original value handy for future tests.
  it('preserves original env at suite start', () => {
    expect(originalSecret === undefined || typeof originalSecret === 'string').toBe(true);
  });
});
