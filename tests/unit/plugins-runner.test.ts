// @vitest-environment node
/**
 * Unit tests for the content-tools execution backbone (Wave 2):
 *
 *   - redactLog: strips JWTs, sk-ant-* keys, Bearer tokens, env-var-looking
 *     KEY=value secrets. We don't assert on every false-positive case; the
 *     contract is "if it looks like a secret it's gone".
 *   - enqueueRun: hits db.insert with the correct row shape.
 *   - executeRun: dispatches to the worker via dispatchRun(); does NOT call
 *     Anthropic. Verifies the CAS-claim + classify-result branches:
 *       dispatched | failed (permanent) | requeued (transient) | skipped.
 *   - drainQueuedRuns: snapshots queued ids, processes each via the
 *     CAS-claim path, returns the new five-key counter shape.
 *   - computeNextWeeklyRun: back-compat shim — covered more thoroughly by
 *     `plugins-schedule.test.ts`.
 *
 * The actual research-brief and draft-blog-post handlers now live in the
 * content-tools repo and are exercised there, not here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB MOCK ────────────────────────────────────────────────────────────────

const dbMock = {
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
};

vi.mock('@/lib/db', () => ({ db: dbMock }));

// Schema export is consumed for table objects only. The runner doesn't
// inspect the column metadata directly — it goes through drizzle's query
// builder — so opaque sentinels are fine.
vi.mock('@/lib/db/schema', () => ({
  registeredAppRuns: { _t: 'registeredAppRuns' },
  registeredAppJobs: { _t: 'registeredAppJobs' },
  registeredApps: { _t: 'registeredApps' },
  contentBriefs: { _t: 'contentBriefs' },
  contentDrafts: { _t: 'contentDrafts' },
}));

// Mock dispatchRun so executeRun can be tested without an actual HTTP
// round-trip to the worker.
const dispatchRunMock = vi.fn();
vi.mock('@/lib/plugins/handlers/content-tools/dispatch', () => ({
  dispatchRun: dispatchRunMock,
  DISPATCH_SCOPE: 'content:internal:execute',
}));

const {
  redactLog,
  enqueueRun,
  executeRun,
  drainQueuedRuns,
} = await import('@/lib/plugins/handlers/content-tools/runner');

const { computeNextWeeklyRun } = await import(
  '@/lib/plugins/handlers/content-tools/jobs'
);

// Minimal RegisteredApp stub.
const fakeApp = {
  id: 42,
  slug: 'content-tools',
  name: 'Content Tools',
  icon: 'science',
  hostUrl: 'https://example.test',
  manifestUrl: 'https://example.test/sd-manifest.json',
  navLabel: null,
  navPosition: 50,
  defaultScopes: [],
  billingServiceId: null,
  visibility: 'allowlist',
  allowedClientIds: [100],
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

beforeEach(() => {
  dbMock.insert.mockReset();
  dbMock.update.mockReset();
  dbMock.select.mockReset();
  dispatchRunMock.mockReset();
});

// ─── redactLog ──────────────────────────────────────────────────────────────

describe('redactLog', () => {
  it('redacts Anthropic API keys', () => {
    const out = redactLog('using key sk-ant-abcDEF123_-XYZ from env');
    expect(out).not.toContain('sk-ant-abcDEF123_-XYZ');
    expect(out).toContain('sk-ant-[REDACTED]');
  });

  it('redacts JWTs (three base64url segments)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = redactLog(`Authorization header: ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('[REDACTED_JWT]');
  });

  it('redacts Bearer tokens', () => {
    const out = redactLog('curl -H "Authorization: Bearer abc.def-ghi/jkl+mno=="');
    expect(out).not.toContain('abc.def-ghi/jkl+mno');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('redacts env-var-looking secrets', () => {
    const out = redactLog('ANTHROPIC_API_KEY=verysecretvalue PORTAL_KMS_KEY=anotherone');
    expect(out).not.toContain('verysecretvalue');
    expect(out).not.toContain('anotherone');
    expect(out).toContain('ANTHROPIC_API_KEY=[REDACTED]');
    expect(out).toContain('PORTAL_KMS_KEY=[REDACTED]');
  });

  it('leaves harmless content alone', () => {
    const out = redactLog('run 42 succeeded resultId=12 (kind=research-brief)');
    expect(out).toBe('run 42 succeeded resultId=12 (kind=research-brief)');
  });
});

// ─── enqueueRun ─────────────────────────────────────────────────────────────

describe('enqueueRun', () => {
  it('inserts a queued row with correct shape and returns the new runId', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 7 }]);
    const values = vi.fn().mockReturnValue({ returning });
    dbMock.insert.mockReturnValue({ values });

    const result = await enqueueRun({
      app: fakeApp,
      client: { id: 100 },
      kind: 'research-brief',
      args: { topic: 'Slate Q1 2026' },
      jobId: 99,
    });

    expect(result).toEqual({ runId: 7 });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      appId: 42,
      clientId: 100,
      jobId: 99,
      kind: 'research-brief',
      args: { topic: 'Slate Q1 2026' },
      status: 'queued',
    });
  });

  it('defaults jobId to null when not provided', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 8 }]);
    const values = vi.fn().mockReturnValue({ returning });
    dbMock.insert.mockReturnValue({ values });

    await enqueueRun({
      app: fakeApp,
      client: { id: 100 },
      kind: 'draft-blog-post',
      args: { briefId: 5 },
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ jobId: null }));
  });

  it('throws if the insert returns no row', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    dbMock.insert.mockReturnValue({ values });

    await expect(enqueueRun({
      app: fakeApp,
      client: { id: 100 },
      kind: 'research-brief',
      args: {},
    })).rejects.toThrow(/insert returned no row/);
  });
});

// ─── executeRun ─────────────────────────────────────────────────────────────
// Helpers for chaining the drizzle-style builder mocks.

interface ClaimedRun {
  id: number;
  appId: number;
  clientId: number;
  kind: string;
  args: Record<string, unknown>;
  status: string;
}

function mockClaimReturns(rows: ClaimedRun[]): ReturnType<typeof vi.fn> {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  dbMock.update.mockReturnValue({ set });
  return returning;
}

function mockAppLookup(rows: typeof fakeApp[]): void {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValue({ from });
}

describe('executeRun', () => {
  it('returns skipped when the CAS-claim misses', async () => {
    mockClaimReturns([]); // claim found no queued row

    const result = await executeRun(123);

    expect(result).toEqual({ status: 'skipped', reason: 'already-claimed' });
    expect(dispatchRunMock).not.toHaveBeenCalled();
  });

  it('returns failed when the app row is missing', async () => {
    mockClaimReturns([
      { id: 1, appId: 42, clientId: 100, kind: 'research-brief', args: {}, status: 'running' },
    ]);
    mockAppLookup([]); // app deleted between enqueue and drain

    // Second update call is markRunFailed; provide a no-op chain.
    const ret = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning: ret });
    const set = vi.fn().mockReturnValue({ where });
    dbMock.update.mockReturnValueOnce({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1, appId: 42, clientId: 100, kind: 'research-brief', args: {}, status: 'running' }]) }) }) })
      .mockReturnValue({ set });

    // Re-mock from scratch with controlled sequence:
    dbMock.update.mockReset();
    const claimRet = vi.fn().mockResolvedValue([
      { id: 1, appId: 42, clientId: 100, kind: 'research-brief', args: {}, status: 'running' },
    ]);
    const claimWhere = vi.fn().mockReturnValue({ returning: claimRet });
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere });
    const markFailedSet = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({}) });
    dbMock.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: markFailedSet });

    const result = await executeRun(1);

    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/unknown-app|app/i);
    expect(dispatchRunMock).not.toHaveBeenCalled();
  });

  it('returns dispatched when dispatchRun succeeds', async () => {
    mockClaimReturns([
      { id: 5, appId: 42, clientId: 100, kind: 'research-brief', args: { topic: 't' }, status: 'running' },
    ]);
    mockAppLookup([fakeApp]);
    dispatchRunMock.mockResolvedValue({ ok: true, status: 202 });

    const result = await executeRun(5);

    expect(result).toEqual({ status: 'dispatched' });
    expect(dispatchRunMock).toHaveBeenCalledTimes(1);
    expect(dispatchRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, slug: 'content-tools' }),
      expect.objectContaining({ runId: 5, kind: 'research-brief', clientId: 100 }),
    );
  });

  it('returns requeued when dispatchRun reports a retriable failure', async () => {
    mockClaimReturns([
      { id: 6, appId: 42, clientId: 100, kind: 'research-brief', args: {}, status: 'running' },
    ]);
    mockAppLookup([fakeApp]);
    dispatchRunMock.mockResolvedValue({
      ok: false,
      retriable: true,
      status: 503,
      reason: 'worker 503: temporary unavailable',
    });

    // The revert-to-queued UPDATE needs a chainable mock too.
    dbMock.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 6, appId: 42, clientId: 100, kind: 'research-brief', args: {}, status: 'running' },
          ]),
        }),
      }),
    }).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({}),
      }),
    });

    const result = await executeRun(6);

    expect(result.status).toBe('requeued');
    expect(result.reason).toMatch(/503|unavailable/i);
  });

  it('returns failed when dispatchRun reports a non-retriable failure', async () => {
    // Sequence: claim UPDATE (returns row), then markRunFailed UPDATE.
    dbMock.update
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { id: 7, appId: 42, clientId: 100, kind: 'research-brief', args: {}, status: 'running' },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({}),
        }),
      });
    mockAppLookup([fakeApp]);
    dispatchRunMock.mockResolvedValue({
      ok: false,
      retriable: false,
      status: 400,
      reason: 'worker 400: bad kind',
    });

    const result = await executeRun(7);

    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/400|bad kind/);
  });
});

// ─── drainQueuedRuns ────────────────────────────────────────────────────────

describe('drainQueuedRuns', () => {
  it('returns zeroed counters when max <= 0', async () => {
    expect(await drainQueuedRuns(0)).toEqual({
      attempted: 0, dispatched: 0, failed: 0, requeued: 0, skipped: 0,
    });
    expect(await drainQueuedRuns(-5)).toEqual({
      attempted: 0, dispatched: 0, failed: 0, requeued: 0, skipped: 0,
    });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('snapshots up to `max` queued ids and processes each via the CAS-claim path', async () => {
    // Snapshot returns 3 ids.
    const limit = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    // For this test, claim ALL three as "already-claimed" (returning [])
    // so we exercise the skipped path. This isolates the drain machinery
    // from dispatch logic.
    const returning = vi.fn().mockResolvedValue([]);
    const updWhere = vi.fn().mockReturnValue({ returning });
    const updSet = vi.fn().mockReturnValue({ where: updWhere });
    dbMock.update.mockReturnValue({ set: updSet });

    const result = await drainQueuedRuns(5);

    expect(result.attempted).toBe(3);
    expect(result.skipped).toBe(3);
    expect(result.dispatched).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.requeued).toBe(0);
    // Each candidate triggered a CAS-claim UPDATE.
    expect(dbMock.update).toHaveBeenCalledTimes(3);
    // dispatchRun must never be invoked when every claim misses.
    expect(dispatchRunMock).not.toHaveBeenCalled();
  });

  it('returns zero counters when the queue is empty', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await drainQueuedRuns(5);

    expect(result).toEqual({
      attempted: 0, dispatched: 0, failed: 0, requeued: 0, skipped: 0,
    });
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

// ─── computeNextWeeklyRun (back-compat shim — see plugins-schedule.test.ts) ─

describe('computeNextWeeklyRun', () => {
  it('rolls forward to next Tuesday at 09:00 UTC from Friday 2026-05-15', () => {
    const from = new Date('2026-05-15T12:00:00Z');
    const next = computeNextWeeklyRun(2, '09:00', from);
    expect(next.toISOString()).toBe('2026-05-19T09:00:00.000Z');
    expect(next.getUTCDay()).toBe(2);
  });

  it('rolls forward to next week when today is the target weekday but slot has passed', () => {
    const from = new Date('2026-05-19T12:00:00Z');
    const next = computeNextWeeklyRun(2, '09:00', from);
    expect(next.toISOString()).toBe('2026-05-26T09:00:00.000Z');
  });

  it('throws on invalid inputs', () => {
    expect(() => computeNextWeeklyRun(-1, '09:00', new Date())).toThrow();
    expect(() => computeNextWeeklyRun(1, '25:00', new Date())).toThrow();
  });
});
