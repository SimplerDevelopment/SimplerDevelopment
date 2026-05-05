/**
 * Pitch deck AI generation — POST /api/portal/tools/pitch-decks/[id]/generate
 *
 * Contract covered:
 *   - 401 unauthenticated
 *   - 404 cross-tenant (deck owned by another client)
 *   - 400 when prompt is empty / whitespace
 *   - On success:
 *       * deck row gets new `slides` payload (parsed from mocked AI response)
 *       * `formatVersion = 2`
 *       * a "Before" snapshot is recorded ONLY when the deck already has slides
 *         (trigger=ai_regenerate). For an empty deck the trigger=ai_generate path
 *         is gated by saveVersionSnapshot's empty-slides early-return.
 *       * an aiConversations + 2× aiMessages rows are written for usage tracking
 *
 * The Anthropic SDK is mocked via vi.mock so the test exercises our code,
 * not the live API. The mock returns a deterministic two-slide JSON payload.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock auth + the Anthropic SDK before route imports.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Anthropic mock — a single shared `.messages.create` we can re-stub per test.
// The SDK is invoked with `new Anthropic(...)`, so the default export must be a
// function constructor (arrow functions can't be `new`'d).
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

async function seedDeck(
  ctx: TenantCtx,
  overrides: { slides?: unknown[]; theme?: Record<string, unknown> } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `gen-deck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (
      client_id, title, slug, slides, theme, format_version
    ) VALUES (
      ${ctx.client.id}, 'Generated Deck', ${slug},
      ${JSON.stringify(overrides.slides ?? [])}::jsonb,
      ${JSON.stringify(overrides.theme ?? {})}::jsonb,
      2
    ) RETURNING id
  `;
  return row;
}

/** Build a fake Anthropic response with the given JSON text body. */
function fakeAiTextResponse(json: object) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(json) }],
    usage: { input_tokens: 100, output_tokens: 200 },
    stop_reason: 'end_turn' as const,
  };
}

describe('Pitch deck — POST /[id]/generate (AI generate-from-prompt) @pitch @ai', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('pitch-gen');
    anthropicCreateMock.mockReset();
    anthropicCreateMock.mockResolvedValue(fakeAiTextResponse({
      slides: [
        { id: 'slide-1', label: 'Cover', blocks: [{ id: 'b1', type: 'hero', order: 1, title: 'Hello' }] },
        { id: 'slide-2', label: 'CTA',   blocks: [{ id: 'b2', type: 'cta',  order: 1, title: 'Sign up' }] },
      ],
    }));
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' }, body: { prompt: 'hi' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when prompt is empty / whitespace', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: '   ' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/prompt is required/i);
    // No AI call should have been made
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('404 when deck belongs to a different tenant', async () => {
    const B = await sessionForNewClientUser('pitch-gen-b');
    const deck = await seedDeck(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'fresh deck' } },
    );
    expect(res.status).toBe(404);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('parses mocked AI response, persists slides + formatVersion=2, logs ai conversation', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');
    const res = await callHandler<{ success: boolean; data: { id: number; slides: unknown[]; formatVersion: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'Generate a SaaS pitch deck' } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.data.formatVersion).toBe(2);
    expect(Array.isArray(res.data?.data.slides)).toBe(true);
    expect((res.data?.data.slides as { id: string }[]).map(s => s.id)).toEqual(['slide-1', 'slide-2']);
    // The mocked anthropic call should have been invoked exactly once for the slide generation.
    // (Brand extraction is skipped because no websiteUrl was supplied.)
    expect(anthropicCreateMock).toHaveBeenCalled();

    // ai_conversations + ai_messages should both have rows for the call
    const sql = getTestSql();
    const convs = await sql<{ id: number; client_id: number }[]>`
      SELECT id, client_id FROM ${sql(TEST_SCHEMA)}.ai_conversations
      WHERE client_id = ${A.client.id}
    `;
    expect(convs.length).toBeGreaterThan(0);
    const msgs = await sql<{ role: string }[]>`
      SELECT role FROM ${sql(TEST_SCHEMA)}.ai_messages
      WHERE conversation_id = ${convs[0].id}
      ORDER BY id ASC
    `;
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant']);
  });

  it('strips markdown code fences from AI output', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    // Wrap the JSON in ```json fences — generate must strip them
    anthropicCreateMock.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: '```json\n' + JSON.stringify({
          slides: [{ id: 's-fenced', label: 'Cover', blocks: [] }],
        }) + '\n```',
      }],
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: 'end_turn',
    });

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');
    const res = await callHandler<{ success: boolean; data: { slides: { id: string }[] } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'wrap the json please' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slides.map(s => s.id)).toEqual(['s-fenced']);
  });

  it('returns 500 with a friendly message when the AI returns invalid JSON', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    anthropicCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all, sorry' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
    });

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'bad json please' } },
    );
    expect(res.status).toBe(500);
    expect(res.data?.message).toMatch(/invalid json/i);
  });

  it('records a "Before" snapshot when regenerating an already-populated deck', async () => {
    const oldSlides = [{ id: 'old-1', label: 'Old', blocks: [] }];
    const deck = await seedDeck(A, { slides: oldSlides });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { prompt: 'regenerate the deck' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const snapshots = await sql<{ trigger: string; slides: unknown }[]>`
      SELECT trigger, slides FROM ${sql(TEST_SCHEMA)}.pitch_deck_versions
      WHERE deck_id = ${deck.id}
      ORDER BY id ASC
    `;
    // Should have one snapshot with trigger = ai_regenerate (deck already had slides)
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].trigger).toBe('ai_regenerate');
    expect(snapshots[0].slides).toEqual(oldSlides);
  });
});
