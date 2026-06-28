/**
 * Integration tests for portal CRM scoring rules routes.
 *
 * Covers:
 *   - POST   /api/portal/crm/scoring-rules        — create
 *   - PUT    /api/portal/crm/scoring-rules/[id]   — update
 *   - DELETE /api/portal/crm/scoring-rules/[id]   — delete
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

async function seedRule(clientId: number, eventType = 'form_submitted', points = 10) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_scoring_rules (client_id, event_type, points, enabled)
    VALUES (${clientId}, ${eventType}, ${points}, true)
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/scoring-rules @crm @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('rules-post');
    await grantBundle(A.client.id);
  });

  it('happy path: creates rule under caller tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; eventType: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { eventType: 'meeting_completed', points: 25 } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/scoring-rules/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { eventType: 'x', points: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing eventType with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { points: 5 } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric points with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { eventType: 'x', points: 'bad' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/crm/scoring-rules/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let ruleB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('rules-put-a'),
      sessionForNewClientUser('rules-put-b'),
    ]);
    await grantBundle(A.client.id);
    ruleB = await seedRule(B.client.id, 'B_event', 7);
  });

  it('happy path: edits own rule (200)', async () => {
    const id = await seedRule(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler<{ success: boolean; data: { points: number } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(id) }, body: { points: 99 } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.points).toBe(99);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(ruleB) }, body: { points: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot edit B\'s rule (404, preserved)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(ruleB) }, body: { points: 999 } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ points: number }[]>`
      SELECT points FROM ${sql(TEST_SCHEMA)}.crm_scoring_rules WHERE id = ${ruleB}
    `;
    expect(row.points).toBe(7);
  });

  it('returns 400 for invalid id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: 'abc' }, body: { points: 1 } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty payload with 400', async () => {
    const id = await seedRule(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(id) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing rule', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '99999' }, body: { points: 1 } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/crm/scoring-rules/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('rules-del-a'),
      sessionForNewClientUser('rules-del-b'),
    ]);
    await grantBundle(A.client.id);
  });

  it('happy path: deletes own rule (200)', async () => {
    const id = await seedRule(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s rule (404, preserved)', async () => {
    const id = await seedRule(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_scoring_rules WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 for missing rule', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '99999' } },
    );
    expect(res.status).toBe(404);
  });
});
