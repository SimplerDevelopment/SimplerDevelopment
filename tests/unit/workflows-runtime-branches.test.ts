// @vitest-environment node
/**
 * Branch-coverage tests for `runWorkflow` / `executeAction` / `walk` in
 * lib/workflows/runtime.ts. Sister to workflows-runtime.test.ts which
 * covers the happy-path graph; this file exercises the action-kind
 * matrix, condition branching, the cycle guard, and failure paths.
 *
 * Mocks the same drizzle fluent chain. Routes selects against
 * `workflows` to an in-memory store and treats every other table as
 * empty unless explicitly seeded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  workflows: Array<{ id: number; clientId: number; trigger: unknown; graph: unknown }>;
  workflowRuns: Array<Record<string, unknown>>;
  workflowStepLogs: Array<Record<string, unknown>>;
  fetchCalls: Array<{ url: string; body: unknown }>;
}

const state: MockState = {
  workflows: [],
  workflowRuns: [],
  workflowStepLogs: [],
  fetchCalls: [],
};

const TABLES = {
  workflows: { __table: 'workflows' },
  workflowRuns: { __table: 'workflowRuns' },
  workflowStepLogs: { __table: 'workflowStepLogs' },
  emailTemplates: { __table: 'emailTemplates' },
  emailSubscribers: { __table: 'emailSubscribers' },
  kanbanCards: { __table: 'kanbanCards' },
  kanbanColumns: { __table: 'kanbanColumns' },
  kanbanCardAssignees: { __table: 'kanbanCardAssignees' },
  projects: { __table: 'projects' },
};

vi.mock('@/lib/db/schema', () => TABLES);

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  function buildSelectChain(table: { __table: string }) {
    let pendingFilter: unknown = null;
    const chain = {
      from: () => chain,
      where: (arg: unknown) => {
        pendingFilter = arg;
        return chain;
      },
      orderBy: () => chain,
      limit: () => {
        if (table.__table === 'workflows') {
          const id = extractEqValue(pendingFilter);
          const found = state.workflows.find((w) => w.id === id);
          return Promise.resolve(found ? [found] : []);
        }
        return Promise.resolve([]);
      },
    };
    return chain;
  }

  function buildInsertChain(table: { __table: string }) {
    return {
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
        const row = Array.isArray(vals) ? vals[0] : vals;
        const augmented = { ...row, id: nextId() };
        if (table.__table === 'workflowRuns') state.workflowRuns.push(augmented);
        else if (table.__table === 'workflowStepLogs') state.workflowStepLogs.push(augmented);
        return {
          returning: () => Promise.resolve([augmented]),
          onConflictDoNothing: () => Promise.resolve(undefined),
        };
      },
    };
  }

  function buildUpdateChain(table: { __table: string }) {
    return {
      set: (patch: Record<string, unknown>) => ({
        where: (filter: unknown) => {
          if (table.__table === 'workflowRuns') {
            const id = extractEqValue(filter);
            const row = state.workflowRuns.find((r) => (r as { id: number }).id === id);
            if (row) Object.assign(row, patch);
          }
          return Promise.resolve(undefined);
        },
      }),
    };
  }

  return {
    db: {
      select: () => ({
        from: (table: { __table: string }) => buildSelectChain(table),
      }),
      insert: (table: { __table: string }) => buildInsertChain(table),
      update: (table: { __table: string }) => buildUpdateChain(table),
      delete: () => ({ where: () => Promise.resolve(undefined) }),
    },
  };
});

let idCounter = 1;
function nextId(): number {
  return idCounter++;
}

function extractEqValue(filter: unknown): number | null {
  if (!filter || typeof filter !== 'object') return null;
  const f = filter as { op: string; a?: unknown; b?: unknown; args?: unknown[] };
  if (f.op === 'eq' && typeof f.b === 'number') return f.b;
  if (f.op === 'and' && Array.isArray(f.args)) {
    for (const inner of f.args) {
      const v = extractEqValue(inner);
      if (v != null) return v;
    }
  }
  return null;
}

beforeEach(() => {
  state.workflows.length = 0;
  state.workflowRuns.length = 0;
  state.workflowStepLogs.length = 0;
  state.fetchCalls.length = 0;
  idCounter = 1;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    state.fetchCalls.push({ url: u, body: init?.body ?? null });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
});

/** Build a 2-node graph: trigger → action. Convenience for narrow tests. */
function singleActionGraph(action: Record<string, unknown>) {
  return {
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'contact.created' } },
      { id: 'act', type: 'action', position: { x: 0, y: 100 }, data: action },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'act' }],
  };
}

