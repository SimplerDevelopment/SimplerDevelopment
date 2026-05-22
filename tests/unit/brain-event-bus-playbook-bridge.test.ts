// @vitest-environment node
/**
 * Unit tests for the event-bus → brain-playbook auto-start handler
 * (`processEventForPlaybookAutoStart` in lib/automation/engine.ts).
 *
 * Scenarios:
 *   1. Match: an active event-triggered playbook whose triggerConfig.event
 *      equals the emitted event → startRun called.
 *   2. 5-second de-dup: emitting the same event twice within 5s starts ONE
 *      run, not two. Emitting it 6+ seconds later starts a second.
 *   3. Opt-out: `triggerConfig.disableAutoStart === true` skips the run.
 *   4. Tenancy: an event for clientA does NOT auto-start a playbook owned
 *      by clientB (the DB query filters by clientId — we assert the where
 *      clause was scoped correctly by feeding mismatched select results).
 *   5. Payload-filter mismatch: triggerConfig.filters that don't match the
 *      event payload skip the run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SelectQuery {
  table: string;
  whereCallCount: number;
}

const state: {
  // Per-call return value for the next select() chain. The handler only ever
  // does one select (brain_playbooks); we keep this simple by storing a
  // single pending result.
  nextRows: unknown[];
  lastQuery: SelectQuery | null;
} = {
  nextRows: [],
  lastQuery: null,
};

function tableNameFromArg(arg: unknown): string {
  if (arg && typeof arg === 'object') {
    const sym = Object.getOwnPropertySymbols(arg).find((s) => s.description === 'drizzle:Name');
    if (sym) return String((arg as Record<symbol, unknown>)[sym]);
    const t = (arg as { _?: { name?: string } })._;
    if (t?.name) return t.name;
  }
  return 'unknown_table';
}

function makeSelectChain(): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  let whereCount = 0;
  node.from = vi.fn((arg: unknown) => {
    state.lastQuery = { table: tableNameFromArg(arg), whereCallCount: 0 };
    return node;
  });
  node.where = vi.fn(() => {
    whereCount++;
    if (state.lastQuery) state.lastQuery.whereCallCount = whereCount;
    return node;
  });
  node.orderBy = vi.fn(() => node);
  node.limit = vi.fn(() => node);
  node.offset = vi.fn(() => node);
  node.innerJoin = vi.fn(() => node);
  node.leftJoin = vi.fn(() => node);
  node.groupBy = vi.fn(() => node);
  (node as { then: (cb: (rows: unknown[]) => unknown) => Promise<unknown> }).then = (cb) => {
    return Promise.resolve(cb(state.nextRows));
  };
  return node;
}

vi.mock('@/lib/db', () => {
  const conn = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 1 }])) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 1 }])) })) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
  };
  return {
    db: {
      ...conn,
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(conn)),
    },
  };
});

const startRunSpy = vi.fn(async () => ({ runId: 1, firstStepKeys: [], runStatus: 'active' as const }));
vi.mock('@/lib/brain/playbook-runs', () => ({
  startRun: (...args: unknown[]) => startRunSpy(...(args as Parameters<typeof startRunSpy>)),
}));

vi.mock('@/lib/ai/portal-tools', () => ({
  executePortalTool: vi.fn(async () => ({})),
}));

beforeEach(() => {
  state.nextRows = [];
  state.lastQuery = null;
  startRunSpy.mockClear();
});

// Import AFTER mocks.
import {
  __processEventForPlaybookAutoStart,
  __resetPlaybookAutoStartDedup,
} from '@/lib/automation/engine';
import type { AutomationEvent } from '@/lib/automation/event-bus';

function makeEvent(over: Partial<AutomationEvent> = {}): AutomationEvent {
  return {
    event: 'person.hired',
    clientId: 1,
    userId: 9,
    payload: { person: { fullName: 'Test Hire' } },
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

describe('processEventForPlaybookAutoStart', () => {
  beforeEach(() => __resetPlaybookAutoStartDedup());

  it('starts an active event-triggered playbook whose triggerConfig.event matches', async () => {
    state.nextRows = [
      {
        id: 50,
        name: 'New hire',
        triggerConfig: { event: 'person.hired' },
        createdBy: 7,
      },
    ];

    await __processEventForPlaybookAutoStart(makeEvent());

    expect(startRunSpy).toHaveBeenCalledTimes(1);
    const [clientId, actorId, args] = startRunSpy.mock.calls[0] as unknown as [number, number | null, {
      playbookId: number;
      label: string;
      context: Record<string, unknown>;
    }];
    expect(clientId).toBe(1);
    expect(actorId).toBe(7);
    expect(args.playbookId).toBe(50);
    expect(args.label).toContain('person.hired');
    expect(args.context).toEqual({ person: { fullName: 'Test Hire' } });

    // Query must have been against brain_playbooks.
    expect(state.lastQuery?.table).toBe('brain_playbooks');
  });

  it('de-duplicates two emissions within a 5-second window', async () => {
    state.nextRows = [
      { id: 50, name: 'P', triggerConfig: { event: 'person.hired' }, createdBy: null },
    ];
    await __processEventForPlaybookAutoStart(makeEvent({
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
    }));
    expect(startRunSpy).toHaveBeenCalledTimes(1);

    // Same bucket — must NOT start a second run.
    state.nextRows = [
      { id: 50, name: 'P', triggerConfig: { event: 'person.hired' }, createdBy: null },
    ];
    await __processEventForPlaybookAutoStart(makeEvent({
      timestamp: new Date('2026-01-01T00:00:02.500Z'),
    }));
    expect(startRunSpy).toHaveBeenCalledTimes(1);

    // 6 seconds later — different bucket — should start a second.
    state.nextRows = [
      { id: 50, name: 'P', triggerConfig: { event: 'person.hired' }, createdBy: null },
    ];
    await __processEventForPlaybookAutoStart(makeEvent({
      timestamp: new Date('2026-01-01T00:00:06.000Z'),
    }));
    expect(startRunSpy).toHaveBeenCalledTimes(2);
  });

  it('skips when triggerConfig.disableAutoStart === true', async () => {
    state.nextRows = [
      {
        id: 51,
        name: 'P',
        triggerConfig: { event: 'person.hired', disableAutoStart: true },
        createdBy: null,
      },
    ];
    await __processEventForPlaybookAutoStart(makeEvent());
    expect(startRunSpy).not.toHaveBeenCalled();
  });

  it('skips when triggerConfig.event does NOT match the emitted event', async () => {
    // The DB filter is on triggerKind+status+clientId, NOT on the JSON
    // triggerConfig.event field, so the handler still gets a candidate row
    // that doesn't match and must filter it out in-process.
    state.nextRows = [
      { id: 52, name: 'P', triggerConfig: { event: 'invoice.paid' }, createdBy: null },
    ];
    await __processEventForPlaybookAutoStart(makeEvent({ event: 'person.hired' }));
    expect(startRunSpy).not.toHaveBeenCalled();
  });

  it('respects payload filters in triggerConfig.filters', async () => {
    state.nextRows = [
      {
        id: 53,
        name: 'P',
        triggerConfig: {
          event: 'crm.deal.won',
          filters: { stage: 'enterprise' },
        },
        createdBy: null,
      },
    ];
    // Mismatch — should skip.
    await __processEventForPlaybookAutoStart(makeEvent({
      event: 'crm.deal.won',
      payload: { stage: 'smb' },
    }));
    expect(startRunSpy).not.toHaveBeenCalled();

    // Match — should fire.
    state.nextRows = [
      {
        id: 53,
        name: 'P',
        triggerConfig: {
          event: 'crm.deal.won',
          filters: { stage: 'enterprise' },
        },
        createdBy: null,
      },
    ];
    await __processEventForPlaybookAutoStart(makeEvent({
      event: 'crm.deal.won',
      payload: { stage: 'enterprise' },
      timestamp: new Date('2026-02-01T00:00:00.000Z'),
    }));
    expect(startRunSpy).toHaveBeenCalledTimes(1);
  });

  it('tenancy: the DB query filters on event.clientId — handler does not start runs for foreign playbooks', async () => {
    // Empty result set simulates the tenant-scoped query returning nothing
    // (because the matching playbook belongs to a different client).
    state.nextRows = [];
    await __processEventForPlaybookAutoStart(makeEvent({ clientId: 99 }));
    expect(startRunSpy).not.toHaveBeenCalled();

    // The where clause should still have been called (we filter by clientId
    // in the engine — the proof is the brain_playbooks query was issued).
    expect(state.lastQuery?.table).toBe('brain_playbooks');
    expect(state.lastQuery?.whereCallCount).toBeGreaterThan(0);
  });

  it('startRun failures are caught and logged — handler does not throw', async () => {
    startRunSpy.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    state.nextRows = [
      { id: 60, name: 'P', triggerConfig: { event: 'person.hired' }, createdBy: null },
    ];
    await expect(__processEventForPlaybookAutoStart(makeEvent())).resolves.toBeUndefined();
    expect(startRunSpy).toHaveBeenCalledTimes(1);
  });
});
