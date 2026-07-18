// @vitest-environment node
/**
 * Unit tests for the failing-automations-notify cron handler.
 *
 * Scope mirrors `cron-stale-crm-deals.test.ts`: the SQL query + notify path
 * needs a live Postgres and is exercised at the integration layer. Here we
 * lock in the auth gate (Vercel header / CRON_SECRET) and the response
 * envelope shape, plus the de-dupe branch — by stubbing the DB module and
 * the notifications helper before importing the route.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const executeMock = vi.fn().mockResolvedValue({ rows: [] });
const notifyAllClientUsersMock = vi.fn().mockResolvedValue([{ id: 1 }]);

vi.mock('@/lib/db', () => ({
  db: {
    execute: executeMock,
  },
}));

vi.mock('@/lib/crm/notifications', () => ({
  notifyAllClientUsers: notifyAllClientUsersMock,
}));

describe('GET /api/cron/failing-automations-notify — auth + envelope', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    executeMock.mockClear();
    executeMock.mockResolvedValue({ rows: [] });
    notifyAllClientUsersMock.mockClear();
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(new Request('http://x/api/cron/failing-automations-notify'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
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
    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { authorization: 'Bearer shh' },
      })
    );
    expect(res.status).toBe(200);
  });

  it('skips de-duped rules and broadcasts to client members for fresh ones', async () => {
    process.env.CRON_SECRET = 'shh';
    executeMock.mockResolvedValueOnce({
      rows: [
        // Fresh failure → should notify
        {
          clientId: 100,
          ruleId: 11,
          ruleName: 'Tag hot leads',
          lastFailureAt: new Date('2026-05-05T12:00:00Z'),
          lastErrorMessage: 'Upstream 500: Stripe webhook signature mismatch',
          totalRuns: 42,
          recentDupId: null,
        },
        // Already notified within 24h → should be skipped
        {
          clientId: 100,
          ruleId: 12,
          ruleName: 'Slack on lost deal',
          lastFailureAt: new Date('2026-05-05T11:00:00Z'),
          lastErrorMessage: null,
          totalRuns: 8,
          recentDupId: 9999,
        },
      ],
    });

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({ scanned: 2, matched: 2, notified: 1, skippedDup: 1 });

    expect(notifyAllClientUsersMock).toHaveBeenCalledTimes(1);
    const call = notifyAllClientUsersMock.mock.calls[0]![0] as {
      clientId: number;
      type: string;
      title: string;
      body: string;
      entityType: string;
      entityId: number;
    };
    expect(call.clientId).toBe(100);
    expect(call.type).toBe('automation_failing');
    expect(call.entityType).toBe('automation_rule');
    expect(call.entityId).toBe(11);
    expect(call.title).toContain('Tag hot leads');
    expect(call.title).toContain('5 consecutive errors');
    expect(call.body).toContain('Stripe webhook signature mismatch');
    expect(call.body).toContain('/portal/brain/automations');
  });
});
