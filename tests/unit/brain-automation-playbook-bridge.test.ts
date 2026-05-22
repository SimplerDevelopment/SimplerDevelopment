// @vitest-environment node
/**
 * Unit tests for the automation-engine → brain-playbook bridge
 * (`tool: 'start_playbook'` action in lib/automation/engine.ts).
 *
 * Three scenarios:
 *   1. Engine dispatches `start_playbook` action by calling startRun() with
 *      the templated label + the event payload as context.
 *   2. Templating: `{ label: 'Onboarding for {{event.person.fullName}}' }`
 *      resolves against the event payload before startRun() sees it.
 *   3. Failure path: startRun() throws → automation_log status='failed' +
 *      error message captured in the actions_executed row.
 *
 * The engine reads from + writes to drizzle; we replace `@/lib/db` with a
 * recording fake. `startRun` is module-mocked so we can spy on calls without
 * exercising the playbook orchestration internals (those have their own
 * tests in tests/unit/brain-playbook-runs.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock — record select/insert/update calls, return canned rows ───────

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

const state: {
  inserts: InsertCall[];
  // Per-table FIFO queues of rows to hand back from select() chains.
  selectQueues: Map<string, unknown[][]>;
} = {
  inserts: [],
  selectQueues: new Map(),
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
  const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin', 'groupBy'];
  for (const m of methods) {
    node[m] = vi.fn((arg?: unknown) => {
      if (m === 'from') {
        (node as { _table: string })._table = tableNameFromArg(arg);
      }
      return node;
    });
  }
  (node as { _table: string })._table = 'unknown_table';
  (node as { then: (cb: (rows: unknown[]) => unknown) => Promise<unknown> }).then = (cb) => {
    const t = (node as { _table: string })._table;
    const queue = state.selectQueues.get(t) ?? [];
    const rows = queue.shift() ?? [];
    return Promise.resolve(cb(rows));
  };
  return node;
}

function makeInsertChain(table: string): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  node.values = vi.fn((v: Record<string, unknown> | Record<string, unknown>[]) => {
    state.inserts.push({ table, values: v });
    return node;
  });
  node.returning = vi.fn(() => node);
  node.onConflictDoNothing = vi.fn(() => node);
  (node as { then: (cb: (rows: unknown[]) => unknown) => Promise<unknown> }).then = (cb) => {
    return Promise.resolve(cb([{ id: 1 }]));
  };
  return node;
}

function makeUpdateChain(): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  node.set = vi.fn(() => node);
  node.where = vi.fn(() => node);
  node.returning = vi.fn(() => node);
  (node as { then: (cb: (rows: unknown[]) => unknown) => Promise<unknown> }).then = (cb) => {
    return Promise.resolve(cb([{ id: 1 }]));
  };
  return node;
}

vi.mock('@/lib/db', () => {
  const conn = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn((table: unknown) => makeInsertChain(tableNameFromArg(table))),
    update: vi.fn(() => makeUpdateChain()),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })) })),
  };
  return {
    db: {
      ...conn,
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(conn)),
    },
  };
});

// Spy on startRun so we can assert how the engine called it.
const startRunSpy = vi.fn(async () => ({ runId: 555, firstStepKeys: ['intro'], runStatus: 'active' as const }));
vi.mock('@/lib/brain/playbook-runs', () => ({
  startRun: (...args: unknown[]) => startRunSpy(...(args as Parameters<typeof startRunSpy>)),
}));

// executePortalTool isn't exercised in these tests but is imported by the
// engine — stub it so its module-init doesn't pull in real DB.
vi.mock('@/lib/ai/portal-tools', () => ({
  executePortalTool: vi.fn(async () => ({ ok: true })),
}));

beforeEach(() => {
  state.inserts = [];
  state.selectQueues.clear();
  startRunSpy.mockClear();
});

// Import AFTER mocks.
import { runRule } from '@/lib/automation/engine';

function makeRule(actions: { tool: string; params: Record<string, unknown>; delay?: number }[]) {
  return {
    id: 1,
    clientId: 42,
    name: 'test rule',
    description: null,
    trigger: { event: 'person.hired' },
    conditions: [],
    actions,
    enabled: true,
    source: 'nlp' as const,
    productScope: null,
    schedule: null,
    nextRunAt: null,
    executionCount: 0,
    lastExecutedAt: null,
    createdBy: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('engine bridges start_playbook → playbook-runs.startRun', () => {
  it('dispatches start_playbook with templated label + event payload as context', async () => {
    const rule = makeRule([{
      tool: 'start_playbook',
      params: {
        playbookId: 99,
        label: 'Onboarding for {{event.person.fullName}}',
      },
    }]);
    const payload = {
      person: { fullName: 'Jane Doe', email: 'jane@example.com' },
      _userId: 7,
      _event: 'person.hired',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runRule(rule as any, payload, 'person.hired');

    expect(startRunSpy).toHaveBeenCalledTimes(1);
    const [clientId, actorId, args] = startRunSpy.mock.calls[0] as unknown as [number, number | null, {
      playbookId: number;
      label: string;
      context: Record<string, unknown>;
      triggerPayload: Record<string, unknown>;
    }];
    expect(clientId).toBe(42);
    expect(actorId).toBe(7); // rule.createdBy
    expect(args.playbookId).toBe(99);
    expect(args.label).toBe('Onboarding for Jane Doe'); // template resolved
    expect(args.context).toEqual(payload); // event payload becomes context
    expect(args.triggerPayload).toEqual(payload);

    // Engine should have logged a success row.
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert).toBeDefined();
    const logRow = Array.isArray(logInsert!.values) ? logInsert!.values[0] : logInsert!.values;
    expect((logRow as { status: string }).status).toBe('success');
  });

  it('resolves nested {{event.field}} placeholders in custom context override', async () => {
    const rule = makeRule([{
      tool: 'start_playbook',
      params: {
        playbookId: 12,
        label: 'Renewal for {{event.company.name}}',
        context: {
          companyId: '{{event.company.id}}',
          assignedTo: '{{event.csm.email}}',
        },
      },
    }]);
    const payload = {
      company: { id: 4242, name: 'Acme Corp' },
      csm: { email: 'csm@acme.com' },
      _userId: 1,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runRule(rule as any, payload, 'contract.renewal_due');

    expect(startRunSpy).toHaveBeenCalledTimes(1);
    const [, , args] = startRunSpy.mock.calls[0] as unknown as [number, number | null, {
      label: string;
      context: Record<string, unknown>;
    }];
    expect(args.label).toBe('Renewal for Acme Corp');
    expect(args.context).toEqual({
      companyId: '4242', // numbers coerced to string via the template engine
      assignedTo: 'csm@acme.com',
    });
  });

  it('marks automation_log status=failed when startRun throws', async () => {
    startRunSpy.mockImplementationOnce(async () => {
      throw new Error('playbook is draft, must be active to start a run');
    });

    const rule = makeRule([{
      tool: 'start_playbook',
      params: { playbookId: 7, label: 'Should fail' },
    }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runRule(rule as any, { _userId: 5 }, 'whatever.event');

    expect(startRunSpy).toHaveBeenCalledTimes(1);

    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert).toBeDefined();
    const logRow = Array.isArray(logInsert!.values) ? logInsert!.values[0] : logInsert!.values;
    expect((logRow as { status: string }).status).toBe('failed');
    expect((logRow as { errorMessage: string }).errorMessage).toContain('must be active');

    // The actions_executed payload should carry the error too.
    const executed = (logRow as { actionsExecuted: { error?: string }[] }).actionsExecuted;
    expect(executed[0].error).toContain('must be active');
  });

  it('errors when neither playbookId nor playbookSlug is provided', async () => {
    const rule = makeRule([{
      tool: 'start_playbook',
      params: { label: 'No playbook' },
    }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runRule(rule as any, { _userId: 3 }, 'evt');

    expect(startRunSpy).not.toHaveBeenCalled();
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    const logRow = Array.isArray(logInsert!.values) ? logInsert!.values[0] : logInsert!.values;
    expect((logRow as { status: string }).status).toBe('failed');
  });
});
