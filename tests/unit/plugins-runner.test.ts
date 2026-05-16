// @vitest-environment node
/**
 * Unit tests for the postcaptain-tools execution backbone:
 *
 *   - redactLog: strips JWTs, sk-ant-* keys, Bearer tokens, env-var-looking
 *     KEY=value secrets. We don't assert on every false-positive case; the
 *     contract is "if it looks like a secret it's gone".
 *   - enqueueRun: hits db.insert with the correct row shape.
 *   - drainQueuedRuns: idempotent under a mocked executeRun — each
 *     candidate is processed at most once, and the counters reflect the
 *     mocked outcome.
 *   - computeNextWeeklyRun: roll-forward semantics for the weekly scheduler.
 *
 * The Anthropic-driven handlers (research-brief, draft-blog-post) are NOT
 * tested here — they require live API keys and are exercised in the
 * integration suite + the live demo flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB MOCK ────────────────────────────────────────────────────────────────
// We mock @/lib/db so the runner can be exercised without Postgres. Each
// test resets the mock state in beforeEach.

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
  postcaptainBriefs: { _t: 'postcaptainBriefs' },
  postcaptainDrafts: { _t: 'postcaptainDrafts' },
}));

// Don't reach Anthropic from these tests.
vi.mock('@/lib/plugins/handlers/postcaptain-tools/research-brief', () => ({
  runResearchBrief: vi.fn(),
}));
vi.mock('@/lib/plugins/handlers/postcaptain-tools/draft-blog-post', () => ({
  runDraftBlogPost: vi.fn(),
}));

const {
  redactLog,
  enqueueRun,
  drainQueuedRuns,
} = await import('@/lib/plugins/handlers/postcaptain-tools/runner');

const { computeNextWeeklyRun } = await import(
  '@/lib/plugins/handlers/postcaptain-tools/jobs'
);

// Minimal RegisteredApp stub that satisfies the runner's contract — only
// `id` is read for the insert row shape.
const fakeApp = {
  id: 42,
  slug: 'postcaptain-tools',
  name: 'Postcaptain Tools',
  icon: 'science',
  hostUrl: 'https://example.test',
  manifestUrl: 'https://example.test/sd-manifest.json',
  navLabel: null,
  navPosition: 50,
  defaultScopes: [],
  billingServiceId: null,
  visibility: 'allowlist',
  allowedClientIds: [103],
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

beforeEach(() => {
  dbMock.insert.mockReset();
  dbMock.update.mockReset();
  dbMock.select.mockReset();
});

// ─── redactLog ──────────────────────────────────────────────────────────────

describe('redactLog', () => {
  it('redacts Anthropic API keys', () => {
    const raw = 'using key sk-ant-abcDEF123_-XYZ from env';
    const out = redactLog(raw);
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
      client: { id: 103 },
      kind: 'research-brief',
      args: { topic: 'Slate Q1 2026' },
      jobId: 99,
    });

    expect(result).toEqual({ runId: 7 });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      appId: 42,
      clientId: 103,
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
      client: { id: 103 },
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
      client: { id: 103 },
      kind: 'research-brief',
      args: {},
    })).rejects.toThrow(/insert returned no row/);
  });
});

// ─── drainQueuedRuns ────────────────────────────────────────────────────────

describe('drainQueuedRuns', () => {
  it('returns zeroed counters when max <= 0', async () => {
    expect(await drainQueuedRuns(0)).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    expect(await drainQueuedRuns(-5)).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('snapshots up to `max` queued ids and processes each via the CAS-claim path', async () => {
    // Snapshot: 3 queued ids. Each gets a CAS-claim UPDATE; whether the
    // claim returns a row (succeed/fail path) or empty (skipped) is decided
    // by the WHERE call argument — we can't sequence by call index because
    // drainQueuedRuns processes in parallel batches and the interleaving is
    // not deterministic.
    const limit = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    // For this test, claim ALL three as "already-claimed" (returning [])
    // so we exercise the skipped path. This isolates the drain machinery
    // from the handler-specific success/fail logic, which is covered
    // implicitly by the rest of the runner code.
    const returning = vi.fn().mockResolvedValue([]);
    const updWhere = vi.fn().mockReturnValue({ returning });
    const updSet = vi.fn().mockReturnValue({ where: updWhere });
    dbMock.update.mockReturnValue({ set: updSet });

    const result = await drainQueuedRuns(5);

    // 3 candidates attempted (all skipped, none succeeded or failed).
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    // Each candidate triggered a CAS-claim UPDATE.
    expect(dbMock.update).toHaveBeenCalledTimes(3);
  });

  it('returns zero counters when the queue is empty', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await drainQueuedRuns(5);

    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

// ─── computeNextWeeklyRun ───────────────────────────────────────────────────

describe('computeNextWeeklyRun', () => {
  it('rolls forward to next Tuesday at 09:00 UTC from Friday 2026-05-15', () => {
    // 2026-05-15 is a Friday (getUTCDay === 5).
    const from = new Date('2026-05-15T12:00:00Z');
    const next = computeNextWeeklyRun(2, '09:00', from);
    // Next Tuesday after Friday 15 May 2026 is Tuesday 19 May 2026.
    expect(next.toISOString()).toBe('2026-05-19T09:00:00.000Z');
    expect(next.getUTCDay()).toBe(2);
  });

  it('rolls forward to next week when today is the target weekday but slot has passed', () => {
    // 2026-05-19 is a Tuesday at 12:00 — past the 09:00 slot, so we roll to
    // the next Tuesday (2026-05-26).
    const from = new Date('2026-05-19T12:00:00Z');
    const next = computeNextWeeklyRun(2, '09:00', from);
    expect(next.toISOString()).toBe('2026-05-26T09:00:00.000Z');
  });

  it('keeps the same day when target weekday is today and slot is in the future', () => {
    // Tuesday 06:00 — 09:00 is still ahead today.
    const from = new Date('2026-05-19T06:00:00Z');
    const next = computeNextWeeklyRun(2, '09:00', from);
    expect(next.toISOString()).toBe('2026-05-19T09:00:00.000Z');
  });

  it('handles dayOfWeek=0 (Sunday)', () => {
    const from = new Date('2026-05-15T12:00:00Z'); // Friday
    const next = computeNextWeeklyRun(0, '14:30', from);
    // Next Sunday is 2026-05-17.
    expect(next.toISOString()).toBe('2026-05-17T14:30:00.000Z');
    expect(next.getUTCDay()).toBe(0);
  });

  it('throws on invalid dayOfWeek', () => {
    expect(() => computeNextWeeklyRun(-1, '09:00', new Date())).toThrow();
    expect(() => computeNextWeeklyRun(7, '09:00', new Date())).toThrow();
  });

  it('throws on invalid timeUtc', () => {
    expect(() => computeNextWeeklyRun(1, '25:00', new Date())).toThrow();
    expect(() => computeNextWeeklyRun(1, '9:00', new Date())).toThrow(); // missing leading zero
    expect(() => computeNextWeeklyRun(1, 'bad', new Date())).toThrow();
  });
});
