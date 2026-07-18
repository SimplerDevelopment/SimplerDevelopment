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

// ─── Hoisted mocks for Resend (must be defined before vi.mock hoisting) ────────
const mockResendSend = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { id: 'resend-test-id' }, error: null }),
);

vi.mock('@/lib/email/resolve-resend', () => ({
  resolveResendKey: vi.fn().mockResolvedValue({ key: 'test-resend-key', source: 'platform' }),
  _clearResendKeyCache: vi.fn(),
}));

vi.mock('resend', () => ({
  // Must use a regular function (not arrow) so `new Resend()` works as a constructor.
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: mockResendSend } };
  }),
}));

// In-memory store the mock writes to so tests can read it back.
interface MockState {
  workflows: Array<{ id: number; clientId: number; trigger: unknown; graph: unknown }>;
  workflowRuns: Array<Record<string, unknown>>;
  workflowStepLogs: Array<Record<string, unknown>>;
  emailTemplates: Array<Record<string, unknown>>;
  emailSubscriberInserts: Array<Record<string, unknown>>;
  fetchCalls: Array<{ url: string; body: unknown }>;
}

const state: MockState = {
  workflows: [],
  workflowRuns: [],
  workflowStepLogs: [],
  emailTemplates: [],
  emailSubscriberInserts: [],
  fetchCalls: [],
};

// Schema markers — the mocked `from()` reads `__table` to know which table.
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

// Extract all (field, value) pairs from a nested eq/and filter structure.
// Used to filter mock state arrays without knowing column identity.
function extractEqPairs(filter: unknown): Array<{ value: unknown }> {
  if (!filter || typeof filter !== 'object') return [];
  const f = filter as { op: string; a?: unknown; b?: unknown; args?: unknown[] };
  if (f.op === 'eq') return [{ value: f.b }];
  if (f.op === 'and' && Array.isArray(f.args)) {
    return f.args.flatMap(extractEqPairs);
  }
  return [];
}

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
        if (table.__table === 'workflowStepLogs') {
          // Idempotency check: find a prior success log by runId (number),
          // nodeId (non-status string), and status ('success').
          const pairs = extractEqPairs(pendingFilter);
          const matchRunId = pairs.find((p) => typeof p.value === 'number')?.value as number | undefined;
          const matchStatus = pairs.find((p) => p.value === 'success' || p.value === 'failed' || p.value === 'skipped')
            ?.value as string | undefined;
          const matchNodeId = pairs.find(
            (p) =>
              typeof p.value === 'string' &&
              p.value !== 'success' &&
              p.value !== 'failed' &&
              p.value !== 'skipped',
          )?.value as string | undefined;
          const found = state.workflowStepLogs.find((log) => {
            const l = log as Record<string, unknown>;
            if (matchRunId !== undefined && l.runId !== matchRunId) return false;
            if (matchStatus !== undefined && l.status !== matchStatus) return false;
            if (matchNodeId !== undefined && l.nodeId !== matchNodeId) return false;
            return true;
          });
          return Promise.resolve(found ? [found] : []);
        }
        if (table.__table === 'emailTemplates') {
          const id = extractEqValue(pendingFilter);
          const found = id != null ? state.emailTemplates.find((t) => (t as { id: number }).id === id) : null;
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
        else if (table.__table === 'emailSubscribers') state.emailSubscriberInserts.push(augmented);
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
  state.emailTemplates.length = 0;
  state.emailSubscriberInserts.length = 0;
  state.fetchCalls.length = 0;
  idCounter = 1;
  mockResendSend.mockClear();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    state.fetchCalls.push({ url: u, body: init?.body ?? null });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
});

// Helper: seed a minimal workflow into state
function seedWorkflow(id: number, graph: unknown) {
  state.workflows.push({
    id,
    clientId: 1,
    trigger: { kind: 'contact.created' },
    graph,
  });
}

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

// ─── send_email action ────────────────────────────────────────────────────────

