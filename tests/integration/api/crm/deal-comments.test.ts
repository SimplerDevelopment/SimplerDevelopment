/**
 * Integration tests for portal CRM deal comments route.
 *
 * Note: the route file exposes POST + DELETE (no PATCH). The DELETE handler
 * scopes by `dealId`, `commentId`, AND `authorId === session.user.id` —
 * non-staff users cannot delete other users' comments. The cross-tenant case
 * is therefore guarded both by deal-side ownership (getAuthedDeal) and by
 * author-side ownership.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { grantBundle } from '../../../helpers/entitlements';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

interface DealCtx { dealId: number; }
async function seedDeal(clientId: number): Promise<DealCtx> {
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
    VALUES (${clientId}, ${pipe.id}, ${stage.id}, 'D') RETURNING id
  `;
  return { dealId: deal.id };
}

async function seedComment(dealId: number, authorId: number, body = 'hi') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_deal_comments (deal_id, author_id, body)
    VALUES (${dealId}, ${authorId}, ${body}) RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/deals/[id]/comments @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let dealA: DealCtx;
  let dealB: DealCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('com-post-a'),
      sessionForNewClientUser('com-post-b'),
    ]);
    await grantBundle(A.client.id);
    [dealA, dealB] = await Promise.all([
      seedDeal(A.client.id),
      seedDeal(B.client.id),
    ]);
  });

  it('happy path: adds a comment to own deal (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler<{ success: boolean; data: { id: number; body: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealA.dealId) }, body: { body: 'first comment' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.body).toBe('first comment');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealA.dealId) }, body: { body: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects empty body (no attachments) with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealA.dealId) }, body: { body: '   ' } },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A cannot post a comment to B\'s deal (404, no row)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(dealB.dealId) }, body: { body: 'sneaky' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_deal_comments WHERE deal_id = ${dealB.dealId}
    `;
    expect(rows.length).toBe(0);
  });

  it('returns 400 when dealId param is non-numeric', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: 'nan' }, body: { body: 'x' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/portal/crm/deals/[id]/comments @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let dealA: DealCtx;
  let dealB: DealCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('com-del-a'),
      sessionForNewClientUser('com-del-b'),
    ]);
    await grantBundle(A.client.id);
    [dealA, dealB] = await Promise.all([
      seedDeal(A.client.id),
      seedDeal(B.client.id),
    ]);
  });

  it('happy path: author deletes own comment (200)', async () => {
    const cid = await seedComment(dealA.dealId, A.user.id, 'mine');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealA.dealId) }, body: { commentId: cid } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_deal_comments WHERE id = ${cid}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealA.dealId) }, body: { commentId: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete comment on B\'s deal (404, preserved)', async () => {
    const cidB = await seedComment(dealB.dealId, B.user.id, 'B-comment');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealB.dealId) }, body: { commentId: cidB } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_deal_comments WHERE id = ${cidB}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 when commentId is unknown', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/deals/[id]/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(dealA.dealId) }, body: { commentId: 999999 } },
    );
    expect(res.status).toBe(404);
  });
});
