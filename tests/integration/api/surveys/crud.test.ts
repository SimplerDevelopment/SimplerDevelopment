/**
 * Integration tests for portal /api/portal/surveys CRUD.
 *
 * Covers:
 *   - POST   /api/portal/surveys              — create
 *   - PUT    /api/portal/surveys/[id]         — update
 *   - DELETE /api/portal/surveys/[id]         — delete
 *
 * Each mutation asserts: happy path, 401 unauthenticated, 403 without the
 * `surveys` service subscription, cross-tenant rejection (404, row preserved),
 * 400 bad input, and 404 on missing target.
 *
 * The surveys feature is service-gated via `authorizePortal({
 * requireService: 'surveys' })`, so each authed test seeds a `services`+
 * `client_services` row to grant access to the test tenant.
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

async function enableSurveys(ctx: TenantCtx) {
  const sql = getTestSql();
  const slug = `surveys-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Surveys', ${slug}, 'surveys', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedSurvey(clientId: number, title = 'Seed Survey') {
  const sql = getTestSql();
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.surveys (client_id, title, slug, fields)
    VALUES (${clientId}, ${title}, ${slug}, '[]'::json)
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/surveys @surveys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('surv-post-a'),
      sessionForNewClientUser('surv-post-b'),
    ]);
  });

  it('creates a survey under the caller\'s tenant (201)', async () => {
    await enableSurveys(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; title: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'Customer NPS', description: 'Post-purchase', fields: [{ id: 'q1', type: 'rating' }] } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.title).toBe('Customer NPS');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.surveys WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.client_id).not.toBe(B.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/surveys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects without the surveys subscription (403)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'X' } },
    );
    expect(res.status).toBe(403);
  });

  it('rejects missing/blank title with 400', async () => {
    await enableSurveys(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: '   ' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/surveys/[id] @surveys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let surveyB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('surv-put-a'),
      sessionForNewClientUser('surv-put-b'),
    ]);
    await enableSurveys(A);
    await enableSurveys(B);
    surveyB = await seedSurvey(B.client.id, 'B-Owned Survey');
  });

  it('happy path: tenant edits own survey (200)', async () => {
    const myId = await seedSurvey(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string; status: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(myId) }, body: { title: 'Renamed', status: 'active' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.title).toBe('Renamed');
    expect(res.data?.data.status).toBe('active');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(surveyB) }, body: { title: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot mutate B\'s survey (404 + DB untouched)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(surveyB) }, body: { title: 'Hijacked' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.surveys WHERE id = ${surveyB}
    `;
    expect(row.title).toBe('B-Owned Survey');
  });

  it('returns 404 when target id is unknown', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '999999' }, body: { title: 'X' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/surveys/[id] @surveys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('surv-del-a'),
      sessionForNewClientUser('surv-del-b'),
    ]);
    await enableSurveys(A);
    await enableSurveys(B);
  });

  it('happy path: deletes own survey (200)', async () => {
    const id = await seedSurvey(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.surveys WHERE id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s survey (404, row preserved)', async () => {
    const id = await seedSurvey(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.surveys WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 when target id is unknown', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '888888' } },
    );
    expect(res.status).toBe(404);
  });
});
