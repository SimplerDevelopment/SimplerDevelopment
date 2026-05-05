/**
 * Pitch deck slide-level mutations.
 *
 * Routes:
 *   POST  /api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate
 *         — AI rewrite/edit of a single slide. Mocks the Anthropic SDK.
 *   PATCH /api/portal/tools/pitch-decks/[id]
 *         — used to insert / update / delete slides as a slides[] array
 *           (the deck stores slides as JSONB). Cross-tenant mutations must
 *           NOT mutate the target row.
 *
 * Contract covered:
 *   - 401 unauth on slide AI generate
 *   - 404 cross-tenant on slide AI generate (deck owner mismatch)
 *   - 400 invalid slide index (negative / out of range)
 *   - 400 empty prompt
 *   - Success: replaces ONLY the targeted slide; others preserved;
 *     a snapshot is recorded.
 *   - PATCH cross-tenant on slides array: 404 + no mutation (insert/update/delete are
 *     all expressed as PATCH on `slides`).
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

const slideA = { id: 'slide-A', label: 'A', blocks: [{ id: 'b-a', type: 'heading', order: 1, content: 'A heading', level: 1 }], notes: '' };
const slideB = { id: 'slide-B', label: 'B', blocks: [{ id: 'b-b', type: 'heading', order: 1, content: 'B heading', level: 1 }], notes: '' };
const slideC = { id: 'slide-C', label: 'C', blocks: [{ id: 'b-c', type: 'heading', order: 1, content: 'C heading', level: 1 }], notes: '' };

async function seedDeck(ctx: TenantCtx, slides: unknown[] = [slideA, slideB, slideC]): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `slide-deck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (
      client_id, title, slug, slides, theme, format_version
    ) VALUES (
      ${ctx.client.id}, 'Slide Deck', ${slug},
      ${JSON.stringify(slides)}::jsonb,
      ${JSON.stringify({})}::jsonb,
      2
    ) RETURNING id
  `;
  return row;
}

describe('Pitch deck — POST /[id]/slides/[slideIndex]/generate @pitch @ai @slides', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('pitch-slide');
    anthropicCreateMock.mockReset();
    // Default: returns a full-slide replacement preserving the original id
    anthropicCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: 'slide-B',
          label: 'B-edited',
          blocks: [{ id: 'b-b', type: 'heading', order: 1, content: 'B heading edited', level: 1 }],
          notes: '',
        }),
      }],
      usage: { input_tokens: 30, output_tokens: 60 },
      stop_reason: 'end_turn',
    });
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1', slideIndex: '0' }, body: { prompt: 'hi' } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('pitch-slide-b');
    const deck = await seedDeck(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id), slideIndex: '0' }, body: { prompt: 'edit slide A' } },
    );
    expect(res.status).toBe(404);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('400 when slide index is out of range', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id), slideIndex: '99' }, body: { prompt: 'edit something' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/invalid slide index/i);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('400 when slide index is negative', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id), slideIndex: '-1' }, body: { prompt: 'edit' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/invalid slide index/i);
  });

  it('400 when prompt is empty', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id), slideIndex: '1' }, body: { prompt: '   ' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/prompt is required/i);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('replaces only the targeted slide and writes ai_slide_edit snapshot', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route');
    const res = await callHandler<{ success: boolean; data: { slides: { id: string; label: string }[] } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id), slideIndex: '1' }, body: { prompt: 'Rewrite slide B' } },
    );
    expect(res.status).toBe(200);

    const slides = res.data!.data.slides;
    expect(slides.length).toBe(3);
    expect(slides[0].id).toBe('slide-A');     // untouched
    expect(slides[0].label).toBe('A');
    expect(slides[1].id).toBe('slide-B');     // id preserved
    // The exact label depends on the validator — accept "B-edited" or whatever the
    // validator chose to keep, but it MUST not equal the original "B" untouched.
    expect(slides[1].label === 'B').toBe(false);
    expect(slides[2].id).toBe('slide-C');     // untouched
    expect(slides[2].label).toBe('C');

    const sql = getTestSql();
    const snaps = await sql<{ trigger: string }[]>`
      SELECT trigger FROM ${sql(TEST_SCHEMA)}.pitch_deck_versions
      WHERE deck_id = ${deck.id}
    `;
    expect(snaps.length).toBe(1);
    expect(snaps[0].trigger).toBe('ai_slide_edit');
  });
});

describe('Pitch deck — slides[] mutations via PATCH /[id] @pitch @slides @tenancy', () => {
  it('PATCH slides[] cross-tenant returns 404 and does NOT mutate the target', async () => {
    const A = await sessionForNewClientUser('pitch-slide-patch-a');
    const B = await sessionForNewClientUser('pitch-slide-patch-b');
    const deck = await seedDeck(B, [slideA, slideB]);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(deck.id) }, body: { slides: [{ id: 'evil', label: 'pwn', blocks: [] }] } },
    );
    expect(res.status).toBe(404);

    // The target row should NOT have been mutated. Verify by reading back
    // through the route handler (route returns parsed JSON) — this avoids any
    // raw-SQL jsonb encoding quirks in the test driver.
    mockedAuth.mockResolvedValue(B.session); // owner reads
    const getRoute = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const ownGet = await callHandler<{ success: boolean; data: { slides: { id: string }[] } }>(
      getRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(deck.id) } },
    );
    expect(ownGet.status).toBe(200);
    expect(ownGet.data?.data.slides.map(s => s.id)).toEqual(['slide-A', 'slide-B']);
  });

  it('PATCH replaces the slides array (insert + delete + reorder all in one call)', async () => {
    const A = await sessionForNewClientUser('pitch-slide-patch-own');
    const deck = await seedDeck(A, [slideA, slideB, slideC]);
    mockedAuth.mockResolvedValue(A.session);

    // Insert a new slide between A and B, delete C, reorder so B precedes A.
    const newSlides = [
      slideB,
      { id: 'slide-NEW', label: 'NEW', blocks: [], notes: '' },
      slideA,
    ];

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler<{ success: boolean; data: { slides: { id: string }[]; formatVersion: number } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(deck.id) }, body: { slides: newSlides } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.formatVersion).toBe(2);
    expect(res.data?.data.slides.map(s => s.id)).toEqual(['slide-B', 'slide-NEW', 'slide-A']);
  });
});
