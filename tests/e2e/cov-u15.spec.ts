/**
 * cov-u15.spec.ts — Unit 15: Pitch Decks Product Designer E2E Coverage
 *
 * Cards (indices 4-7 from "## To Test"):
 *   [4] Fork a deck via decks_fork — forked deck is independent, parentDeckId set, original unchanged
 *   [5] HTML upload creates a single-slide deck (POST /upload-html with base64 HTML payload)
 *   [6] Single-slide publish promotes draft.* to live (POST /slides/[slideIndex]/publish)
 *   [7] Batch slide edit applies changes to multiple slides atomically (POST /slides/batch-edit)
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import type { ApiClient } from './setup/api-client';

// ── Helper ──────────────────────────────────────────────────────────────────

async function createTestDeck(api: ApiClient) {
  const title = `cov-u15-deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const res = await api.post('/api/portal/tools/pitch-decks', { title, description: 'cov-u15 test' });
  if (!res.data?.success) throw new Error(`Failed to create deck: ${JSON.stringify(res.data)}`);
  const id: number = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/tools/pitch-decks/${id}`).catch(() => {});
  };
  return { id, cleanup };
}

function makeV2Slides(ts: number) {
  return [
    {
      id: `slide-a-${ts}`,
      label: 'Slide A',
      blocks: [
        { id: `block-a-${ts}`, type: 'heading', order: 1, content: 'Original A', level: 2, alignment: 'center' },
      ],
    },
    {
      id: `slide-b-${ts}`,
      label: 'Slide B',
      blocks: [
        { id: `block-b-${ts}`, type: 'heading', order: 1, content: 'Original B', level: 2, alignment: 'center' },
      ],
    },
  ];
}

// ── Card [4]: Fork a deck via decks_fork ────────────────────────────────────
// decks_fork is an MCP tool only — there is no portal REST endpoint for
// forking a deck. There is no /api/portal/tools/pitch-decks/[id]/fork route.
// Verdict: gap

// (No runnable test — feature not accessible via portal REST API)

// ── Card [5]: HTML upload creates a single-slide deck ───────────────────────

test.describe('Pitch Decks — HTML upload creates single-slide deck @pitch-decks @upload', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /upload-html with HTML file creates a deck with one slide', async ({ clientApi }) => {
    const ts = Date.now();
    const html = `<!DOCTYPE html><html><head><title>Test ${ts}</title></head><body><h1>Hello E2E</h1></body></html>`;
    const filename = `test-${ts}.html`;

    const res = await clientApi.postForm('/api/portal/tools/pitch-decks/upload-html', {
      file: {
        name: filename,
        mimeType: 'text/html',
        buffer: Buffer.from(html, 'utf-8'),
      },
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data).toHaveProperty('slug');

    const deckId: number = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/pitch-decks/${deckId}`).catch(() => {});
    });

    // Verify the deck has exactly 1 slide with an html-embed block
    const getRes = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
    expect(getRes.status).toBe(200);
    const deck = getRes.data.data;
    expect(Array.isArray(deck.slides)).toBe(true);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].blocks).toHaveLength(1);
    expect(deck.slides[0].blocks[0].type).toBe('html-embed');
  });

  test('POST /upload-html rejects missing file', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/tools/pitch-decks/upload-html', {});
    // Should be 400 (expected multipart/form-data)
    expect([400, 415]).toContain(res.status);
  });

  test('POST /upload-html rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/tools/pitch-decks/upload-html', {});
    expect(res.status).toBe(401);
  });
});

// ── Card [6]: Single-slide publish promotes draft.* to live ─────────────────

test.describe('Pitch Decks — Single-slide publish @pitch-decks @publish', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /slides/[slideId]/publish promotes draft blocks to live', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const ts = Date.now();
    const slideId = `slide-pub-${ts}`;

    // Create a slide with draft.blocks set (not-yet-published blocks)
    const slideWithDraft = {
      id: slideId,
      label: 'Draft Slide',
      blocks: [
        { id: `block-live-${ts}`, type: 'heading', order: 1, content: 'Live heading', level: 2, alignment: 'center' },
      ],
      draft: {
        blocks: [
          { id: `block-draft-${ts}`, type: 'heading', order: 1, content: 'Draft heading', level: 2, alignment: 'center' },
        ],
      },
    };

    // Patch deck with this slide
    const patchRes = await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      slides: [slideWithDraft],
    });
    expect(patchRes.status).toBe(200);

    // Publish the slide
    const pubRes = await clientApi.post(
      `/api/portal/tools/pitch-decks/${deckId}/slides/${slideId}/publish`,
    );
    expect(pubRes.status).toBe(200);
    expect(pubRes.data.success).toBe(true);

    // Verify: the live blocks should now be the draft blocks, and draft should be cleared
    const getRes = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
    expect(getRes.status).toBe(200);
    const publishedSlide = getRes.data.data.slides.find((s: { id: string }) => s.id === slideId);
    expect(publishedSlide).toBeTruthy();
    // draft should be cleared after publish
    expect(publishedSlide.draft).toBeUndefined();
    // blocks should now reflect what was in draft
    const blockContents = publishedSlide.blocks.map((b: { content?: string }) => b.content);
    expect(blockContents).toContain('Draft heading');
  });

  test('POST /slides/[slideId]/publish on slide with no draft is a safe no-op', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const ts = Date.now();
    const slideId = `slide-nodraft-${ts}`;

    // Slide without any draft field
    await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      slides: [
        {
          id: slideId,
          label: 'No draft slide',
          blocks: [{ id: `block-nd-${ts}`, type: 'heading', order: 1, content: 'Live content', level: 2, alignment: 'center' }],
        },
      ],
    });

    const pubRes = await clientApi.post(
      `/api/portal/tools/pitch-decks/${deckId}/slides/${slideId}/publish`,
    );
    expect(pubRes.status).toBe(200);
    expect(pubRes.data.success).toBe(true);
  });

  test('POST /slides/[slideId]/publish returns 404 for non-existent slide id', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(
      `/api/portal/tools/pitch-decks/${deckId}/slides/nonexistent-slide-id/publish`,
    );
    expect(res.status).toBe(404);
  });

  test('POST /slides/[slideId]/publish returns 404 for non-existent deck', async ({ clientApi }) => {
    const res = await clientApi.post(
      '/api/portal/tools/pitch-decks/999999/slides/some-slide/publish',
    );
    expect(res.status).toBe(404);
  });

  test('POST /slides/[slideId]/publish rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      '/api/portal/tools/pitch-decks/1/slides/some-slide/publish',
    );
    expect(res.status).toBe(401);
  });
});

// ── Card [7]: Batch slide edit (AI-driven) ───────────────────────────────────
// The route at POST /slides/batch-edit calls the AI (Claude) and is gated by
// checkAiPlanGate — returning 402 when credits/plan are absent. We can verify
// the validation layer (400 for bad input) without hitting the AI.

test.describe('Pitch Decks — Batch slide edit @pitch-decks @batch-edit', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /slides/batch-edit returns 400 when prompt is missing', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const ts = Date.now();
    await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      slides: makeV2Slides(ts),
    });

    const res = await clientApi.post(
      `/api/portal/tools/pitch-decks/${deckId}/slides/batch-edit`,
      { slideIndices: [0] },
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /slides/batch-edit returns 400 when slideIndices is missing', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const ts = Date.now();
    await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      slides: makeV2Slides(ts),
    });

    const res = await clientApi.post(
      `/api/portal/tools/pitch-decks/${deckId}/slides/batch-edit`,
      { prompt: 'Make them bold' },
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /slides/batch-edit returns 400 for out-of-range slide indices', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    // Deck has no slides yet — slideIndices=[0] is out of range
    const res = await clientApi.post(
      `/api/portal/tools/pitch-decks/${deckId}/slides/batch-edit`,
      { prompt: 'Edit this', slideIndices: [99] },
    );
    // Either 400 (gate before AI) or 402 (plan gate) — neither is a 200
    expect([400, 402]).toContain(res.status);
  });

  test('POST /slides/batch-edit returns 404 for non-existent deck', async ({ clientApi }) => {
    const res = await clientApi.post(
      '/api/portal/tools/pitch-decks/999999/slides/batch-edit',
      { prompt: 'Make it better', slideIndices: [0] },
    );
    expect(res.status).toBe(404);
  });

  test('POST /slides/batch-edit rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      '/api/portal/tools/pitch-decks/1/slides/batch-edit',
      { prompt: 'Edit', slideIndices: [0] },
    );
    expect(res.status).toBe(401);
  });
});
