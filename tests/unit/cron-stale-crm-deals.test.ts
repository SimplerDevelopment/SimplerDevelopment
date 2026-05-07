// @vitest-environment node
/**
 * Unit tests for the stale-crm-deals cron handler.
 *
 * Scope is intentionally narrow: the SQL query + createCrmNotification path
 * needs a live Postgres and is exercised at the integration layer. Here we
 * just lock in the auth gate (Vercel header / CRON_SECRET) and the response
 * envelope shape, by stubbing the DB module before importing the route.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));

describe('GET /api/cron/stale-crm-deals — auth + envelope', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(new Request('http://x/api/cron/stale-crm-deals'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(
      new Request('http://x/api/cron/stale-crm-deals', {
        headers: { 'x-vercel-cron': '1' },
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { scanned: number; matched: number; notified: number; skippedDup: number; durationMs: number };
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ scanned: 0, matched: 0, notified: 0, skippedDup: 0 });
    expect(typeof json.data.durationMs).toBe('number');
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/stale-crm-deals/route');
    const res = await GET(
      new Request('http://x/api/cron/stale-crm-deals', {
        headers: { authorization: 'Bearer shh' },
      })
    );
    expect(res.status).toBe(200);
  });
});
