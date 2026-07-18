/**
 * Pitch decks — CRUD + service gate + version save/restore.
 *
 * Contract covered:
 *   - Service gate: returns 403-ish when client has no `pitch-decks` subscription;
 *     opens up once a clientServices row is active.
 *   - Title required on POST (400).
 *   - Slug auto-generated on POST and stored.
 *   - Cross-tenant rejection on GET/PATCH/DELETE (404).
 *   - Slug normalisation + per-client uniqueness on PATCH (409 on collision).
 *   - Versions list returns metadata only (no full slide payload).
 *   - POST /versions saves a snapshot, trigger='manual'.
 *   - POST /versions/[versionId]/restore:
 *       * creates a "Before restore" snapshot of current state
 *       * restores the old version's slides + theme into the live deck
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function enablePitchDeckService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `pitch-decks-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Pitch Decks', ${slug}, 'pitch-decks', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedDeck(ctx: TenantCtx, overrides: { slug?: string; title?: string; slides?: unknown[]; theme?: Record<string, unknown> } = {}): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const slug = overrides.slug ?? `deck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (
      client_id, title, slug, slides, theme, format_version
    ) VALUES (
      ${ctx.client.id}, ${overrides.title ?? 'Test Deck'}, ${slug},
      ${JSON.stringify(overrides.slides ?? [])}::jsonb,
      ${JSON.stringify(overrides.theme ?? {})}::jsonb,
      2
    ) RETURNING id, slug
  `;
  return row;
}

describe('Pitch decks — service gate @pitch', () => {
  it('403 (or similar) when client has no pitch-decks subscription', async () => {
    const A = await sessionForNewClientUser('pitch-nogate');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect([401, 402, 403]).toContain(res.status);
  });

  it('200 once the service is active', async () => {
    const A = await sessionForNewClientUser('pitch-gate-ok');
    await enablePitchDeckService(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data)).toBe(true);
  });
});

describe('Pitch decks — list / create @pitch', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('pitch-crud');
    await enablePitchDeckService(A);
    mockedAuth.mockResolvedValue(A.session);
  });

  it('POST creates a deck with auto-generated slug from title', async () => {
    const route = await import('@/app/api/portal/tools/pitch-decks/route');
    const res = await callHandler<{ success: boolean; data: { id: number; slug: string; title: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'My Amazing Pitch!' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('My Amazing Pitch!');
    expect(res.data?.data.slug).toMatch(/^my-amazing-pitch-[a-z0-9]+$/);
  });

  it('POST rejects missing / empty title with 400', async () => {
    const route = await import('@/app/api/portal/tools/pitch-decks/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: '   ' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/title is required/i);
  });

  it('GET returns decks only for the caller\'s client', async () => {
    const B = await sessionForNewClientUser('pitch-crud-b');
    await enablePitchDeckService(B);
    await seedDeck(A, { title: 'A Deck' });
    await seedDeck(B, { title: 'B Deck' });

    // A sees only their own
    const route = await import('@/app/api/portal/tools/pitch-decks/route');
    const res = await callHandler<{ success: boolean; data: { id: number; title: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const titles = res.data!.data.map(d => d.title);
    expect(titles).toContain('A Deck');
    expect(titles).not.toContain('B Deck');
  });
});

describe('Pitch decks — GET/PATCH/DELETE by id @pitch', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('pitch-id-a'),
      sessionForNewClientUser('pitch-id-b'),
    ]);
    await Promise.all([enablePitchDeckService(A), enablePitchDeckService(B)]);
  });

  it('GET returns 404 when deck is in a different tenant', async () => {
    const deck = await seedDeck(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(deck.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('PATCH updates title / description / status fields', async () => {
    const deck = await seedDeck(A, { title: 'Old' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string; status: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(deck.id) }, body: { title: 'New title', status: 'published' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('New title');
    expect(res.data?.data.status).toBe('published');
  });

  it('PATCH rejects slug with only special chars (400)', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(deck.id) }, body: { slug: '!!!' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/slug/i);
  });

  it('PATCH rejects slug collision with another deck in the same client (409)', async () => {
    const deck1 = await seedDeck(A, { slug: 'taken-slug' });
    const deck2 = await seedDeck(A, { slug: 'other-slug' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(deck2.id) }, body: { slug: deck1.slug } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.message).toMatch(/already used/i);
  });

  it('PATCH allows saving the same slug (self) — no 409', async () => {
    const deck = await seedDeck(A, { slug: 'my-slug' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(deck.id) }, body: { slug: 'My Slug' } },   // normalises back to 'my-slug'
    );
    expect(res.status).toBe(200);
  });

  it('DELETE removes the deck for the owning client', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(deck.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.pitch_decks WHERE id = ${deck.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('DELETE is 404 for a deck in a different tenant + does not mutate', async () => {
    const deck = await seedDeck(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(deck.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.pitch_decks WHERE id = ${deck.id}
    `;
    expect(rows.length).toBe(1);   // still there
  });
});

describe('Pitch decks — versions @pitch', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('pitch-ver');
    await enablePitchDeckService(A);
    mockedAuth.mockResolvedValue(A.session);
  });

  it('GET /versions returns metadata only (no full slides payload)', async () => {
    const deck = await seedDeck(A, {
      slides: [{ id: 's1', blocks: [{ type: 'heading', text: 'Hi' }] }],
    });
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.pitch_deck_versions (deck_id, slides, theme, format_version, label, trigger)
      VALUES (${deck.id},
              ${JSON.stringify([{ id: 's1' }, { id: 's2' }])}::jsonb,
              ${JSON.stringify({})}::jsonb,
              2, 'v1', 'manual')
    `;

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler<{ success: boolean; data: { label: string; slideCount: number; trigger: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(deck.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.length).toBe(1);
    expect(res.data?.data[0].label).toBe('v1');
    expect(res.data?.data[0].trigger).toBe('manual');
    expect(res.data?.data[0].slideCount).toBe(2);
    // Verify the full `slides` array isn't leaked in the list shape
    expect(res.data?.data[0]).not.toHaveProperty('slides');
  });

  it('POST /versions snapshots the deck\'s current slides + theme, trigger=manual', async () => {
    const initialSlides = [{ id: 's1', blocks: [] }, { id: 's2', blocks: [] }];
    const deck = await seedDeck(A, { slides: initialSlides, theme: { accent: '#f00' } });

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler<{ success: boolean; data: { id: number; label: string | null; trigger: string; slideCount: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) }, body: { label: 'checkpoint 1' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.label).toBe('checkpoint 1');
    expect(res.data?.data.trigger).toBe('manual');
    expect(res.data?.data.slideCount).toBe(2);

    const sql = getTestSql();
    const [row] = await sql<{ slides: unknown; theme: unknown; trigger: string }[]>`
      SELECT slides, theme, trigger FROM ${sql(TEST_SCHEMA)}.pitch_deck_versions WHERE id = ${res.data!.data.id}
    `;
    expect(row.trigger).toBe('manual');
    expect(row.slides).toEqual(initialSlides);
    expect(row.theme).toEqual({ accent: '#f00' });
  });

  it('POST /versions is 404 when the deck belongs to another tenant', async () => {
    const B = await sessionForNewClientUser('pitch-ver-b');
    await enablePitchDeckService(B);
    const deck = await seedDeck(B);

    // stay logged in as A
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('POST /versions/[versionId]/restore swaps deck slides and records a "Before restore" snapshot', async () => {
    const oldSlides = [{ id: 'old-1', blocks: [] }];
    const newSlides = [{ id: 'new-1', blocks: [] }, { id: 'new-2', blocks: [] }];
    const oldTheme = { accent: '#001' };
    const newTheme = { accent: '#222' };

    const deck = await seedDeck(A, { slides: newSlides, theme: newTheme });
    const sql = getTestSql();
    const [v] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.pitch_deck_versions (deck_id, slides, theme, format_version, label, trigger)
      VALUES (${deck.id},
              ${JSON.stringify(oldSlides)}::jsonb,
              ${JSON.stringify(oldTheme)}::jsonb,
              2, 'Point-in-time', 'manual')
      RETURNING id
    `;

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route');
    const res = await callHandler<{ success: boolean; data: { slides: unknown; theme: unknown; formatVersion: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id), versionId: String(v.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slides).toEqual(oldSlides);
    expect(res.data?.data.theme).toEqual(oldTheme);
    expect(res.data?.data.formatVersion).toBe(2);

    // A "Before restore" snapshot should have been saved from the current state.
    const beforeRows = await sql<{ slides: unknown; label: string | null }[]>`
      SELECT slides, label FROM ${sql(TEST_SCHEMA)}.pitch_deck_versions
      WHERE deck_id = ${deck.id} AND label = 'Before restore'
    `;
    expect(beforeRows.length).toBe(1);
    expect(beforeRows[0].slides).toEqual(newSlides);
  });

  it('POST restore → 404 when versionId belongs to a different deck', async () => {
    const deck1 = await seedDeck(A);
    const deck2 = await seedDeck(A);
    const sql = getTestSql();
    const [v] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.pitch_deck_versions (deck_id, slides, theme, format_version, label, trigger)
      VALUES (${deck2.id},
              ${JSON.stringify([])}::jsonb, ${JSON.stringify({})}::jsonb,
              2, 'label', 'manual')
      RETURNING id
    `;

    // Use deck1's id + deck2's version id — mismatch
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck1.id), versionId: String(v.id) } },
    );
    expect(res.status).toBe(404);
  });
});
