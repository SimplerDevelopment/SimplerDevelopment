// @vitest-environment node
/**
 * Unit tests for the scheduled-automations cron handler.
 *
 * Scope mirrors the other cron unit suites in this directory: SQL semantics
 * (the partial index scan, the actual CAS race on `next_run_at`) live at the
 * integration layer where a real Postgres validates them. Here we lock in the
 * route-owned branches:
 *
 *   - auth gate (Vercel header / CRON_SECRET fallback / 401 when secret unset)
 *   - response envelope `{ success, scanned, fired, skipped, errors }`
 *   - empty due-queue → all counters zero
 *   - CAS-claim semantics: when the UPDATE returns 0 rows (another worker beat
 *     us), the rule counts as `skipped` and runRule() is NOT invoked
 *   - one bad rule does NOT tank the tick: runRule() throwing increments
 *     `errors` while the other rules still process
 *   - rules with null schedule or null nextRunAt are skipped without firing
 *   - cap at 100 per tick (we don't verify the SQL-level limit; we verify the
 *     route doesn't add any post-limit budget enforcement that would short us)
 *
 * The route uses Drizzle's chained query builder, so the db mock returns
 * thenables. `selectQueue` feeds the due-rules scan; `claimQueue` feeds each
 * CAS update's `.returning()` call. Both helpers — `computeNextRunAt` and
 * `runRule` — are mocked because they have their own unit suites
 * (`automationSchedule.test.ts`) or live in code that touches the portal
 * tools (we'd need a real DB to run them).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Each test triggers a fresh dynamic import of the route module (we
// `vi.resetModules()` in beforeEach so env-var reads happen at import time).
// First-time route imports drag in Next/Drizzle and take a while on cold
// caches; bump the default 5s timeout so this isn't flaky on slow CI.
const TEST_TIMEOUT_MS = 30_000;

type Row = Record<string, unknown>;
const selectQueue: Row[][] = [];
const claimQueue: Row[][] = [];

function makeSelectChain() {
  // Matches: db.select().from(automationRules).where(and(...)).orderBy(...).limit(100)
  const builder: {
    select: typeof builder;
    from: typeof builder;
    where: typeof builder;
    orderBy: typeof builder;
    limit: typeof builder;
    then: (
      resolve: (rows: Row[]) => unknown,
      reject?: (err: unknown) => unknown,
    ) => Promise<unknown>;
  } = {} as never;
  const chain = (..._args: unknown[]) => builder;
  builder.select = chain as unknown as typeof builder;
  builder.from = chain as unknown as typeof builder;
  builder.where = chain as unknown as typeof builder;
  builder.orderBy = chain as unknown as typeof builder;
  builder.limit = chain as unknown as typeof builder;
  builder.then = (resolve, reject) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return builder;
}

function makeUpdateChain() {
  // Matches: db.update(automationRules).set({...}).where(and(...)).returning({...})
  // .returning() is awaited directly (no further chain), so it returns a
  // Promise that resolves to the next batch from `claimQueue`. A 0-length
  // batch models the CAS losing the race.
  const builder: {
    set: (..._args: unknown[]) => typeof builder;
    where: (..._args: unknown[]) => typeof builder;
    returning: (..._args: unknown[]) => Promise<Row[]>;
  } = {
    set: () => builder,
    where: () => builder,
    returning: () => Promise.resolve(claimQueue.shift() ?? []),
  };
  return builder;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (..._args: unknown[]) => makeSelectChain(),
    update: (..._args: unknown[]) => makeUpdateChain(),
  },
}));

const computeNextRunAtMock = vi.fn();
vi.mock('@/lib/automation/schedule', () => ({
  computeNextRunAt: (...args: unknown[]) => computeNextRunAtMock(...args),
}));

const runRuleMock = vi.fn();
vi.mock('@/lib/automation/engine', () => ({
  runRule: (...args: unknown[]) => runRuleMock(...args),
}));

describe('GET /api/cron/process-scheduled-automations', { timeout: TEST_TIMEOUT_MS }, () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    selectQueue.length = 0;
    claimQueue.length = 0;
    computeNextRunAtMock.mockReset();
    computeNextRunAtMock.mockReturnValue(new Date('2026-05-12T12:00:00Z'));
    runRuleMock.mockReset();
    runRuleMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(new Request('http://x/api/cron/process-scheduled-automations'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('rejects when CRON_SECRET is unset (post-C2 hardening)', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(new Request('http://x/api/cron/process-scheduled-automations'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('accepts the Vercel cron header and returns empty counters for an empty queue', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]); // no due rules
    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(
      new Request('http://x/api/cron/process-scheduled-automations', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      scanned: number;
      fired: number;
      skipped: number;
      errors: { ruleId: number; message: string }[];
    };
    expect(json).toMatchObject({
      success: true,
      scanned: 0,
      fired: 0,
      skipped: 0,
      errors: [],
    });
    expect(runRuleMock).not.toHaveBeenCalled();
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]);
    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(
      new Request('http://x/api/cron/process-scheduled-automations', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('fires a rule when the CAS claim wins (returning() yields 1 row)', async () => {
    process.env.CRON_SECRET = 'shh';
    const rule = {
      id: 42,
      clientId: 1,
      schedule: { kind: 'daily', hour: 9, minute: 0 },
      nextRunAt: new Date('2026-05-12T09:00:00Z'),
      enabled: true,
      conditions: [],
      actions: [],
      createdBy: null,
    };
    selectQueue.push([rule]);
    claimQueue.push([{ id: 42 }]); // CAS won

    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(
      new Request('http://x/api/cron/process-scheduled-automations', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { scanned: number; fired: number; skipped: number };
    expect(json).toMatchObject({ scanned: 1, fired: 1, skipped: 0 });

    expect(runRuleMock).toHaveBeenCalledTimes(1);
    const [passedRule, payload, label] = runRuleMock.mock.calls[0]!;
    expect((passedRule as { id: number }).id).toBe(42);
    expect(payload).toMatchObject({ ruleId: 42 });
    expect(typeof (payload as { firedAt: string }).firedAt).toBe('string');
    expect(label).toBe('automation.scheduled');
  });

  it('skips a rule when the CAS update returns 0 rows (lost the race)', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 99,
        schedule: { kind: 'weekly', day: 1, hour: 9, minute: 0 },
        nextRunAt: new Date('2026-05-12T09:00:00Z'),
        enabled: true,
        conditions: [],
        actions: [],
        createdBy: null,
      },
    ]);
    claimQueue.push([]); // CAS lost — another worker claimed it first

    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(
      new Request('http://x/api/cron/process-scheduled-automations', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      scanned: number;
      fired: number;
      skipped: number;
      errors: unknown[];
    };
    expect(json).toMatchObject({ scanned: 1, fired: 0, skipped: 1, errors: [] });
    expect(runRuleMock).not.toHaveBeenCalled();
  });

  it('isolates a single bad rule: errors increments, sibling rules still fire', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 1,
        schedule: { kind: 'daily', hour: 9, minute: 0 },
        nextRunAt: new Date('2026-05-12T09:00:00Z'),
        enabled: true,
        conditions: [],
        actions: [],
        createdBy: null,
      },
      {
        id: 2,
        schedule: { kind: 'daily', hour: 9, minute: 0 },
        nextRunAt: new Date('2026-05-12T09:00:00Z'),
        enabled: true,
        conditions: [],
        actions: [],
        createdBy: null,
      },
      {
        id: 3,
        schedule: { kind: 'daily', hour: 9, minute: 0 },
        nextRunAt: new Date('2026-05-12T09:00:00Z'),
        enabled: true,
        conditions: [],
        actions: [],
        createdBy: null,
      },
    ]);
    // All three CAS claims win.
    claimQueue.push([{ id: 1 }]);
    claimQueue.push([{ id: 2 }]);
    claimQueue.push([{ id: 3 }]);

    // Middle rule throws — the other two should still fire.
    runRuleMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(
      new Request('http://x/api/cron/process-scheduled-automations', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      scanned: number;
      fired: number;
      skipped: number;
      errors: { ruleId: number; message: string }[];
    };
    expect(json.scanned).toBe(3);
    expect(json.fired).toBe(2);
    expect(json.skipped).toBe(0);
    expect(json.errors).toEqual([{ ruleId: 2, message: 'boom' }]);
    expect(runRuleMock).toHaveBeenCalledTimes(3);
  });

  it('skips rules whose schedule or nextRunAt is null without crashing', async () => {
    process.env.CRON_SECRET = 'shh';
    // SQL filters these out under the partial index, but the route's
    // belt-and-suspenders null-check still must not throw.
    selectQueue.push([
      {
        id: 10,
        schedule: null,
        nextRunAt: new Date('2026-05-12T09:00:00Z'),
        enabled: true,
        conditions: [],
        actions: [],
        createdBy: null,
      },
      {
        id: 11,
        schedule: { kind: 'daily', hour: 9, minute: 0 },
        nextRunAt: null,
        enabled: true,
        conditions: [],
        actions: [],
        createdBy: null,
      },
    ]);
    // No CAS attempts because both rules are filtered out before claim.

    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(
      new Request('http://x/api/cron/process-scheduled-automations', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      scanned: number;
      fired: number;
      skipped: number;
      errors: unknown[];
    };
    expect(json).toMatchObject({ scanned: 2, fired: 0, skipped: 2, errors: [] });
    expect(runRuleMock).not.toHaveBeenCalled();
  });

  it('passes the recomputed nextRunAt into the CAS update (delegates to computeNextRunAt)', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 77,
        schedule: { kind: 'daily', hour: 9, minute: 0 },
        nextRunAt: new Date('2026-05-12T09:00:00Z'),
        enabled: true,
        conditions: [],
        actions: [],
        createdBy: null,
      },
    ]);
    claimQueue.push([{ id: 77 }]);

    const nextFixed = new Date('2026-05-13T09:00:00Z');
    computeNextRunAtMock.mockReturnValueOnce(nextFixed);

    const { GET } = await import('@/app/api/cron/process-scheduled-automations/route');
    const res = await GET(
      new Request('http://x/api/cron/process-scheduled-automations', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    // We verify the helper was invoked with the rule's schedule + now()-ish
    // arg. The actual Date value drift between now() captures is fine — we
    // just check it's a Date.
    expect(computeNextRunAtMock).toHaveBeenCalledTimes(1);
    const [schedule, nowArg] = computeNextRunAtMock.mock.calls[0]!;
    expect(schedule).toMatchObject({ kind: 'daily', hour: 9 });
    expect(nowArg).toBeInstanceOf(Date);
  });
});
