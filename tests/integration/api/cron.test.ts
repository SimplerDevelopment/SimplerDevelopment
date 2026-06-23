/**
 * Cron endpoint: /api/cron/expire-mcp-pendings.
 *
 * Auth surface:
 *   - 401 without any credentials
 *   - 401 with a wrong bearer
 *   - 200 with `Authorization: Bearer ${CRON_SECRET}`
 *   - 200 with `x-vercel-cron: 1` (platform-signed call from Vercel cron)
 *
 * Business surface (exercised via ?ttlSeconds=0 + ?ids= so the test is
 * deterministic):
 *   - Only pending rows are transitioned
 *   - status = 'applied' / 'rejected' / 'expired' rows are left alone
 *   - Cutoff respects ttlSeconds param (overrides env TTL)
 *   - ids param scopes the operation to a subset
 *   - Cross-client: the endpoint runs globally, not per-tenant
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

const CRON_SECRET = 'test-cron-secret-' + Math.random().toString(36).slice(2);

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
});

async function seedPending(ctx: TenantCtx, overrides: { status?: string; minutesAgo?: number } = {}): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.mcp_pending_changes (
      client_id, entity_type, operation, payload, status, created_at
    ) VALUES (
      ${ctx.client.id}, 'post', 'create', '{}'::jsonb,
      ${overrides.status ?? 'pending'},
      NOW() - (${String(overrides.minutesAgo ?? 0) + ' minutes'})::interval
    )
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/cron/expire-mcp-pendings — auth @cron @security', () => {
  it('401 without any credentials', async () => {
    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('401 with a wrong bearer token', async () => {
    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: 'Bearer wrong-secret' } },
    );
    expect(res.status).toBe(401);
  });

  it('accepts a valid bearer token (200)', async () => {
    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
  });

  it('accepts the x-vercel-cron header (platform-signed, 200)', async () => {
    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { 'x-vercel-cron': '1' } },
    );
    expect(res.status).toBe(200);
  });

  it('rejects x-vercel-cron header with a value other than "1"', async () => {
    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { 'x-vercel-cron': 'true' } },
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/cron/expire-mcp-pendings — behaviour @cron', () => {
  it('with ttlSeconds=0 + ids: expires only those pending rows', async () => {
    const A = await sessionForNewClientUser('cron-behaviour');
    const p1 = await seedPending(A, { status: 'pending', minutesAgo: 2 });
    const p2 = await seedPending(A, { status: 'pending', minutesAgo: 2 });
    const untouched = await seedPending(A, { status: 'pending', minutesAgo: 2 });

    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler<{ success: boolean; expiredCount: number }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        query: { ttlSeconds: '0', ids: `${p1},${p2}` },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.expiredCount).toBe(2);

    const sql = getTestSql();
    const rows = await sql<{ id: number; status: string }[]>`
      SELECT id, status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes
      WHERE id IN (${p1}, ${p2}, ${untouched})
      ORDER BY id
    `;
    const byId = Object.fromEntries(rows.map(r => [r.id, r.status]));
    expect(byId[p1]).toBe('expired');
    expect(byId[p2]).toBe('expired');
    expect(byId[untouched]).toBe('pending');
  });

  it('does not re-expire already-expired rows, and ignores applied/rejected rows', async () => {
    const A = await sessionForNewClientUser('cron-skip');
    const already = await seedPending(A, { status: 'expired', minutesAgo: 5 });
    const applied = await seedPending(A, { status: 'applied', minutesAgo: 5 });
    const rejected = await seedPending(A, { status: 'rejected', minutesAgo: 5 });

    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler<{ success: boolean; expiredCount: number }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        query: { ttlSeconds: '0', ids: `${already},${applied},${rejected}` },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.expiredCount).toBe(0);

    const sql = getTestSql();
    const rows = await sql<{ id: number; status: string }[]>`
      SELECT id, status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes
      WHERE id IN (${already}, ${applied}, ${rejected})
    `;
    for (const r of rows) {
      expect(['expired', 'applied', 'rejected']).toContain(r.status);
    }
  });

  it('respects the ttlSeconds cutoff — a just-created row is NOT expired with ttlSeconds=3600', async () => {
    const A = await sessionForNewClientUser('cron-cutoff');
    const fresh = await seedPending(A, { status: 'pending', minutesAgo: 0 });

    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        query: { ttlSeconds: '3600', ids: `${fresh}` },
      },
    );

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes WHERE id = ${fresh}
    `;
    expect(row.status).toBe('pending');
  });

  it('runs globally across tenants — pendings from client A and client B both expire', async () => {
    const [A, B] = await Promise.all([
      sessionForNewClientUser('cron-tenant-a'),
      sessionForNewClientUser('cron-tenant-b'),
    ]);
    const pA = await seedPending(A, { minutesAgo: 2 });
    const pB = await seedPending(B, { minutesAgo: 2 });

    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler<{ expiredCount: number }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        query: { ttlSeconds: '0', ids: `${pA},${pB}` },
      },
    );
    expect(res.data?.expiredCount).toBe(2);

    const sql = getTestSql();
    const rows = await sql<{ id: number; status: string }[]>`
      SELECT id, status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes
      WHERE id IN (${pA}, ${pB})
    `;
    for (const r of rows) expect(r.status).toBe('expired');
  });

  it('response includes ttlSeconds and a cutoff ISO string', async () => {
    const route = await import('@/app/api/cron/expire-mcp-pendings/route');
    const res = await callHandler<{ ttlSeconds: number; ttlDays: number; cutoff: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        query: { ttlSeconds: '300' },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.ttlSeconds).toBe(300);
    expect(typeof res.data?.cutoff).toBe('string');
    expect(() => new Date(res.data!.cutoff).toISOString()).not.toThrow();
  });
});