function seedWorkflow(id: number, graph: unknown, clientId = 1) {
  state.workflows.push({ id, clientId, trigger: { kind: 'manual' }, graph });
}

const lastLog = () => state.workflowStepLogs[state.workflowStepLogs.length - 1] as Record<string, unknown>;
const actionLog = () => state.workflowStepLogs.filter((l) => l.action !== 'trigger')[0] as Record<string, unknown>;

describe('runWorkflow — workflow lookup', () => {
  it('throws when the workflow row is missing', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    await expect(runWorkflow(999, { clientId: 1 }, { maxWaitMs: 0 })).rejects.toThrow(/not found/);
  });

  it('defaults triggeredBy to "manual" when not provided', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(1, singleActionGraph({ kind: 'wait', ms: 0 }));
    const result = await runWorkflow(1, { clientId: 1 }, { maxWaitMs: 0 });
    expect(result.status).toBe('completed');
    expect(state.workflowRuns[0].triggeredBy).toBe('manual');
  });

  it('honors explicit triggeredBy', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(2, singleActionGraph({ kind: 'wait', ms: 0 }));
    await runWorkflow(2, { clientId: 1 }, { triggeredBy: 'cron', maxWaitMs: 0 });
    expect(state.workflowRuns[0].triggeredBy).toBe('cron');
  });
});

describe('executeAction — wait', () => {
  it('does NOT call setTimeout when ms=0', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    seedWorkflow(10, singleActionGraph({ kind: 'wait', ms: 0 }));
    await runWorkflow(10, { clientId: 1 }, { maxWaitMs: 0 });
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
    expect(actionLog().output).toMatchObject({ waited: 0, requested: 0 });
  });

  it('clamps negative ms to 0', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(11, singleActionGraph({ kind: 'wait', ms: -50 }));
    await runWorkflow(11, { clientId: 1 }, { maxWaitMs: 1000 });
    expect(actionLog().output).toMatchObject({ waited: 0, requested: -50 });
  });

  it('clamps ms down to maxWaitMs (default 5s, override)', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    // Use 1ms cap so the test stays fast.
    seedWorkflow(12, singleActionGraph({ kind: 'wait', ms: 100_000 }));
    await runWorkflow(12, { clientId: 1 }, { maxWaitMs: 1 });
    const out = actionLog().output as { waited: number; requested: number };
    expect(out.waited).toBe(1);
    expect(out.requested).toBe(100_000);
  });

  it('actually awaits setTimeout when ms > 0', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(13, singleActionGraph({ kind: 'wait', ms: 5 }));
    const before = Date.now();
    await runWorkflow(13, { clientId: 1 }, { maxWaitMs: 50 });
    expect(Date.now() - before).toBeGreaterThanOrEqual(4);
  });
});

describe('executeAction — webhook', () => {
  it('marks step failed when fetch returns non-2xx', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('boom', { status: 500 }),
    );
    seedWorkflow(20, singleActionGraph({ kind: 'webhook', url: 'https://x.test/hook' }));
    const result = await runWorkflow(20, { clientId: 1 }, { maxWaitMs: 0 });
    // Run still completes — the step failed but no exception propagated.
    expect(result.status).toBe('completed');
    expect(actionLog().status).toBe('failed');
    expect(actionLog().output).toMatchObject({ url: 'https://x.test/hook', status: 500 });
  });

  it('marks step failed when fetch throws', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network down'),
    );
    seedWorkflow(21, singleActionGraph({ kind: 'webhook', url: 'https://x.test/hook' }));
    await runWorkflow(21, { clientId: 1 }, { maxWaitMs: 0 });
    expect(actionLog().status).toBe('failed');
    expect((actionLog().output as { error: string }).error).toMatch(/network down/);
  });

  it('defaults payload to {} when not provided', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(22, singleActionGraph({ kind: 'webhook', url: 'https://x.test/hook' }));
    await runWorkflow(22, { clientId: 1 }, { maxWaitMs: 0 });
    expect(state.fetchCalls[0].body).toBe('{}');
  });

  it('serializes provided payload as JSON', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(
      23,
      singleActionGraph({ kind: 'webhook', url: 'https://x.test/hook', payload: { a: 1 } }),
    );
    await runWorkflow(23, { clientId: 1 }, { maxWaitMs: 0 });
    expect(state.fetchCalls[0].body).toBe('{"a":1}');
  });
});

