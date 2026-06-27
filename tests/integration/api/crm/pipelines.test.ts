/**
 * Integration tests for portal CRM pipelines route.
 *
 * Coverage notes:
 *   - app/api/portal/crm/pipelines/route.ts exposes GET + POST.
 *   - There is NO `pipelines/[id]/route.ts`; only nested `stages` exists. So
 *     PATCH/DELETE on the pipeline itself are not part of the API surface.
 *   - The recon plan mentioned PATCH/DELETE on pipelines/[id] — this file
 *     covers the actual exposed surface (POST), and stages-level mutations
 *     are out of scope for this Phase E batch (separate route, separate
 *     leak-class profile).
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

describe('POST /api/portal/crm/pipelines @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('pipe-post-a'),
      sessionForNewClientUser('pipe-post-b'),
    ]);
    await grantBundle(A.client.id);
  });

  it('happy path: creates pipeline + 6 default stages under caller tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/pipelines/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; isDefault: boolean; stages: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'Sales' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.stages.length).toBe(6); // default stages

    // First pipeline for tenant A becomes default.
    expect(res.data?.data.isDefault).toBe(true);

    // Tenancy: B has no pipeline rows.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_pipelines WHERE client_id = ${B.client.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/pipelines/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects empty name with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/pipelines/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: '   ' } },
    );
    expect(res.status).toBe(400);
  });

  it('second pipeline is NOT marked default', async () => {
    const sql = getTestSql();
    // Seed an existing default pipeline for A directly.
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.crm_pipelines (client_id, name, is_default)
      VALUES (${A.client.id}, 'Existing', true)
    `;
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/pipelines/route');
    const res = await callHandler<{ success: boolean; data: { isDefault: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'Second' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.isDefault).toBe(false);
  });
});
