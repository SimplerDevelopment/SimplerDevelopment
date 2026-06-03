// @vitest-environment node
/**
 * Unit tests for `runWorkflow` in lib/workflows/runtime.ts. The executor
 * touches the DB via a drizzle fluent chain — we replace the chain with
 * an in-memory store keyed on a marker we attach to `from(table)` so the
 * mock can route lookups, inserts, and updates to the right "table".
 *
 * The test exercises a synthetic 3-node graph: trigger → wait(0ms) →
 * webhook. We assert the run row, step logs, and webhook fetch were
 * driven correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store the mock writes to so tests can read it back.
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

// Schema markers — the mocked `from()` reads `__table` to know which table.
const TABLES = {
  workflows: { __table: 'workflows' },
  workflowRuns: { __table: 'workflowRuns' },
  workflowStepLogs: { __table: 'workflowStepLogs' },
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
        // No projects/columns/etc. in fixture — return empty so create_task is skipped.
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

describe('runWorkflow — synthetic 3-node graph', () => {
  it('walks trigger → wait → webhook and logs each step', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');

    state.workflows.push({
      id: 100,
      clientId: 1,
      trigger: { kind: 'contact.created' },
      graph: {
        nodes: [
          { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'contact.created' } },
          { id: 'wait', type: 'action', position: { x: 0, y: 100 }, data: { kind: 'wait', ms: 0 } },
          {
            id: 'hook',
            type: 'action',
            position: { x: 0, y: 200 },
            data: { kind: 'webhook', url: 'https://example.test/hook', payload: { ok: true } },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'wait' },
          { id: 'e2', source: 'wait', target: 'hook' },
        ],
      },
    });

    const result = await runWorkflow(100, { clientId: 1 }, { triggeredBy: 'unit-test', maxWaitMs: 0 });

    expect(result.status).toBe('completed');
    expect(state.workflowRuns).toHaveLength(1);
    expect(state.workflowRuns[0].status).toBe('completed');

    // 3 step logs (trigger marker + wait + webhook).
    expect(state.workflowStepLogs).toHaveLength(3);
    const actions = state.workflowStepLogs.map((l) => l.action);
    expect(actions).toEqual(['trigger', 'wait', 'webhook']);

    // Webhook fired.
    expect(state.fetchCalls).toHaveLength(1);
    expect(state.fetchCalls[0].url).toBe('https://example.test/hook');
  });

  it('marks the run failed when there is no trigger node', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');

    state.workflows.push({
      id: 200,
      clientId: 1,
      trigger: { kind: 'contact.created' },
      graph: {
        nodes: [{ id: 'orphan', type: 'action', position: { x: 0, y: 0 }, data: { kind: 'wait', ms: 0 } }],
        edges: [],
      },
    });

    const result = await runWorkflow(200, { clientId: 1 }, { maxWaitMs: 0 });

    expect(result.status).toBe('failed');
    expect(state.workflowRuns[0].status).toBe('failed');
    expect(state.workflowRuns[0].error).toMatch(/no trigger/i);
  });
});
