// @vitest-environment node
/**
 * Unit tests for lib/billing/usage-alerts.ts — evaluateThresholds only.
 *
 * evaluateThresholds is a pure function (no DB), but the module imports
 * @/lib/db at the top level, so we stub the DB and its schema to prevent
 * the DATABASE_URL guard from throwing at import time (same pattern as
 * tests/unit/ai-credits.test.ts).
 *
 * The DB-coupled functions (computeUsageSnapshot, runUsageAlerts) belong in
 * integration tests and are not exercised here.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Stub @/lib/db so the module-level import doesn't throw ───────────────────
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ groupBy: () => Promise.resolve([]) }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }), returning: () => Promise.resolve([]) }) }),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy({ __table: name }, {
      get(t, p: string) { return p === '__table' ? name : { __col: p, __table: name }; },
    });
  return new Proxy({} as Record<string, unknown>, {
    get(_, p: string) {
      if (p === '__esModule' || p === 'default' || p === 'then') return undefined;
      return wrap(p);
    },
    has() { return true; },
  });
});

// Stub transitive deps that also import @/lib/db
vi.mock('@/lib/ai-credits', () => ({ getMonthlyUsage: async () => 0, getBalance: async () => ({ balance: 0, monthlyGrant: 0, payAsYouGo: false }) }));
vi.mock('@/lib/billing/entitlements', () => ({ getClientEntitlements: async () => ({ mode: 'saas', domains: new Set(), hasBundle: false, gatingBypassed: false }) }));
vi.mock('@/lib/email', () => ({ getResend: () => ({ emails: { send: async () => ({}) } }) }));

import { evaluateThresholds, type UsageSnapshotRow, type ThresholdRow } from '@/lib/billing/usage-alerts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<UsageSnapshotRow> = {}): UsageSnapshotRow {
  return {
    resource: 'email_send',
    label: 'Email sends',
    unit: 'emails',
    used: 0,
    included: 10_000,
    pct: 0,
    overageRateCents: 100,
    overageUnitSize: 1_000,
    waivedForByok: true,
    ...overrides,
  };
}

function makeThreshold(overrides: Partial<ThresholdRow> = {}): ThresholdRow {
  return {
    resource: 'email_send',
    warnAtPct: 80,
    hardLimitQuantity: null,
    notifyEmail: true,
    notifyPortal: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateThresholds', () => {
  it('fires a warning alert at the default 80% threshold when no threshold row supplied', () => {
    const snapshot = [makeRow({ used: 8_500, included: 10_000, pct: 85 })];
    const alerts = evaluateThresholds(snapshot, []);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('warning');
    expect(alerts[0].resource).toBe('email_send');
  });

  it('does not fire when usage is below the default 80% threshold', () => {
    const snapshot = [makeRow({ used: 7_900, included: 10_000, pct: 79 })];
    const alerts = evaluateThresholds(snapshot, []);
    expect(alerts).toHaveLength(0);
  });

  it('respects a custom warnAtPct from a threshold row', () => {
    const snapshot = [makeRow({ used: 6_000, included: 10_000, pct: 60 })];
    const thresholds = [makeThreshold({ warnAtPct: 50 })];
    const alerts = evaluateThresholds(snapshot, thresholds);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('warning');
  });

  it('does not fire when usage is below a custom warnAtPct', () => {
    const snapshot = [makeRow({ used: 4_900, included: 10_000, pct: 49 })];
    const thresholds = [makeThreshold({ warnAtPct: 50 })];
    const alerts = evaluateThresholds(snapshot, thresholds);
    expect(alerts).toHaveLength(0);
  });

  it('fires an exceeded alert when used >= included', () => {
    const snapshot = [makeRow({ used: 10_000, included: 10_000, pct: 100 })];
    const alerts = evaluateThresholds(snapshot, []);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('exceeded');
  });

  it('fires exceeded (not warning) when used exactly equals included', () => {
    // Warning (pct=100 >= 80) should be superseded by exceeded.
    const snapshot = [makeRow({ used: 10_000, included: 10_000, pct: 100 })];
    const alerts = evaluateThresholds(snapshot, [makeThreshold({ warnAtPct: 80 })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('exceeded');
  });

  it('fires a hard_limit alert when used >= hardLimitQuantity', () => {
    const snapshot = [makeRow({ used: 15_000, included: 10_000, pct: 150 })];
    const thresholds = [makeThreshold({ hardLimitQuantity: 12_000 })];
    const alerts = evaluateThresholds(snapshot, thresholds);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('hard_limit');
  });

  it('hard_limit takes precedence over exceeded', () => {
    // used > included AND used >= hardLimitQuantity → only hard_limit fires
    const snapshot = [makeRow({ used: 12_000, included: 10_000, pct: 120 })];
    const thresholds = [makeThreshold({ hardLimitQuantity: 11_000 })];
    const alerts = evaluateThresholds(snapshot, thresholds);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('hard_limit');
  });

  it('does not fire any alert when included is 0', () => {
    // A meter with no allowance should not generate alerts.
    const snapshot = [makeRow({ used: 9_999, included: 0, pct: 0 })];
    const alerts = evaluateThresholds(snapshot, []);
    expect(alerts).toHaveLength(0);
  });

  it('handles multiple resources independently', () => {
    const snapshot = [
      makeRow({ resource: 'email_send', used: 8_500, included: 10_000, pct: 85 }),
      makeRow({ resource: 'esign_envelopes', used: 5, included: 20, pct: 25, label: 'Envelopes', unit: 'envelopes' }),
      makeRow({ resource: 'automation_runs', used: 1_100, included: 1_000, pct: 110, label: 'Automation runs', unit: 'runs' }),
    ];
    const thresholds: ThresholdRow[] = [
      makeThreshold({ resource: 'email_send', warnAtPct: 80 }),
      makeThreshold({ resource: 'esign_envelopes', warnAtPct: 80 }),
      makeThreshold({ resource: 'automation_runs', warnAtPct: 80 }),
    ];
    const alerts = evaluateThresholds(snapshot, thresholds);
    // email_send: warning; esign_envelopes: no alert; automation_runs: exceeded
    expect(alerts).toHaveLength(2);
    const levels = Object.fromEntries(alerts.map((a) => [a.resource, a.level]));
    expect(levels['email_send']).toBe('warning');
    expect(levels['automation_runs']).toBe('exceeded');
    expect(levels['esign_envelopes']).toBeUndefined();
  });

  it('passes through notifyEmail and notifyPortal from threshold row', () => {
    const snapshot = [makeRow({ used: 9_000, included: 10_000, pct: 90 })];
    const thresholds = [makeThreshold({ notifyEmail: false, notifyPortal: true })];
    const alerts = evaluateThresholds(snapshot, thresholds);
    expect(alerts[0].notifyEmail).toBe(false);
    expect(alerts[0].notifyPortal).toBe(true);
  });

  it('defaults notifyEmail and notifyPortal to true when no threshold row', () => {
    const snapshot = [makeRow({ used: 9_000, included: 10_000, pct: 90 })];
    const alerts = evaluateThresholds(snapshot, []);
    expect(alerts[0].notifyEmail).toBe(true);
    expect(alerts[0].notifyPortal).toBe(true);
  });
});