describe('walk — failed step does not fan out', () => {
  it('skips downstream nodes after a failed step', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );
    seedWorkflow(30, {
      nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'manual' } },
        {
          id: 'hook',
          type: 'action',
          position: { x: 0, y: 100 },
          data: { kind: 'webhook', url: 'https://x.test/hook' },
        },
        {
          id: 'downstream',
          type: 'action',
          position: { x: 0, y: 200 },
          data: { kind: 'wait', ms: 0 },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'hook' },
        { id: 'e2', source: 'hook', target: 'downstream' },
      ],
    });
    await runWorkflow(30, { clientId: 1 }, { maxWaitMs: 0 });

    // trigger + hook logged; downstream wait not logged.
    const actions = state.workflowStepLogs.map((l) => l.action);
    expect(actions).toEqual(['trigger', 'webhook']);
  });
});

describe('walk — cycle guard', () => {
  it('does not re-execute a node already visited in this run', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(40, {
      nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'manual' } },
        {
          id: 'a',
          type: 'action',
          position: { x: 0, y: 100 },
          data: { kind: 'wait', ms: 0 },
        },
        {
          id: 'b',
          type: 'action',
          position: { x: 0, y: 200 },
          data: { kind: 'wait', ms: 0 },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'a' },
        { id: 'e2', source: 'a', target: 'b' },
        { id: 'e3', source: 'b', target: 'a' }, // cycle back to a
      ],
    });
    await runWorkflow(40, { clientId: 1 }, { maxWaitMs: 0 });

    // a and b each fire exactly once.
    const actions = state.workflowStepLogs.map((l) => l.action);
    expect(actions).toEqual(['trigger', 'wait', 'wait']);
    expect(state.workflowStepLogs).toHaveLength(3);
  });
});

describe('executeAction — condition branching', () => {
  function conditionGraph(expression: string) {
    return {
      nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'manual' } },
        {
          id: 'cond',
          type: 'condition',
          position: { x: 0, y: 100 },
          data: { kind: 'condition', expression },
        },
        {
          id: 'yes',
          type: 'action',
          position: { x: -100, y: 200 },
          data: { kind: 'wait', ms: 0 },
        },
        {
          id: 'no',
          type: 'action',
          position: { x: 100, y: 200 },
          data: { kind: 'wait', ms: 0 },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'yes', label: 'true' },
        { id: 'e3', source: 'cond', target: 'no', label: 'false' },
      ],
    };
  }

  it('takes the TRUE branch when context.conditions overrides to true', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(50, conditionGraph('deal.stale'));
    await runWorkflow(
      50,
      { clientId: 1, conditions: { 'deal.stale': true } },
      { maxWaitMs: 0 },
    );
    // Trigger + condition + the YES branch's wait (node id 'yes').
    const nodeIds = state.workflowStepLogs.map((l) => l.nodeId);
    expect(nodeIds).toEqual(['trigger', 'cond', 'yes']);
  });

  it('takes the FALSE branch when context.conditions overrides to false', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(51, conditionGraph('deal.stale'));
    await runWorkflow(
      51,
      { clientId: 1, conditions: { 'deal.stale': false } },
      { maxWaitMs: 0 },
    );
    const nodeIds = state.workflowStepLogs.map((l) => l.nodeId);
    expect(nodeIds).toEqual(['trigger', 'cond', 'no']);
  });

  it('defaults to TRUE when there is no override in context', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(52, conditionGraph('deal.stale'));
    await runWorkflow(52, { clientId: 1 }, { maxWaitMs: 0 });
    const nodeIds = state.workflowStepLogs.map((l) => l.nodeId);
    expect(nodeIds).toEqual(['trigger', 'cond', 'yes']);
  });

  it('defaults to TRUE when conditions object lacks the expression key', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(53, conditionGraph('deal.stale'));
    await runWorkflow(
      53,
      { clientId: 1, conditions: { 'unrelated.key': false } },
      { maxWaitMs: 0 },
    );
    const nodeIds = state.workflowStepLogs.map((l) => l.nodeId);
    expect(nodeIds).toEqual(['trigger', 'cond', 'yes']);
  });

  it('also follows unlabeled edges from a condition node', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(54, {
      nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'manual' } },
        {
          id: 'cond',
          type: 'condition',
          position: { x: 0, y: 100 },
          data: { kind: 'condition', expression: 'x' },
        },
        {
          id: 'always',
          type: 'action',
          position: { x: 0, y: 200 },
          data: { kind: 'wait', ms: 0 },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'always' }, // no label → always followed
      ],
    });
    await runWorkflow(54, { clientId: 1, conditions: { x: false } }, { maxWaitMs: 0 });
    const nodeIds = state.workflowStepLogs.map((l) => l.nodeId);
    expect(nodeIds).toEqual(['trigger', 'cond', 'always']);
  });
});

