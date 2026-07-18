/**
 * Render-cache tenancy guarantees @tenancy
 *
 * email_renders is keyed by (campaignId, blocksHash). Because campaignId is
 * a 1:1 child of email_campaigns.client_id, the campaign-id key is also the
 * tenant key. We lock down the two leaks that would matter if the cache
 * lookup ever ignored the campaign filter:
 *
 *   1. A's preview/send writes a row scoped to A's campaign (and thus A's
 *      client). Querying email_renders by campaign_id only returns rows for
 *      that one campaign, never B's.
 *
 *   2. Two campaigns from two different clients can render the SAME blocks
 *      (same blocksHash), and each gets its OWN cache row — neither client
 *      sees a "cached: true" hit on the other's first render. Hash collision
 *      across tenants is impossible because the cache key includes
 *      campaignId.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import type { Block } from '@/types/blocks';
import { hashBlocks } from '@/lib/email/render-cache-core';

interface PreviewResponse {
  success: boolean;
  data?: {
    html: string;
    blocksHash: string;
    cached: boolean;
  };
  message?: string;
}

async function enableEmail(ctx: TenantCtx) {
  const sql = getTestSql();
  const slug = `email-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Email', ${slug}, 'email', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedList(ctx: TenantCtx) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${ctx.client.id}, ${`list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`}) RETURNING id
  `;
  return row;
}

async function seedCampaign(ctx: TenantCtx, listId: number, label: string) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number; client_id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (client_id, list_id, name, subject, from_name, from_email, html_content, status, use_block_editor)
    VALUES (
      ${ctx.client.id}, ${listId},
      ${label}, 'Subject', 'Sender', 'sender@test.local',
      '<p>placeholder</p>', 'draft', true
    ) RETURNING id, client_id
  `;
  return row;
}

const sharedBlocks = (): Block[] => [
  { id: 'h', type: 'heading', order: 0, content: 'Identical Headline', level: 1 },
  { id: 't', type: 'text', order: 1, content: 'Identical body copy.' },
];

describe('email_renders tenancy @tenancy @email', () => {
  it('A\'s campaign render rows are scoped by campaign_id → A\'s client; B never sees them', async () => {
    const A = await sessionForNewClientUser('renders-tenancy-a');
    const B = await sessionForNewClientUser('renders-tenancy-b');
    await enableEmail(A);
    await enableEmail(B);
    const listA = await seedList(A);
    const listB = await seedList(B);
    const cmpA = await seedCampaign(A, listA.id, 'campaign-a');
    const cmpB = await seedCampaign(B, listB.id, 'campaign-b');

    // Tenant A renders into the cache via preview API.
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/preview/route');
    const r1 = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks: sharedBlocks(), campaignId: cmpA.id } },
    );
    expect(r1.status).toBe(200);
    expect(r1.data?.data?.cached).toBe(false);

    const sql = getTestSql();

    // The new email_renders row joins back to A's client via the campaign FK.
    const aRows = await sql<{ campaign_client_id: number }[]>`
      SELECT c.client_id AS campaign_client_id
      FROM ${sql(TEST_SCHEMA)}.email_renders r
      INNER JOIN ${sql(TEST_SCHEMA)}.email_campaigns c ON c.id = r.campaign_id
      WHERE r.campaign_id = ${cmpA.id}
    `;
    expect(aRows).toHaveLength(1);
    expect(aRows[0].campaign_client_id).toBe(A.client.id);

    // Querying by B's campaign_id returns nothing.
    const bRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_renders WHERE campaign_id = ${cmpB.id}
    `;
    expect(bRows).toHaveLength(0);

    // Defensive cross-check: there are NO rows in email_renders that resolve
    // to B's client through the campaign FK.
    const leaked = await sql<{ id: number }[]>`
      SELECT r.id
      FROM ${sql(TEST_SCHEMA)}.email_renders r
      INNER JOIN ${sql(TEST_SCHEMA)}.email_campaigns c ON c.id = r.campaign_id
      WHERE c.client_id = ${B.client.id}
    `;
    expect(leaked).toHaveLength(0);
  });

  it('hash-collision safe: identical blocks across tenants → distinct cache rows, no cross-tenant cache hit', async () => {
    const A = await sessionForNewClientUser('renders-collision-a');
    const B = await sessionForNewClientUser('renders-collision-b');
    await enableEmail(A);
    await enableEmail(B);
    const listA = await seedList(A);
    const listB = await seedList(B);
    const cmpA = await seedCampaign(A, listA.id, 'shared-blocks-a');
    const cmpB = await seedCampaign(B, listB.id, 'shared-blocks-b');

    const blocks = sharedBlocks();
    const expectedHash = hashBlocks(blocks);

    const route = await import('@/app/api/portal/email/preview/route');

    // A's first render — must be cached: false (cold cache for A's campaign).
    mockedAuth.mockResolvedValue(A.session);
    const aFirst = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks, campaignId: cmpA.id } },
    );
    expect(aFirst.status).toBe(200);
    expect(aFirst.data?.data?.cached).toBe(false);
    expect(aFirst.data?.data?.blocksHash).toBe(expectedHash);

    // B's first render with the SAME blocks — must ALSO be cached: false,
    // because the cache key is (campaignId, blocksHash) and B has a different
    // campaignId. If a future regression keys the cache by blocksHash alone,
    // this would silently flip to cached: true and B would render A's content.
    mockedAuth.mockResolvedValue(B.session);
    const bFirst = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks, campaignId: cmpB.id } },
    );
    expect(bFirst.status).toBe(200);
    expect(bFirst.data?.data?.cached).toBe(false);
    expect(bFirst.data?.data?.blocksHash).toBe(expectedHash);

    // Two cache rows: one per campaign, both with the same blocksHash.
    const sql = getTestSql();
    const rows = await sql<{ campaign_id: number; blocks_hash: string }[]>`
      SELECT campaign_id, blocks_hash
      FROM ${sql(TEST_SCHEMA)}.email_renders
      WHERE campaign_id IN (${cmpA.id}, ${cmpB.id})
      ORDER BY campaign_id
    `;
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.campaign_id).sort((x, y) => x - y))
      .toEqual([cmpA.id, cmpB.id].sort((x, y) => x - y));
    expect(rows[0].blocks_hash).toBe(expectedHash);
    expect(rows[1].blocks_hash).toBe(expectedHash);

    // Now A's SECOND render with the same blocks — must be cached: true and
    // continue to point at A's row (not B's, even though both rows share the
    // blocks_hash).
    mockedAuth.mockResolvedValue(A.session);
    const aSecond = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks, campaignId: cmpA.id } },
    );
    expect(aSecond.status).toBe(200);
    expect(aSecond.data?.data?.cached).toBe(true);

    // No new rows materialised — still exactly two.
    const finalRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_renders
      WHERE campaign_id IN (${cmpA.id}, ${cmpB.id})
    `;
    expect(finalRows).toHaveLength(2);
  });

  it('rejects cross-tenant campaignId — A cannot read or seed via B\'s campaign', async () => {
    const A = await sessionForNewClientUser('renders-foreign-a');
    const B = await sessionForNewClientUser('renders-foreign-b');
    await enableEmail(A);
    await enableEmail(B);
    const listB = await seedList(B);
    const cmpB = await seedCampaign(B, listB.id, 'foreign-campaign');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/preview/route');
    const res = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks: sharedBlocks(), campaignId: cmpB.id } },
    );
    expect(res.status).toBe(404);

    // No cache row was written for B's campaign by A's call.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_renders WHERE campaign_id = ${cmpB.id}
    `;
    expect(rows).toHaveLength(0);
  });
});
