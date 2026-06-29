// @vitest-environment node
/**
 * Unit tests for the process-workflow-runs cron drainer.
 *
 * Strategy: mock `executeAction` and `nextNodes` from the runtime (the action
 * dispatch layer) and back the db with an in-memory state store that simulates
 * CAS-claim semantics, update/returning, and filter evaluation.  Tests assert
 * state transitions on `workflowRunSteps` and `workflowRuns`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockExecuteAction = vi.hoisted(() => vi.fn());
const mockNextNodes = vi.hoisted(() => vi.fn());

vi.mock('@/lib/workflows/runtime', () => ({
  executeAction: mockExecuteAction,
  nextNodes: mockNextNodes,
}));

// withCronHealth is a pass-through wrapper in tests.
vi.mock('@/lib/cron-health', () => ({
  withCronHealth: (
    _opts: unknown,
    fn: (req: Request) => Promise<Response>,
  ) => fn,
}));

// Always authorise cron requests.
vi.mock('@/lib/cron-auth', () => ({
  isAuthorizedCron: vi.fn().mockReturnValue(true),
}));

// ── In-memory state ───────────────────────────────────────────────────────────

type StepRow = {
  id: number;
  runId: number;
  clientId: number;
  nodeId: string;
  action: string;
  status: string;
  attemptCount: number;
  nextRetryAt: Date | null;
  input: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  idempotencyKey: string | null;
  updatedAt: Date;
  createdAt: Date;
};

type RunRow = {
  id: number;
  workflowId: number;
  clientId: number;
  status: string;
  context: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
};

type WorkflowRow = {
  id: number;
  clientId: number;
  graph: Record<string, unknown>;
};

type LogRow = {
  id: number;
  runId: number;
  nodeId: string;
  action: string;
  status: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  occurredAt: Date;
};

const state = {
  workflowRunSteps: [] as StepRow[],
  workflowRuns: [] as RunRow[],
  workflows: [] as WorkflowRow[],
  workflowStepLogs: [] as LogRow[],
};

// ── Schema table markers (column refs carry __column for filter resolution) ───

function col(name: string) {
  return { __column: name };
}

const TABLES = {
  workflowRunSteps: {
    __table: 'workflowRunSteps',
    id: col('id'),
    runId: col('runId'),
    clientId: col('clientId'),
    nodeId: col('nodeId'),
    action: col('action'),
    status: col('status'),
    attemptCount: col('attemptCount'),
    nextRetryAt: col('nextRetryAt'),
    idempotencyKey: col('idempotencyKey'),
    input: col('input'),
    result: col('result'),
    error: col('error'),
    updatedAt: col('updatedAt'),
    createdAt: col('createdAt'),
  },
  workflowRuns: {
    __table: 'workflowRuns',
    id: col('id'),
    workflowId: col('workflowId'),
    clientId: col('clientId'),
    status: col('status'),
    context: col('context'),
    startedAt: col('startedAt'),
    completedAt: col('completedAt'),
    error: col('error'),
  },
  workflows: {
    __table: 'workflows',
    id: col('id'),
    clientId: col('clientId'),
    graph: col('graph'),
  },
  workflowStepLogs: {
    __table: 'workflowStepLogs',
    id: col('id'),
    runId: col('runId'),
    nodeId: col('nodeId'),
    action: col('action'),
    status: col('status'),
    input: col('input'),
    output: col('output'),
    durationMs: col('durationMs'),
    occurredAt: col('occurredAt'),
  },
};

vi.mock('@/lib/db/schema', () => TABLES);

// ── Drizzle-orm mock (operators return tagged expr objects) ───────────────────

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  lt: (a: unknown, b: unknown) => ({ op: 'lt', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ── Filter evaluator for the in-memory mock ───────────────────────────────────

function colName(ref: unknown): string | null {
  if (!ref || typeof ref !== 'object') return null;
  return (ref as { __column?: string }).__column ?? null;
}

function evalFilter(row: Record<string, unknown>, filter: unknown): boolean {
  if (!filter || typeof filter !== 'object') return true;
  const f = filter as {
    op: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    list?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const name = colName(f.a);
      return name != null && row[name] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((a) => evalFilter(row, a));
    case 'or':
      return (f.args ?? []).some((a) => evalFilter(row, a));
    case 'isNull': {
      const name = colName(f.a);
      return name != null && row[name] == null;
    }
    case 'lte': {
      const name = colName(f.a);
      if (!name) return false;
      const v = row[name];
      if (v instanceof Date && f.b instanceof Date) return v <= f.b;
      return false;
    }
    case 'lt': {
      const name = colName(f.a);
      if (!name) return false;
      const v = row[name];
      if (v instanceof Date && f.b instanceof Date) return v < f.b;
      return false;
    }
    case 'inArray': {
      const name = colName(f.a);
      if (!name) return false;
      return (f.list as unknown[]).includes(row[name]);
    }
    default:
      return true;
  }
}

// ── In-memory db mock ─────────────────────────────────────────────────────────

function getStore(tableName: string): Record<string, unknown>[] {
  switch (tableName) {
    case 'workflowRunSteps':
      return state.workflowRunSteps as unknown as Record<string, unknown>[];
    case 'workflowRuns':
      return state.workflowRuns as unknown as Record<string, unknown>[];
    case 'workflows':
      return state.workflows as unknown as Record<string, unknown>[];
    case 'workflowStepLogs':
      return state.workflowStepLogs as unknown as Record<string, unknown>[];
    default:
      return [];
  }
}

vi.mock('@/lib/db', () => {
  function buildSelectChain(tableName: string) {
    let pendingFilter: unknown = null;
    const chain = {
      from: (_table: unknown) => chain,
      where: (f: unknown) => {
        pendingFilter = f;
        return chain;
      },
      orderBy: () => chain,
      limit: (_n?: number) => {
        const store = getStore(tableName);
        return Promise.resolve(store.filter((row) => evalFilter(row, pendingFilter)));
      },
    };
    return chain;
  }

  function applyUpdate(
    tableName: string,
    patch: Record<string, unknown>,
    filter: unknown,
  ): Record<string, unknown>[] {
    const store = getStore(tableName);
    const updated: Record<string, unknown>[] = [];
    for (const row of store) {
      if (evalFilter(row, filter)) {
        Object.assign(row, patch);
        updated.push(row);
      }
    }
    return updated;
  }

  function buildUpdateChain(tableName: string) {
    let pendingPatch: Record<string, unknown> = {};
    return {
      set: (patch: Record<string, unknown>) => {
        pendingPatch = patch;
        return {
          where: (filter: unknown) => {
            const updated = applyUpdate(tableName, pendingPatch, filter);
            // Return a thenable that also exposes .returning()
            const out = {
              then(
                onFulfilled?: ((v: undefined) => unknown) | null,
                onRejected?: ((e: unknown) => unknown) | null,
              ) {
                return Promise.resolve(undefined).then(
                  onFulfilled as (v: undefined) => unknown,
                  onRejected as (e: unknown) => unknown,
                );
              },
              catch(onRejected?: ((e: unknown) => unknown) | null) {
                return Promise.resolve(undefined).catch(onRejected);
              },
              finally(onFinally?: (() => void) | null) {
                return Promise.resolve(undefined).finally(onFinally ?? undefined);
              },
              returning: (_fields?: unknown) =>
                Promise.resolve(updated.map((r) => ({ id: r.id as number }))),
            };
            return out;
          },
        };
      },
    };
  }

  let nextId = 1;

  function buildInsertChain(tableName: string) {
    return {
      values: (vals: Record<string, unknown>) => {
        const row = { ...vals, id: nextId++ };
        getStore(tableName).push(row);
        return Promise.resolve(undefined);
      },
    };
  }

  return {
    db: {
      select: (_fields?: unknown) => ({
        from: (table: { __table: string }) => buildSelectChain(table.__table),
      }),
      update: (table: { __table: string }) => buildUpdateChain(table.__table),
      insert: (table: { __table: string }) => buildInsertChain(table.__table),
    },
  };
});

// ── Test helpers ──────────────────────────────────────────────────────────────

let idCounter = 1;
function makeStep(overrides: Partial<StepRow> = {}): StepRow {
  return {
    id: idCounter++,
    runId: 10,
    clientId: 1,
    nodeId: 'act',
    action: 'webhook',
    status: 'pending',
    attemptCount: 0,
    nextRetryAt: null,
    input: { kind: 'webhook', url: 'https://x.test/hook', payload: {} },
    result: null,
    error: null,
    idempotencyKey: 'wf:10:act',
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: 10,
    workflowId: 5,
    clientId: 1,
    status: 'pending',
    context: { clientId: 1 },
    startedAt: new Date(),
    completedAt: null,
    error: null,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowRow> = {}): WorkflowRow {
  return {
    id: 5,
    clientId: 1,
    graph: { nodes: [], edges: [] },
    ...overrides,
  };
}

async function callHandler(): Promise<{ body: Record<string, unknown>; status: number }> {
  const { GET } = await import('@/app/api/cron/process-workflow-runs/route');
  const req = new Request('http://localhost/api/cron/process-workflow-runs', {
    headers: { 'x-vercel-cron': '1' },
  });
  const res = await GET(req);
  return { body: (await res.json()) as Record<string, unknown>, status: res.status };
}

beforeEach(() => {
  state.workflowRunSteps.length = 0;
  state.workflowRuns.length = 0;
  state.workflows.length = 0;
  state.workflowStepLogs.length = 0;
  idCounter = 1;
  mockExecuteAction.mockReset();
  mockNextNodes.mockReturnValue([]); // default: no downstream nodes
  vi.resetModules(); // isolate the route import between tests
});

// ── Tests: claim → execute → downstream enqueue ───────────────────────────────

describe('process-workflow-runs — happy path', () => {
  it('claims a pending step, executes it, marks completed and completes the run', async () => {
    const step = makeStep({ id: 1, runId: 10 });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10, status: 'pending' }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    mockExecuteAction.mockResolvedValue({
      status: 'success',
      output: { ok: true },
      durationMs: 5,
    });

    const { body } = await callHandler();

    expect(body.success).toBe(true);
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(0);

    // Step should be marked completed
    expect(state.workflowRunSteps[0].status).toBe('completed');
    // Run should be completed (no remaining active steps)
    expect(state.workflowRuns[0].status).toBe('completed');
    expect(state.workflowRuns[0].completedAt).toBeInstanceOf(Date);
  });

  it('inserts downstream steps from nextNodes after success', async () => {
    const step = makeStep({ id: 1, runId: 10, nodeId: 'act1' });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10 }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    mockExecuteAction.mockResolvedValue({
      status: 'success',
      output: { ok: true },
      durationMs: 3,
    });
    // Return one downstream node
    mockNextNodes.mockReturnValue([
      {
        node: {
          id: 'act2',
          type: 'action',
          data: { kind: 'webhook', url: 'https://next.test', payload: {} },
          position: { x: 0, y: 100 },
        },
      },
    ]);

    await callHandler();

    // One new step should have been inserted for act2
    const downstreamStep = state.workflowRunSteps.find((s) => s.nodeId === 'act2');
    expect(downstreamStep).toBeDefined();
    expect(downstreamStep?.status).toBe('pending');
    expect(downstreamStep?.runId).toBe(10);
  });

  it('skipped result is treated as success (step marked completed)', async () => {
    state.workflowRunSteps.push(makeStep({ id: 1, action: 'send_email' }));
    state.workflowRuns.push(makeRun({ id: 10 }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    // Idempotency skip — not an error, step should complete.
    mockExecuteAction.mockResolvedValue({
      status: 'skipped',
      output: { idempotency: 'already_sent', priorLogId: 99 },
      durationMs: 1,
    });

    const { body } = await callHandler();

    expect(body.processed).toBe(1);
    expect(state.workflowRunSteps[0].status).toBe('completed');
  });
});

// ── Tests: failure → backoff ──────────────────────────────────────────────────

describe('process-workflow-runs — failure and retry', () => {
  it('first failure: increments attemptCount and sets nextRetryAt to +1 min', async () => {
    const step = makeStep({ id: 1, attemptCount: 0 });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10 }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    mockExecuteAction.mockResolvedValue({
      status: 'failed',
      output: { error: 'network timeout' },
      durationMs: 2,
    });

    const before = Date.now();
    const { body } = await callHandler();
    const after = Date.now();

    expect(body.failed).toBe(1);
    expect(body.deadLettered).toBe(0);

    const updated = state.workflowRunSteps[0];
    expect(updated.status).toBe('failed');
    expect(updated.attemptCount).toBe(1);
    expect(updated.error).toBe('network timeout');
    expect(updated.nextRetryAt).toBeInstanceOf(Date);
    // nextRetryAt should be ~1 minute from now
    const retryMs = updated.nextRetryAt!.getTime() - before;
    expect(retryMs).toBeGreaterThanOrEqual(59_000);
    expect(retryMs).toBeLessThanOrEqual(61_000 + (after - before));
  });

  it('second failure: sets nextRetryAt to +5 min', async () => {
    const step = makeStep({ id: 1, status: 'failed', attemptCount: 1, nextRetryAt: new Date(Date.now() - 1000) });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10, status: 'running' }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    mockExecuteAction.mockResolvedValue({
      status: 'failed',
      output: { error: 'still failing' },
      durationMs: 2,
    });

    // Re-set to pending so the main pass picks it up (simulates retry scenario)
    state.workflowRunSteps[0].status = 'pending';

    const before = Date.now();
    const { body } = await callHandler();
    const after = Date.now();

    expect(body.failed).toBe(1);
    expect(body.deadLettered).toBe(0);

    const updated = state.workflowRunSteps[0];
    expect(updated.status).toBe('failed');
    expect(updated.attemptCount).toBe(2);
    // nextRetryAt should be ~5 minutes from now
    const retryMs = updated.nextRetryAt!.getTime() - before;
    expect(retryMs).toBeGreaterThanOrEqual(299_000);
    expect(retryMs).toBeLessThanOrEqual(301_000 + (after - before));
  });

  it('third failure: dead_letters the step and marks the run failed', async () => {
    // Step already has 2 prior attempts; this is the 3rd (final) attempt.
    const step = makeStep({ id: 1, attemptCount: 2 });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10, status: 'running' }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    mockExecuteAction.mockResolvedValue({
      status: 'failed',
      output: { error: 'fatal error' },
      durationMs: 1,
    });

    const { body } = await callHandler();

    expect(body.failed).toBe(1);
    expect(body.deadLettered).toBe(1);

    const updatedStep = state.workflowRunSteps[0];
    expect(updatedStep.status).toBe('dead_letter');
    expect(updatedStep.attemptCount).toBe(3);
    expect(updatedStep.error).toBe('fatal error');

    const updatedRun = state.workflowRuns[0];
    expect(updatedRun.status).toBe('failed');
    expect(updatedRun.completedAt).toBeInstanceOf(Date);
  });
});

// ── Tests: stuck-run recovery ─────────────────────────────────────────────────

describe('process-workflow-runs — stuck-run recovery', () => {
  it('resets a stuck running step, then processes it in the same tick', async () => {
    // Step has been in 'running' status for 15 minutes (orphaned).
    // The stuck pass resets it to 'pending' (incrementing attemptCount),
    // then the main claim pass picks it up and executes it in the same tick.
    const stuckUpdatedAt = new Date(Date.now() - 15 * 60 * 1000);
    const step = makeStep({
      id: 1,
      status: 'running',
      attemptCount: 0,
      updatedAt: stuckUpdatedAt,
    });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10, status: 'running' }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    // Set up executeAction to succeed so the main pass can complete.
    mockExecuteAction.mockResolvedValue({
      status: 'success',
      output: { ok: true },
      durationMs: 2,
    });

    const { body } = await callHandler();

    // Stuck pass should have reported 1 reset.
    expect(body.stuckReset).toBe(1);
    // Main pass also processes the now-pending step.
    expect(body.processed).toBe(1);
    // Step ends up completed; the stuckReset count confirms it went through
    // the recovery path (attemptCount was incremented before execution).
    expect(state.workflowRunSteps[0].status).toBe('completed');
  });

  it('dead-letters a stuck step that has exhausted retries (attemptCount 2 → 3)', async () => {
    const stuckUpdatedAt = new Date(Date.now() - 15 * 60 * 1000);
    const step = makeStep({
      id: 1,
      status: 'running',
      attemptCount: 2,
      updatedAt: stuckUpdatedAt,
    });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10, status: 'running' }));

    const { body } = await callHandler();

    expect(body.stuckReset).toBe(1);

    const updated = state.workflowRunSteps[0];
    expect(updated.status).toBe('dead_letter');
    expect(updated.attemptCount).toBe(3);
    expect(state.workflowRuns[0].status).toBe('failed');
  });

  it('does NOT reset a recently running step (updated 5 min ago)', async () => {
    const recentUpdatedAt = new Date(Date.now() - 5 * 60 * 1000);
    const step = makeStep({
      id: 1,
      status: 'running',
      attemptCount: 0,
      updatedAt: recentUpdatedAt,
    });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10 }));

    const { body } = await callHandler();

    expect(body.stuckReset).toBe(0);
    expect(state.workflowRunSteps[0].status).toBe('running');
  });
});

// ── Tests: send_email idempotency ─────────────────────────────────────────────

describe('process-workflow-runs — send_email idempotency', () => {
  it('a retry after prior success returns skipped (not an error) and completes the step', async () => {
    // The executeAction mock simulates the idempotency guard inside runtime.ts:
    // it finds a prior success log and returns 'skipped' rather than re-sending.
    const step = makeStep({
      id: 1,
      action: 'send_email',
      input: { kind: 'send_email', templateId: 7, to: 'contact' },
    });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10, status: 'running' }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    mockExecuteAction.mockResolvedValue({
      status: 'skipped',
      output: { idempotency: 'already_sent', priorLogId: 42 },
      durationMs: 0,
    });

    const { body } = await callHandler();

    // 'skipped' is NOT a failure — step should be completed.
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(0);
    expect(state.workflowRunSteps[0].status).toBe('completed');
    // Run should also complete (no remaining active steps).
    expect(state.workflowRuns[0].status).toBe('completed');
  });
});

// ── Tests: condition branch routing ──────────────────────────────────────────

describe('process-workflow-runs — condition branches', () => {
  it('only enqueues the true-branch downstream node when branch=true', async () => {
    const step = makeStep({
      id: 1,
      nodeId: 'cond',
      action: 'condition',
      input: { kind: 'condition', expression: 'deal.amount > 1000' },
    });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10 }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    mockExecuteAction.mockResolvedValue({
      status: 'success',
      output: { expression: 'deal.amount > 1000', value: true },
      durationMs: 0,
      branch: 'true',
    });

    const trueNode = {
      node: { id: 'true-action', type: 'action', data: { kind: 'webhook', url: 'https://t.test', payload: {} }, position: { x: 0, y: 200 } },
      label: 'true' as const,
    };
    const falseNode = {
      node: { id: 'false-action', type: 'action', data: { kind: 'webhook', url: 'https://f.test', payload: {} }, position: { x: 100, y: 200 } },
      label: 'false' as const,
    };
    mockNextNodes.mockReturnValue([trueNode, falseNode]);

    await callHandler();

    // Only the 'true' branch should be inserted
    const inserted = state.workflowRunSteps.filter((s) => s.id !== step.id);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].nodeId).toBe('true-action');
  });
});

// ── Tests: wait action handling ────────────────────────────────────────────────

describe('process-workflow-runs — wait step handling', () => {
  it('marks a wait step completed immediately (timer elapsed) and enqueues downstream', async () => {
    // A wait step whose nextRetryAt is in the past (delay already elapsed).
    const pastRetry = new Date(Date.now() - 1000);
    const step = makeStep({
      id: 1,
      action: 'wait',
      input: { kind: 'wait', ms: 5000 },
      nextRetryAt: pastRetry,
    });
    state.workflowRunSteps.push(step);
    state.workflowRuns.push(makeRun({ id: 10 }));
    state.workflows.push(makeWorkflow({ id: 5 }));

    // nextNodes returns one downstream action
    mockNextNodes.mockReturnValue([
      {
        node: {
          id: 'post-wait',
          type: 'action',
          data: { kind: 'webhook', url: 'https://x.test', payload: {} },
          position: { x: 0, y: 100 },
        },
      },
    ]);

    const { body } = await callHandler();

    expect(body.processed).toBe(1);
    // Wait step should be completed (no executeAction call needed)
    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(state.workflowRunSteps[0].status).toBe('completed');
    // Downstream step should be enqueued
    const downstream = state.workflowRunSteps.find((s) => s.nodeId === 'post-wait');
    expect(downstream).toBeDefined();
    expect(downstream?.status).toBe('pending');
  });
});
