// @vitest-environment node
/**
 * Additional unit coverage for the failing-automations-notify cron handler.
 *
 * Complements `cron-failing-automations-notify.test.ts` (which locks down the
 * auth gate + dedupe path) by exercising the response-shape edge cases:
 *   - `db.execute` returning a bare array (neon driver shape) instead of `{ rows }`
 *   - missing CRON_SECRET → route is unauthenticated, allows the call through
 *   - long error message → truncated to ERROR_TRUNCATE (160 chars) with ellipsis
 *   - null error message → falls back to "(no error message recorded)"
 *   - mixed dedupe + notify outcomes in a single batch
 *   - rejects a wrong bearer token explicitly
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

describe('GET /api/cron/failing-automations-notify — edge cases', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    executeMock.mockClear();
    executeMock.mockResolvedValue({ rows: [] });
    notifyAllClientUsersMock.mockClear();
    notifyAllClientUsersMock.mockResolvedValue([{ id: 1 }]);
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('allows the request through when CRON_SECRET is unset (no auth gate)', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(new Request('http://x/api/cron/failing-automations-notify'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { scanned: number } };
    expect(json.success).toBe(true);
    expect(json.data.scanned).toBe(0);
  });

  it('rejects a non-matching bearer token with 401', async () => {
    process.env.CRON_SECRET = 'expected';
    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { authorization: 'Bearer wrong-token' },
      })
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean; message: string };
    expect(json.success).toBe(false);
    expect(json.message).toBe('Unauthorized');
    // We never reached the DB
    expect(executeMock).not.toHaveBeenCalled();
    expect(notifyAllClientUsersMock).not.toHaveBeenCalled();
  });

  it('handles db.execute returning a bare array (neon shape)', async () => {
    process.env.CRON_SECRET = 'shh';
    executeMock.mockResolvedValueOnce([
      {
        clientId: 5,
        ruleId: 50,
        ruleName: 'Bare-array shape rule',
        lastFailureAt: new Date('2026-05-05T00:00:00Z'),
        lastErrorMessage: 'boom',
        totalRuns: 10,
        recentDupId: null,
      },
    ]);

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({ scanned: 1, matched: 1, notified: 1, skippedDup: 0 });
    expect(notifyAllClientUsersMock).toHaveBeenCalledTimes(1);
    const call = notifyAllClientUsersMock.mock.calls[0]![0] as { body: string };
    expect(call.body).toContain('boom');
  });

  it('handles { rows: undefined } gracefully (defensive ?? [])', async () => {
    process.env.CRON_SECRET = 'shh';
    // Force the wrapped-but-missing-rows branch.
    executeMock.mockResolvedValueOnce({} as unknown as { rows: never[] });

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { scanned: number } };
    expect(json.data.scanned).toBe(0);
    expect(notifyAllClientUsersMock).not.toHaveBeenCalled();
  });

  it('truncates long error messages to 160 chars with an ellipsis', async () => {
    process.env.CRON_SECRET = 'shh';
    const longErr =
      'X'.repeat(250) +
      '  ignored padding   that should also be collapsed by whitespace normalization';
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          clientId: 7,
          ruleId: 70,
          ruleName: 'Noisy rule',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: longErr,
          totalRuns: 5,
          recentDupId: null,
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

    expect(notifyAllClientUsersMock).toHaveBeenCalledTimes(1);
    const call = notifyAllClientUsersMock.mock.calls[0]![0] as { body: string };
    const errLineMatch = call.body.match(/Most recent error: (.*)/);
    expect(errLineMatch).not.toBeNull();
    const snippet = errLineMatch![1]!.split('\n')[0]!;
    expect(snippet.length).toBe(160);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('collapses internal whitespace in the error before truncation', async () => {
    process.env.CRON_SECRET = 'shh';
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          clientId: 9,
          ruleId: 91,
          ruleName: 'Whitespace rule',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: '  multi   line\n\nerror\twith\t\ttabs  ',
          totalRuns: 5,
          recentDupId: null,
        },
      ],
    });

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );
    const call = notifyAllClientUsersMock.mock.calls[0]![0] as { body: string };
    expect(call.body).toContain('Most recent error: multi line error with tabs');
  });

  it('emits the "(no error message recorded)" fallback when error is null', async () => {
    process.env.CRON_SECRET = 'shh';
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          clientId: 8,
          ruleId: 80,
          ruleName: 'Silent failure',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: null,
          totalRuns: 5,
          recentDupId: null,
        },
      ],
    });

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );

    const call = notifyAllClientUsersMock.mock.calls[0]![0] as { body: string; title: string };
    expect(call.body).toContain('Most recent error: (no error message recorded)');
    expect(call.body).toContain('Open: /portal/brain/automations');
    expect(call.title).toContain('Silent failure');
    expect(call.title).toContain('5 consecutive errors');
  });

  it('counts matched + notified + skippedDup correctly across a mixed batch', async () => {
    process.env.CRON_SECRET = 'shh';
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          clientId: 1,
          ruleId: 100,
          ruleName: 'fresh A',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: 'a-err',
          totalRuns: 5,
          recentDupId: null,
        },
        {
          clientId: 1,
          ruleId: 101,
          ruleName: 'dup A',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: 'a2-err',
          totalRuns: 5,
          recentDupId: 12345,
        },
        {
          clientId: 2,
          ruleId: 200,
          ruleName: 'fresh B',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: 'b-err',
          totalRuns: 5,
          recentDupId: null,
        },
        {
          clientId: 2,
          ruleId: 201,
          ruleName: 'dup B',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: null,
          totalRuns: 5,
          recentDupId: 7,
        },
      ],
    });

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );

    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({ scanned: 4, matched: 4, notified: 2, skippedDup: 2 });
    expect(notifyAllClientUsersMock).toHaveBeenCalledTimes(2);
    const calls = notifyAllClientUsersMock.mock.calls.map(
      (c) => (c[0] as { entityId: number }).entityId
    );
    // Only fresh ones notified — 100 and 200, in iteration order.
    expect(calls).toEqual([100, 200]);
  });

  it('reports a non-negative numeric durationMs in the envelope', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    const res = await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );
    const json = (await res.json()) as { data: { durationMs: number } };
    expect(typeof json.data.durationMs).toBe('number');
    expect(json.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('always sets entityType="automation_rule" and type="automation_failing" on each notification', async () => {
    process.env.CRON_SECRET = 'shh';
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          clientId: 11,
          ruleId: 111,
          ruleName: 'rule-1',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: 'oops',
          totalRuns: 5,
          recentDupId: null,
        },
        {
          clientId: 22,
          ruleId: 222,
          ruleName: 'rule-2',
          lastFailureAt: new Date('2026-05-05T00:00:00Z'),
          lastErrorMessage: 'oops-2',
          totalRuns: 5,
          recentDupId: null,
        },
      ],
    });

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    await GET(
      new Request('http://x/api/cron/failing-automations-notify', {
        headers: { 'x-vercel-cron': '1' },
      })
    );

    for (const c of notifyAllClientUsersMock.mock.calls) {
      const payload = c[0] as { type: string; entityType: string };
      expect(payload.type).toBe('automation_failing');
      expect(payload.entityType).toBe('automation_rule');
    }
    const ids = notifyAllClientUsersMock.mock.calls.map(
      (c) => (c[0] as { entityId: number }).entityId
    );
    expect(ids).toEqual([111, 222]);
  });

  it('propagates errors thrown by db.execute (no swallow)', async () => {
    process.env.CRON_SECRET = 'shh';
    executeMock.mockRejectedValueOnce(new Error('connection lost'));

    const { GET } = await import('@/app/api/cron/failing-automations-notify/route');
    await expect(
      GET(
        new Request('http://x/api/cron/failing-automations-notify', {
          headers: { 'x-vercel-cron': '1' },
        })
      )
    ).rejects.toThrow('connection lost');
    expect(notifyAllClientUsersMock).not.toHaveBeenCalled();
  });
});
