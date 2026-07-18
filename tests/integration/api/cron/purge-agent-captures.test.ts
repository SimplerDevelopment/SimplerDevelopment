/**
 * Cron endpoint: /api/cron/purge-agent-captures (AAF-001; see the internal
 * ADR log, not part of this public release).
 *
 * Auth surface mirrors expire-mcp-pendings (tests/integration/api/cron.test.ts):
 *   - 401 without any credentials
 *   - 401 with a wrong bearer
 *   - 200 with `Authorization: Bearer ${CRON_SECRET}`
 *   - 200 with `x-vercel-cron: 1`
 *
 * Business surface: only agent_action_captures rows older than the 90-day
 * retention window are hard-deleted; newer rows are left alone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');

import { callHandler } from '../../../helpers/call-handler';
import { sessionForStaff, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { encryptApiKey } from '@/lib/crypto/api-key';

const CRON_SECRET = 'test-cron-secret-' + Math.random().toString(36).slice(2);

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
});

async function seedCapture(ctx: TenantCtx, daysAgo: number): Promise<number> {
  const sql = getTestSql();
  const ciphertext = encryptApiKey(JSON.stringify({ x: 1 }));
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.agent_action_captures (client_id, tool_name, ciphertext, created_at)
    VALUES (${ctx.client.id}, 'posts_delete', ${ciphertext}, NOW() - (${String(daysAgo) + ' days'})::interval)
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/cron/purge-agent-captures — auth @cron @security', () => {
  it('401 without any credentials', async () => {
    const route = await import('@/app/api/cron/purge-agent-captures/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('401 with a wrong bearer token', async () => {
    const route = await import('@/app/api/cron/purge-agent-captures/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: 'Bearer wrong-secret' } },
    );
    expect(res.status).toBe(401);
  });

  it('accepts a valid bearer token (200)', async () => {
    const route = await import('@/app/api/cron/purge-agent-captures/route');
    const res = await callHandler<{ success: boolean; purged: number }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(typeof res.data?.purged).toBe('number');
  });

  it('accepts the x-vercel-cron header (200)', async () => {
    const route = await import('@/app/api/cron/purge-agent-captures/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { 'x-vercel-cron': '1' } },
    );
    expect(res.status).toBe(200);
  });
});

describe('GET /api/cron/purge-agent-captures — purge behavior @cron', () => {
  it('deletes only captures older than the 90-day retention window', async () => {
    const staff = await sessionForStaff('purge-captures');
    const oldId = await seedCapture(staff, 91);
    const recentId = await seedCapture(staff, 10);

    const route = await import('@/app/api/cron/purge-agent-captures/route');
    const res = await callHandler<{ success: boolean; purged: number }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { 'x-vercel-cron': '1' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.purged).toBeGreaterThanOrEqual(1);

    const sql = getTestSql();
    const remaining = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.agent_action_captures WHERE id IN (${oldId}, ${recentId})
    `;
    const remainingIds = remaining.map((r) => r.id);
    expect(remainingIds).not.toContain(oldId);
    expect(remainingIds).toContain(recentId);
  });
});
