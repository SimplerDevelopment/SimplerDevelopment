/**
 * Unit tests for lib/brain/goals.ts.
 *
 * Coverage:
 *   - autoClassifyGoalStatus — table-driven across the full rule ladder
 *   - createGoal — rejects unknown / cross-tenant initiativeId
 *   - checkinGoal — auto-classifies when status omitted, honors explicit status,
 *                   and does NOT write an audit row
 *
 * The mutating helpers (createGoal/checkinGoal) import `@/lib/db`. We mock
 * the db module with a programmable side-channel queue (`__dbResults`) so
 * tests stage what each select/insert/update returns. The mock factory does
 * NOT close over file-scope variables — it pulls everything from globalThis
 * so the vi.mock hoist doesn't trip the "Cannot access X before init" guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// db + audit mocks — declared via globalThis so vi.mock's hoisted factory can
// reach them without tripping the TDZ guard.
// ────────────────────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __dbSelectQueue: unknown[][];
  // eslint-disable-next-line no-var
  var __dbInsertQueue: unknown[][];
  // eslint-disable-next-line no-var
  var __dbUpdateQueue: unknown[][];
  // eslint-disable-next-line no-var
  var __dbDeleteQueue: unknown[][];
  // eslint-disable-next-line no-var
  var __auditCalls: { action: string; entityId: number | null }[];
}

globalThis.__dbSelectQueue = [];
globalThis.__dbInsertQueue = [];
globalThis.__dbUpdateQueue = [];
globalThis.__dbDeleteQueue = [];
globalThis.__auditCalls = [];

vi.mock('@/lib/db', () => {
  // The chain object lets every Drizzle-style method (.from/.where/.orderBy/
  // .limit/.returning/.then) keep returning itself, with `.then` (and any
  // terminal awaitable) resolving the queued rows.
  function makeAwaitable(queue: unknown[][], fallback: unknown[] = []) {
    return new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') {
          const rows = queue.length > 0 ? queue.shift()! : fallback;
          return (resolve: (v: unknown) => void) => resolve(rows);
        }
        // Every other prop returns the same proxy so further chaining works.
        return () => makeAwaitable(queue, fallback);
      },
    });
  }

  const db = {
    select: () => makeAwaitable(globalThis.__dbSelectQueue, []),
    insert: () => ({
      values: (vals: Record<string, unknown>) => ({
        returning: () => {
          const next = globalThis.__dbInsertQueue.shift();
          if (next) return Promise.resolve(next);
          // Fallback: synthesise an id-bearing row from the insert vals.
          return Promise.resolve([{ id: 1, createdAt: new Date(), updatedAt: new Date(), ...vals }]);
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            const next = globalThis.__dbUpdateQueue.shift();
            if (next) {
              // Merge patch into each row so callers can verify field values.
              return Promise.resolve(next.map((r) => ({ ...(r as object), ...patch })));
            }
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: () => {
          const next = globalThis.__dbDeleteQueue.shift();
          return Promise.resolve(next ?? []);
        },
      }),
    }),
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(db),
  };
  return { db };
});

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: { action: string; entityId?: number | null }) => {
    globalThis.__auditCalls.push({ action: args.action, entityId: args.entityId ?? null });
  }),
}));

// ────────────────────────────────────────────────────────────────────────────
// Imports under test — AFTER the vi.mock calls.
// ────────────────────────────────────────────────────────────────────────────
import {
  autoClassifyGoalStatus,
  createGoal,
  checkinGoal,
  type BrainGoal,
} from '@/lib/brain/goals';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function goalRow(overrides: Partial<BrainGoal> = {}): BrainGoal {
  return {
    id: 1,
    clientId: 1,
    initiativeId: 1,
    title: 'g',
    description: null,
    status: 'open',
    ownerId: null,
    unit: null,
    targetMetric: null,
    currentMetric: null,
    lastProgressNote: null,
    lastCheckedInAt: null,
    targetDate: null,
    sortOrder: 0,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as BrainGoal;
}

beforeEach(() => {
  globalThis.__dbSelectQueue = [];
  globalThis.__dbInsertQueue = [];
  globalThis.__dbUpdateQueue = [];
  globalThis.__dbDeleteQueue = [];
  globalThis.__auditCalls = [];
});

// ────────────────────────────────────────────────────────────────────────────
// autoClassifyGoalStatus — table-driven, the rule ladder
// ────────────────────────────────────────────────────────────────────────────
describe('autoClassifyGoalStatus', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const created = new Date('2026-01-01T00:00:00Z');   // 5 months ago
  const future = new Date('2026-12-01T00:00:00Z');    // 6 months ahead
  const past = new Date('2026-05-01T00:00:00Z');      // 1 month ago

  // Pacing window for [created, future] at `now` is 5/11 elapsed ≈ 0.4545.
  // For a target of 100, expectedByNow ≈ 45.45.
  //   current=50 → ratio ≈ 1.10 → 'on_track'
  //   current=40 → ratio ≈ 0.88 → 'on_track'   (>= 0.8)
  //   current=30 → ratio ≈ 0.66 → 'at_risk'    (>= 0.5, < 0.8)
  //   current=10 → ratio ≈ 0.22 → 'off_track'  (< 0.5)
  it.each([
    ['achieved when current >= target', { targetMetric: 10, currentMetric: 10, targetDate: future }, 'achieved'],
    ['achieved when current > target', { targetMetric: 10, currentMetric: 15, targetDate: future }, 'achieved'],
    ['missed when overdue (regardless of metric)', { targetMetric: 100, currentMetric: 5, targetDate: past }, 'missed'],
    ['missed even when no metric set, overdue', { targetMetric: null, currentMetric: null, targetDate: past }, 'missed'],
    ['on_track at ~110% of expected', { targetMetric: 100, currentMetric: 50, targetDate: future, createdAt: created }, 'on_track'],
    ['on_track at ~88% of expected', { targetMetric: 100, currentMetric: 40, targetDate: future, createdAt: created }, 'on_track'],
    ['at_risk between 50–80% of expected', { targetMetric: 100, currentMetric: 30, targetDate: future, createdAt: created }, 'at_risk'],
    ['off_track below 50% of expected', { targetMetric: 100, currentMetric: 10, targetDate: future, createdAt: created }, 'off_track'],
    ['open when nothing measurable is set', { targetMetric: null, currentMetric: null, targetDate: null }, 'open'],
  ] as const)('%s', (_label, overrides, expected) => {
    const g = goalRow(overrides);
    expect(autoClassifyGoalStatus(g, now)).toBe(expected);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// createGoal — initiative tenant guard
// ────────────────────────────────────────────────────────────────────────────
describe('createGoal — initiative tenant check', () => {
  it('throws when initiative is missing in this tenant', async () => {
    // assertInitiativeInTenant: SELECT → []
    globalThis.__dbSelectQueue.push([]);
    await expect(
      createGoal(1, 1, { initiativeId: 999, title: 'Hit $5M ARR' }),
    ).rejects.toThrow(/initiative not found in tenant/);
  });

  it('inserts when the initiative exists; defaults currentMetric=0 when unit is set; audits AFTER insert', async () => {
    // 1) assertInitiativeInTenant: SELECT returns one row
    globalThis.__dbSelectQueue.push([{ id: 7 }]);
    // 2) insert .returning() — we'll let it synthesise from vals.
    const created = await createGoal(1, 42, {
      initiativeId: 7,
      title: 'Hit $5M ARR',
      unit: 'usd_cents',
      targetMetric: 500_000_000,
    });

    expect(created.initiativeId).toBe(7);
    expect(created.title).toBe('Hit $5M ARR');
    expect(created.currentMetric).toBe(0);
    // Audit row recorded after the insert (Pattern A).
    expect(globalThis.__auditCalls).toEqual([
      { action: 'brain_goal.create', entityId: created.id },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// checkinGoal — auto-classification + no audit
// ────────────────────────────────────────────────────────────────────────────
describe('checkinGoal — auto-classification + no-audit policy', () => {
  it('auto-picks "achieved" when currentMetric meets the target', async () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const future = new Date('2026-12-01T00:00:00Z');

    // 1) before-row read in checkinGoal
    globalThis.__dbSelectQueue.push([
      goalRow({ id: 11, targetMetric: 100, currentMetric: 50, targetDate: future, createdAt: created }),
    ]);
    // 2) update .returning() — pass back the previous row so the merged
    // version surfaces with the new status applied.
    globalThis.__dbUpdateQueue.push([
      goalRow({ id: 11, targetMetric: 100, currentMetric: 50, targetDate: future, createdAt: created }),
    ]);

    const updated = await checkinGoal(1, 1, 11, { currentMetric: 100 });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('achieved');
    expect(updated!.currentMetric).toBe(100);
    expect(updated!.lastCheckedInAt).toBeInstanceOf(Date);
    // Per PLAN.md: checkin must NOT audit.
    expect(globalThis.__auditCalls).toHaveLength(0);
  });

  it('honors an explicitly-provided status', async () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const future = new Date('2026-12-01T00:00:00Z');
    globalThis.__dbSelectQueue.push([
      goalRow({ id: 12, targetMetric: 100, currentMetric: 50, targetDate: future, createdAt: created }),
    ]);
    globalThis.__dbUpdateQueue.push([
      goalRow({ id: 12, targetMetric: 100, currentMetric: 50, targetDate: future, createdAt: created }),
    ]);

    const updated = await checkinGoal(1, 1, 12, { currentMetric: 60, status: 'at_risk' });

    expect(updated!.status).toBe('at_risk');
    expect(globalThis.__auditCalls).toHaveLength(0);
  });

  it('returns null when the goal does not exist', async () => {
    globalThis.__dbSelectQueue.push([]);  // before-row empty → null
    const updated = await checkinGoal(1, 1, 999, { currentMetric: 10 });
    expect(updated).toBeNull();
  });
});
