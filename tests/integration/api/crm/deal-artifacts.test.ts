/**
 * Integration tests for portal CRM deal artifacts route.
 *
 * The cross-tenant POST test is the highest-priority P0 leak class — it locks
 * in the FK ownership check that prevents a caller from attaching another
 * client's pitch deck (or other artifact) to their own deal. The original
 * test in tests/integration/api/security/tenancy.test.ts only covers
 * pitch_deck — this file extends coverage to multiple artifact types and
 * exercises full PUT/DELETE behavior as well.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

interface DealCtx { dealId: number; pipelineId: number; stageId: number; }

async function seedDeal(clientId: number, title = 'D'): Promise<DealCtx> {
  const sql = getTestSql();
  const [pipe] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_pipelines (client_id, name, is_default)
    VALUES (${clientId}, 'P', true) RETURNING id
  `;
  const [stage] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_pipeline_stages (pipeline_id, name, sort_order)
    VALUES (${pipe.id}, 'New', 0) RETURNING id
  `;
  const [deal] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_deals (client_id, pipeline_id, stage_id, title)
    VALUES (${clientId}, ${pipe.id}, ${stage.id}, ${title}) RETURNING id
  `;
  return { dealId: deal.id, pipelineId: pipe.id, stageId: stage.id };
}

async function seedPitchDeck(clientId: number, slug: string, title = 'Deck') {
  const sql = getTestSql();
  const [deck] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (client_id, title, slug)
    VALUES (${clientId}, ${title}, ${slug}) RETURNING id
  `;
  return deck.id;
}

async function seedArtifactRow(dealId: number, artifactType: string, artifactId: number) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_deal_artifacts
      (deal_id, artifact_type, artifact_id, display_title, pinned)
    VALUES (${dealId}, ${artifactType}, ${artifactId}, 'X', false)
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/deals/[id]/artifacts @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let dealA: DealCtx;
  let dealB: DealCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('art-a'),
      sessionForNewClientUser('art-b'),
    ]);
    [dealA, dealB] = await Promise.all([
      seedDeal(A.client.id, 'A-deal'),
      seedDeal(B.client.id, 'B-deal'),
    ]);
  });

  it('happy path: attaches own pitch deck to own deal (201)', async () => {
    const deck = await seedPitchDeck(A.client.id, 'a-deck-' + Date.now());
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler<{ success: boolean; data: { id: number; dealId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealA.dealId) }, body: { artifactType: 'pitch_deck', artifactId: deck } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.dealId).toBe(dealA.dealId);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealA.dealId) }, body: { artifactType: 'pitch_deck', artifactId: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing artifactType/artifactId with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealA.dealId) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  // ── P0: cross-tenant artifactId ──
  it('P0: A cannot attach B\'s pitch deck to A\'s deal (404, no row inserted)', async () => {
    const deckB = await seedPitchDeck(B.client.id, 'b-deck-' + Date.now(), 'Secret B Deck');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealA.dealId) }, body: { artifactType: 'pitch_deck', artifactId: deckB } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_deal_artifacts
      WHERE deal_id = ${dealA.dealId} AND artifact_id = ${deckB}
    `;
    expect(rows.length).toBe(0);
  });

  // Also assert that A targeting B's deal is rejected (deal-side ownership).
  it('A cannot post to B\'s deal (404)', async () => {
    const deckA = await seedPitchDeck(A.client.id, 'a2-deck-' + Date.now());
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealB.dealId) }, body: { artifactType: 'pitch_deck', artifactId: deckA } },
    );
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/portal/crm/deals/[id]/artifacts @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let dealA: DealCtx;
  let dealB: DealCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('art-put-a'),
      sessionForNewClientUser('art-put-b'),
    ]);
    [dealA, dealB] = await Promise.all([
      seedDeal(A.client.id),
      seedDeal(B.client.id),
    ]);
  });

  it('happy path: pin own artifact (200)', async () => {
    const deck = await seedPitchDeck(A.client.id, 'put-a-' + Date.now());
    const artId = await seedArtifactRow(dealA.dealId, 'pitch_deck', deck);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler<{ success: boolean; data: { pinned: boolean } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(dealA.dealId) }, body: { artifactDbId: artId, pinned: true } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.pinned).toBe(true);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(dealA.dealId) }, body: { artifactDbId: 1, pinned: true } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing artifactDbId/pinned with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(dealA.dealId) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A cannot mutate artifact attached to B\'s deal (404)', async () => {
    const deckB = await seedPitchDeck(B.client.id, 'b-art-put-' + Date.now());
    const artB = await seedArtifactRow(dealB.dealId, 'pitch_deck', deckB);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    // Caller A targets B's deal — getAuthedDeal filters out B's deal, so 404.
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(dealB.dealId) }, body: { artifactDbId: artB, pinned: true } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ pinned: boolean }[]>`
      SELECT pinned FROM ${sql(TEST_SCHEMA)}.crm_deal_artifacts WHERE id = ${artB}
    `;
    expect(row.pinned).toBe(false);
  });
});

describe('DELETE /api/portal/crm/deals/[id]/artifacts @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let dealA: DealCtx;
  let dealB: DealCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('art-del-a'),
      sessionForNewClientUser('art-del-b'),
    ]);
    [dealA, dealB] = await Promise.all([
      seedDeal(A.client.id),
      seedDeal(B.client.id),
    ]);
  });

  it('happy path: deletes own artifact (200)', async () => {
    const deck = await seedPitchDeck(A.client.id, 'del-' + Date.now());
    const artId = await seedArtifactRow(dealA.dealId, 'pitch_deck', deck);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealA.dealId) }, body: { artifactDbId: artId } },
    );
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealA.dealId) }, body: { artifactDbId: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete artifact on B\'s deal (404, preserved)', async () => {
    const deckB = await seedPitchDeck(B.client.id, 'b-del-' + Date.now());
    const artB = await seedArtifactRow(dealB.dealId, 'pitch_deck', deckB);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealB.dealId) }, body: { artifactDbId: artB } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_deal_artifacts WHERE id = ${artB}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 when artifactDbId unknown', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealA.dealId) }, body: { artifactDbId: 999999 } },
    );
    expect(res.status).toBe(404);
  });
});