describe('executeAction — send_email and add_to_list (Phase 1 wired)', () => {
  it('send_email returns status=failed when template is not found', async () => {
    // The branches mock returns [] for all tables except workflows, so the
    // template lookup fails and send_email returns an error result before
    // ever reaching Resend (no Resend mock needed here).
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(
      60,
      singleActionGraph({ kind: 'send_email', templateId: 5, to: 'a@b.test' }),
    );
    await runWorkflow(60, { clientId: 1 }, { maxWaitMs: 0 });
    expect(actionLog().status).toBe('failed');
    expect(actionLog().output).toMatchObject({
      reason: 'template 5 not found',
    });
  });

  it('add_to_list returns status=skipped when no contactEmail in context', async () => {
    // Context has clientId but no contactEmail → early-return skipped path.
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(61, singleActionGraph({ kind: 'add_to_list', listId: 99 }));
    await runWorkflow(61, { clientId: 1 }, { maxWaitMs: 0 });
    expect(actionLog().status).toBe('skipped');
    expect(actionLog().output).toMatchObject({
      reason: 'no contactEmail in context',
      listId: 99,
    });
  });
});

describe('executeAction — create_task short-circuits when context is incomplete', () => {
  it('skips with "no clientId" when context.clientId is missing', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(70, singleActionGraph({ kind: 'create_task', title: 'Follow up' }));
    // Context has no clientId → the create_task path returns skipped early.
    await runWorkflow(70, { foo: 'bar' }, { maxWaitMs: 0 });
    expect(actionLog().status).toBe('skipped');
    expect(actionLog().output).toMatchObject({
      reason: 'no clientId in context',
      title: 'Follow up',
    });
  });

  it('skips with "no kanban project" when the mock returns no project', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    // The default mock returns [] for the projects table → project lookup fails.
    seedWorkflow(71, singleActionGraph({ kind: 'create_task', title: 'Ship it' }));
    await runWorkflow(71, { clientId: 1 }, { maxWaitMs: 0 });
    expect(actionLog().status).toBe('skipped');
    expect(actionLog().output).toMatchObject({
      reason: 'no kanban project for client',
      title: 'Ship it',
    });
  });
});

describe('runWorkflow — failed run row update', () => {
  it('marks the run failed when there is no trigger node and records the error message', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    seedWorkflow(80, {
      nodes: [
        { id: 'orphan', type: 'action', position: { x: 0, y: 0 }, data: { kind: 'wait', ms: 0 } },
      ],
      edges: [],
    });
    const result = await runWorkflow(80, { clientId: 1 }, { maxWaitMs: 0 });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/no trigger/i);
    expect(state.workflowRuns[0].status).toBe('failed');
    expect(state.workflowRuns[0].error).toMatch(/no trigger/i);
  });
});

describe('executeStep — input cloning', () => {
  it('round-trips node.data through JSON so mutations do not leak', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');
    const action = { kind: 'wait', ms: 0, marker: { nested: true } };
    seedWorkflow(90, singleActionGraph(action));
    await runWorkflow(90, { clientId: 1 }, { maxWaitMs: 0 });
    // The logged input has the same shape but is a structural copy.
    const log = actionLog();
    expect(log.input).toEqual(action);
    expect(log.input).not.toBe(action);
  });
});
