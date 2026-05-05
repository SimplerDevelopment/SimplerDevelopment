/**
 * Pitch deck batch slide edit —
 *   POST /api/portal/tools/pitch-decks/[id]/slides/batch-edit
 *
 * Contract covered:
 *   - 401 unauth, 404 cross-tenant
 *   - 400 missing prompt, 400 missing/empty slideIndices
 *   - 400 when ALL provided indices are out of range
 *   - Success path:
 *       * mocked AI returns a 2-slide patch; only the targeted indices are
 *         replaced; non-targeted slides are preserved verbatim
 *       * a `ai_slide_edit` snapshot is written to pitch_deck_versions
 *       * formatVersion is bumped/normalised to 2
 *
 * The Anthropic SDK is mocked.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
const anthropicCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  function Anthropic(this: { messages: { create: typeof anthropicCreateMock } }) {
    this.messages = { create: anthropicCreateMock };
  }
  return { default: Anthropic };
});

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const initialSlides = [
  { id: 'slide-A', label: 'A', blocks: [{ id: 'b-a', type: 'heading', order: 1, content: 'A heading', level: 1 }], notes: '' },
  { id: 'slide-B', label: 'B', blocks: [{ id: 'b-b', type: 'heading', order: 1, content: 'B heading', level: 1 }], notes: '' },
  { id: 'slide-C', label: 'C', blocks: [{ id: 'b-c', type: 'heading', order: 1, content: 'C heading', level: 1 }], notes: '' },
];

async function seedDeck(ctx: TenantCtx, slides: unknown[] = initialSlides): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `batch-deck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (
      client_id, title, slug, slides, theme, format_version
    ) VALUES (
      ${ctx.client.id}, 'Batch Deck', ${slug},
      ${JSON.stringify(slides)}::jsonb,
      ${JSON.stringify({})}::jsonb,
      2
    ) RETURNING id
  `;
  return row;
}

describe('Pitch deck — POST /[id]/slides/batch-edit @pitch @ai', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('pitch-batch');
    anthropicCreateMock.mockReset();
    // Default mock: returns two patched slides with identical IDs to the originals
    anthropicCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          slides: [
            { id: 'slide-A', label: 'A!', blocks: [{ id: 'b-a', type: 'heading', order: 1, content: 'A heading edited', level: 1 }], notes: '' },
            { id: 'slide-C', label: 'C!', blocks: [{ id: 'b-c', type: 'heading', order: 1, content: 'C heading edited', level: 1 }], notes: '' },
          ],
        }),
      }],
      usage: { input_tokens: 50, output_tokens: 200 },
      stop_reason: 'end_turn',
    });
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' }, body: { prompt: 'x', slideIndices: [0] } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('pitch-batch-b');
    const deck = await seedDeck(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'x', slideIndices: [0] } },
    );
    expect(res.status).toBe(404);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('400 when prompt is empty', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: '   ', slideIndices: [0, 1] } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/prompt/i);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('400 when slideIndices is missing or empty', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'tighten copy', slideIndices: [] } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/no slides selected/i);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('400 when ALL provided indices are out of range', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'tighten', slideIndices: [99, 100] } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/invalid slide indices/i);
  });

  it('replaces ONLY targeted slides + records ai_slide_edit snapshot', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route');
    const res = await callHandler<{ success: boolean; data: { slides: { id: string; label: string }[]; formatVersion: number }; editedCount: number }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'rephrase as questions', slideIndices: [0, 2] } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.data.formatVersion).toBe(2);
    expect(res.data?.editedCount).toBe(2);

    const slides = res.data!.data.slides;
    expect(slides.length).toBe(3);
    // Index 0 was replaced with the AI's first slide
    expect(slides[0].id).toBe('slide-A');
    expect(slides[0].label).toBe('A!');
    // Index 1 (NOT targeted) is preserved verbatim
    expect(slides[1].id).toBe('slide-B');
    expect(slides[1].label).toBe('B');
    // Index 2 was replaced with the AI's second slide
    expect(slides[2].id).toBe('slide-C');
    expect(slides[2].label).toBe('C!');

    // A pre-edit snapshot should have been written
    const sql = getTestSql();
    const snapshots = await sql<{ trigger: string }[]>`
      SELECT trigger FROM ${sql(TEST_SCHEMA)}.pitch_deck_versions
      WHERE deck_id = ${deck.id}
    `;
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].trigger).toBe('ai_slide_edit');
  });
});
