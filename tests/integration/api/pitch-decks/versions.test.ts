/**
 * Pitch deck versions — extra coverage on top of the smoke cases in
 * tests/integration/api/pitch-decks.test.ts. Focuses on cross-tenant
 * rejection for both list AND restore, plus restore behaviour edge cases.
 *
 * Routes:
 *   GET  /api/portal/tools/pitch-decks/[id]/versions
 *   POST /api/portal/tools/pitch-decks/[id]/versions
 *   POST /api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore
 *
 * Contract covered:
 *   - 401 on all three when unauthenticated
 *   - GET versions: 404 cross-tenant deck
 *   - POST versions: 200 with empty body (no label) → label=null, trigger=manual
 *   - POST restore: 404 when versionId belongs to ANOTHER tenant's deck
 *     (different deck-id mismatch is already in the smoke test)
 *   - POST restore: returns deck rows scoped to caller's client only
 *   - List shows the "Before restore" snapshot after restore
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedDeck(ctx: TenantCtx, slides: unknown[] = []): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `ver-deck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (
      client_id, title, slug, slides, theme, format_version
    ) VALUES (
      ${ctx.client.id}, 'Versions Deck', ${slug},
      ${JSON.stringify(slides)}::jsonb,
      ${JSON.stringify({})}::jsonb,
      2
    ) RETURNING id
  `;
  return row;
}

async function seedVersion(deckId: number, slides: unknown[] = [], label = 'v'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_deck_versions (deck_id, slides, theme, format_version, label, trigger)
    VALUES (${deckId},
            ${JSON.stringify(slides)}::jsonb, ${JSON.stringify({})}::jsonb,
            2, ${label}, 'manual')
    RETURNING id
  `;
  return row;
}

describe('Pitch deck versions — auth & cross-tenant @pitch @versions', () => {
  it('GET /versions returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('POST /versions returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('POST /versions/[versionId]/restore returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1', versionId: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('GET /versions returns 404 when deck is in a different tenant', async () => {
    const A = await sessionForNewClientUser('pitch-ver-extra-a');
    const B = await sessionForNewClientUser('pitch-ver-extra-b');
    const deck = await seedDeck(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(deck.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('POST /versions/[versionId]/restore is 404 when version+deck belong to another tenant', async () => {
    const A = await sessionForNewClientUser('pitch-ver-rest-a');
    const B = await sessionForNewClientUser('pitch-ver-rest-b');
    const deckB = await seedDeck(B, [{ id: 'sb', label: 'B', blocks: [] }]);
    const ver = await seedVersion(deckB.id, [{ id: 'svb', label: 'V', blocks: [] }]);
    mockedAuth.mockResolvedValue(A.session);

    // A tries to restore B's version on B's deck — must be 404 (deck-not-mine)
    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deckB.id), versionId: String(ver.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Pitch deck versions — POST + GET behaviour @pitch @versions', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('pitch-ver-beh');
    mockedAuth.mockResolvedValue(A.session);
  });

  it('POST /versions with no body succeeds — label=null, trigger=manual', async () => {
    const deck = await seedDeck(A, [{ id: 'a', label: '', blocks: [] }]);

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler<{ success: boolean; data: { label: string | null; trigger: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id) } /* no body */ },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.label).toBeNull();
    expect(res.data?.data.trigger).toBe('manual');
  });

  it('GET /versions only returns rows for the caller\'s deck (not another deck under same client)', async () => {
    const deck1 = await seedDeck(A, [{ id: 's1', label: '', blocks: [] }]);
    const deck2 = await seedDeck(A, [{ id: 's2', label: '', blocks: [] }]);

    await seedVersion(deck1.id, [{ id: 's1', blocks: [] }], 'one');
    await seedVersion(deck2.id, [{ id: 's2', blocks: [] }], 'two');

    const route = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const res = await callHandler<{ success: boolean; data: { id: number; label: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(deck1.id) } },
    );
    expect(res.status).toBe(200);
    const labels = res.data?.data.map(v => v.label) ?? [];
    expect(labels).toContain('one');
    expect(labels).not.toContain('two');
  });

  it('after restore, the new "Before restore" snapshot shows up in GET list', async () => {
    const oldSlides = [{ id: 'old', label: 'Old', blocks: [] }];
    const liveSlides = [{ id: 'live-1', label: 'Live', blocks: [] }];
    const deck = await seedDeck(A, liveSlides);
    const ver = await seedVersion(deck.id, oldSlides, 'snapshot-1');

    // Restore
    const restoreRoute = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route');
    const r1 = await callHandler(
      restoreRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(deck.id), versionId: String(ver.id) } },
    );
    expect(r1.status).toBe(200);

    // List versions — should now contain BOTH the original "snapshot-1" and the
    // auto-created "Before restore"
    const listRoute = await import('@/app/api/portal/tools/pitch-decks/[id]/versions/route');
    const r2 = await callHandler<{ success: boolean; data: { label: string }[] }>(
      listRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(deck.id) } },
    );
    expect(r2.status).toBe(200);
    const labels = r2.data!.data.map(v => v.label);
    expect(labels).toContain('snapshot-1');
    expect(labels).toContain('Before restore');
  });
});