describe('runWorkflow — send_email action', () => {
  const SEND_EMAIL_GRAPH = {
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'contact.created' } },
      {
        id: 'send-email',
        type: 'action',
        position: { x: 0, y: 100 },
        data: { kind: 'send_email', templateId: 42, to: 'contact' },
      },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'send-email' }],
  };

  it('sends email via Resend when template exists and contactEmail is in context', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');

    seedWorkflow(300, SEND_EMAIL_GRAPH);
    state.emailTemplates.push({
      id: 42,
      clientId: 1,
      subject: 'Welcome to the club',
      htmlContent: '<p>Hello there!</p>',
    });

    const result = await runWorkflow(
      300,
      { clientId: 1, contactEmail: 'alice@example.com' },
      { maxWaitMs: 0 },
    );

    expect(result.status).toBe('completed');
    // Resend was called once with the right recipient and subject
    expect(mockResendSend).toHaveBeenCalledOnce();
    const sendArgs = mockResendSend.mock.calls[0][0] as Record<string, unknown>;
    expect(sendArgs.to).toBe('alice@example.com');
    expect(sendArgs.subject).toBe('Welcome to the club');

    // The step log for send_email should record success
    const emailLog = state.workflowStepLogs.find((l) => l.action === 'send_email');
    expect(emailLog).toBeDefined();
    expect(emailLog?.status).toBe('success');
    expect((emailLog?.output as Record<string, unknown>)?.resendId).toBe('resend-test-id');
  });

  it('skips the send (idempotency) when a prior success log exists for the same run+node', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');

    seedWorkflow(301, SEND_EMAIL_GRAPH);
    state.emailTemplates.push({
      id: 42,
      clientId: 1,
      subject: 'Welcome',
      htmlContent: '<p>Hi</p>',
    });

    // runId will be 1 (first insert into workflowRuns gets id=1 from nextId()).
    // Pre-populate a prior success log for that run + node.
    state.workflowStepLogs.push({
      id: 999,
      runId: 1,
      nodeId: 'send-email',
      action: 'send_email',
      status: 'success',
      output: { resendId: 'prior-resend-id' },
    });

    const result = await runWorkflow(
      301,
      { clientId: 1, contactEmail: 'bob@example.com' },
      { maxWaitMs: 0 },
    );

    expect(result.status).toBe('completed');
    // Resend must NOT have been called — idempotency guard kicked in
    expect(mockResendSend).not.toHaveBeenCalled();

    // The step log written by executeStep should show 'skipped'.
    // Exclude the pre-populated entry (id=999); executeStep-written entries
    // receive ids from nextId() which starts at 1, so they are always < 999.
    const emailLog = state.workflowStepLogs.find(
      (l) => l.action === 'send_email' && (l as Record<string, unknown>).id !== 999,
    );
    expect(emailLog).toBeDefined();
    expect(emailLog?.status).toBe('skipped');
  });

  it('returns failed when the template is not found', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');

    seedWorkflow(302, SEND_EMAIL_GRAPH);
    // No email template in state — template lookup returns empty

    const result = await runWorkflow(
      302,
      { clientId: 1, contactEmail: 'carol@example.com' },
      { maxWaitMs: 0 },
    );

    // The run itself completes (workflow doesn't throw on failed steps)
    // but the send_email step log should show failed
    const emailLog = state.workflowStepLogs.find((l) => l.action === 'send_email');
    expect(emailLog).toBeDefined();
    expect(emailLog?.status).toBe('failed');
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});

// ─── add_to_list action ───────────────────────────────────────────────────────

describe('runWorkflow — add_to_list action', () => {
  const ADD_TO_LIST_GRAPH = {
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'contact.created' } },
      {
        id: 'add-list',
        type: 'action',
        position: { x: 0, y: 100 },
        data: { kind: 'add_to_list', listId: 7 },
      },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'add-list' }],
  };

  it('inserts the subscriber with onConflictDoNothing when contactEmail is in context', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');

    seedWorkflow(400, ADD_TO_LIST_GRAPH);

    const result = await runWorkflow(
      400,
      { clientId: 1, contactEmail: 'dave@example.com' },
      { maxWaitMs: 0 },
    );

    expect(result.status).toBe('completed');

    // One subscriber insert was attempted
    expect(state.emailSubscriberInserts).toHaveLength(1);
    const insert = state.emailSubscriberInserts[0] as Record<string, unknown>;
    expect(insert.listId).toBe(7);
    expect(insert.email).toBe('dave@example.com');
    // A random unsubscribe token should have been generated (non-empty string)
    expect(typeof insert.unsubscribeToken).toBe('string');
    expect((insert.unsubscribeToken as string).length).toBeGreaterThan(0);

    // Step log shows success
    const listLog = state.workflowStepLogs.find((l) => l.action === 'add_to_list');
    expect(listLog).toBeDefined();
    expect(listLog?.status).toBe('success');
    expect((listLog?.output as Record<string, unknown>)?.listId).toBe(7);
  });

  it('skips when contactEmail is absent from context', async () => {
    const { runWorkflow } = await import('@/lib/workflows/runtime');

    seedWorkflow(401, ADD_TO_LIST_GRAPH);

    // No contactEmail in context
    const result = await runWorkflow(401, { clientId: 1 }, { maxWaitMs: 0 });

    expect(result.status).toBe('completed');
    expect(state.emailSubscriberInserts).toHaveLength(0);

    const listLog = state.workflowStepLogs.find((l) => l.action === 'add_to_list');
    expect(listLog?.status).toBe('skipped');
  });
});
