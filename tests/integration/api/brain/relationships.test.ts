/**
 * Brain relationships — POST/PUT/DELETE on /relationships + /relationships/[id].
 *
 * Contract:
 *   - 401 unauth
 *   - POST: rejects providing both companyId+dealId or neither (400)
 *   - POST: rejects targeting a foreign-tenant CRM company/deal (400)
 *   - PUT: 400 cross-tenant overlay id; 200 + updated row when own
 *   - DELETE: 404 cross-tenant; 200 own; 404 missing
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedCompany(ctx: TenantCtx, name = `co-${Date.now()}`): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_companies (client_id, name)
    VALUES (${ctx.client.id}, ${name})
    RETURNING id
  `;
  return row;
}

async function seedOverlay(ctx: TenantCtx, companyId: number): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_relationship_overlays
      (client_id, company_id, relationship_type, status, priority, service_lines, confidentiality_level, compliance_flags)
    VALUES
      (${ctx.client.id}, ${companyId}, 'generic', 'active', 'medium', '[]'::jsonb, 'standard', '[]'::jsonb)
    RETURNING id
  `;
  return row;
}

describe('Brain relationships — POST /relationships @brain @relationships', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-rel-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/relationships/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('400 when both companyId and dealId provided', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/relationships/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { companyId: 1, dealId: 1 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/exactly one/i);
  });

  it('400 when neither companyId nor dealId provided', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/relationships/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { summary: 'no anchor' } },
    );
    expect(res.status).toBe(400);
  });

  it('creates an overlay for own company', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const co = await seedCompany(A, 'Acme');
    const route = await import('@/app/api/portal/brain/relationships/route');
    const res = await callHandler<{ success: boolean; data: { id: number; companyId: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { companyId: co.id, relationshipType: 'client', priority: 'high' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; priority: string }[]>`
      SELECT client_id, priority FROM ${sql(TEST_SCHEMA)}.brain_relationship_overlays WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.priority).toBe('high');
  });

  it('400 when targeting a foreign-tenant company', async () => {
    const B = await sessionForNewClientUser('brain-rel-create-b');
    const coB = await seedCompany(B, 'Foreign Co');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/relationships/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { companyId: coB.id, relationshipType: 'client' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/company/i);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_relationship_overlays
      WHERE client_id = ${A.client.id} AND company_id = ${coB.id}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('Brain relationships — PUT /relationships/[id] @brain @relationships', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-rel-put'); });

  it('updates own overlay', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const co = await seedCompany(A);
    const overlay = await seedOverlay(A, co.id);

    const route = await import('@/app/api/portal/brain/relationships/[id]/route');
    const res = await callHandler<{ success: boolean; data: { priority: string } }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: String(overlay.id) }, body: { priority: 'critical' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.priority).toBe('critical');
  });

  it('400 cross-tenant overlay id (lib throws "not found")', async () => {
    const B = await sessionForNewClientUser('brain-rel-put-b');
    const coB = await seedCompany(B);
    const overlayB = await seedOverlay(B, coB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/relationships/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: String(overlayB.id) }, body: { priority: 'critical' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/not found/i);

    // DB untouched
    const sql = getTestSql();
    const [row] = await sql<{ priority: string }[]>`
      SELECT priority FROM ${sql(TEST_SCHEMA)}.brain_relationship_overlays WHERE id = ${overlayB.id}
    `;
    expect(row.priority).toBe('medium');
  });
});

describe('Brain relationships — DELETE /relationships/[id] @brain @relationships', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-rel-del'); });

  it('deletes own overlay', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const co = await seedCompany(A);
    const overlay = await seedOverlay(A, co.id);

    const route = await import('@/app/api/portal/brain/relationships/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(overlay.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_relationship_overlays WHERE id = ${overlay.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 missing id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/relationships/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-rel-del-b');
    const coB = await seedCompany(B);
    const overlayB = await seedOverlay(B, coB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/relationships/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(overlayB.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_relationship_overlays WHERE id = ${overlayB.id}
    `;
    expect(rows.length).toBe(1);
  });
});
