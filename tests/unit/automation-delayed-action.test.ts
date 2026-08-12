// @vitest-environment node
/**
 * Unit tests for durable delayed automation actions (PUX-047).
 *
 * Two halves tested:
 *
 *   1. executeAction's defer branch (driven via runRule) — an action with
 *      delay > 0 must ENQUEUE an automation.delayed_action internal job with
 *      runAt = now + delay and must NOT execute the tool inline. The old
 *      behavior (blocking in-process sleep) silently dropped multi-hour
 *      delays at the platform function timeout.
 *
 *   2. runDelayedAutomationAction — the fire-time handler must re-read the
 *      rule (enabled flag + CURRENT scopes; never replayed from the enqueue
 *      snapshot), execute the snapshotted action, and leave its own
 *      automation_logs row.
 *
 * DB is replaced with a recording fake and executePortalTool / logAgentAction
 * are module-mocked — same pattern as automation-scope-gate.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ────────────────────────────────────────────────────────────────

interface InsertCall {
  table: string;
  values: Record<string, unknown>;
}

const state: {
  inserts: InsertCall[];
  selectQueues: Record<string, unknown[][]>;
} = { inserts: [], selectQueues: {} };

function makeSelectChain(tableName: string) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(state.selectQueues[tableName]?.shift() ?? []),
        then: (resolve: (v: unknown[]) => unknown) =>
          Promise.resolve(state.selectQueues[tableName]?.shift() ?? []).then(resolve),
      }),
      then: (resolve: (v: unknown[]) => unknown) =>
        Promise.resolve(state.selectQueues[tableName]?.shift() ?? []).then(resolve),
    }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => makeSelectChain('automationRules'),
    insert: (table: { _?: { name?: string } }) => ({
      values: (values: Record<string, unknown>) => {
        const tName = (table as unknown as { _?: { name?: string } })?._?.name ?? 'unknown';
        state.inserts.push({ table: tName, values });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  },
}));

// ─── Schema mock (table name sentinels) ────────────────────────────────────

vi.mock('@/lib/db/schema', () => ({
  automationRules: { _: { name: 'automation_rules' }, id: 'id', executionCount: 'executionCount' },
  automationLogs: { _: { name: 'automation_logs' } },
  brainPlaybooks: { _: { name: 'brain_playbooks' } },
  agentActionLog: { _: { name: 'agent_action_log' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
  sql: (s: unknown) => s,
}));

// ─── Queue mock (the subject of half these tests) ───────────────────────────

const mockEnqueueJob = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/jobs', () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

// ─── Portal-tool / audit / event-bus mocks ──────────────────────────────────

const mockExecutePortalTool = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@/lib/ai/portal-tools', () => ({
  executePortalTool: (...args: unknown[]) => mockExecutePortalTool(...args),
}));

const mockLogAgentAction = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/audit/agent-action-log', () => ({
  logAgentAction: (...args: unknown[]) => mockLogAgentAction(...args),
  hashParams: (input: unknown) => JSON.stringify(input).slice(0, 8),
}));

vi.mock('./event-bus', () => ({ onEvent: vi.fn() }));

const mockStartRun = vi.fn().mockResolvedValue({ runId: 1 });
vi.mock('@/lib/brain/playbook-runs', () => ({
  startRun: (...args: unknown[]) => mockStartRun(...args),
}));

// ─── Import subjects under test ─────────────────────────────────────────────

import { runRule } from '@/lib/automation/engine';
import { runDelayedAutomationAction } from '@/lib/automation/delayed-action-job';
import { db } from '@/lib/db';

type Db = Parameters<typeof runDelayedAutomationAction>[1];

function makeRule(overrides: Partial<{
  id: number;
  clientId: number;
  createdBy: number;
  scopes: string[];
  requiresApproval: boolean;
  enabled: boolean;
  actions: { tool: string; params: Record<string, unknown>; delay?: number }[];
}>): Parameters<typeof runRule>[0] {
  return {
    id: overrides.id ?? 1,
    clientId: overrides.clientId ?? 42,
    createdBy: overrides.createdBy ?? 7,
    scopes: overrides.scopes ?? [],
    requiresApproval: overrides.requiresApproval ?? false,
    enabled: overrides.enabled ?? true,
    name: 'test rule',
    trigger: { event: 'test.event' },
    conditions: [],
    actions: (overrides.actions ?? []) as Parameters<typeof runRule>[0]['actions'],
    schedule: null,
    nextRunAt: null,
    executionCount: 0,
    lastExecutedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Parameters<typeof runRule>[0];
}

beforeEach(() => {
  mockEnqueueJob.mockClear().mockResolvedValue(undefined);
  mockExecutePortalTool.mockClear();
  mockLogAgentAction.mockClear();
  state.inserts = [];
  state.selectQueues = {};
});

// ───────────────────────────────────────────────────────────────────────────
// 1. executeAction defer branch (via runRule)
// ───────────────────────────────────────────────────────────────────────────

describe('delayed action → durable enqueue (runRule path)', () => {
  it('enqueues automation.delayed_action with runAt ≈ now+delay and does NOT run the tool inline', async () => {
    const rule = makeRule({
      scopes: ['crm:write'],
      actions: [{ tool: 'create_crm_contact', params: { name: 'x' }, delay: 3600 }],
    });

    const before = Date.now();
    await runRule(rule, { _userId: 7 }, 'test.event');

    expect(mockExecutePortalTool).not.toHaveBeenCalled();
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);

    const params = mockEnqueueJob.mock.calls[0][0] as {
      clientId: number;
      type: string;
      runAt: Date;
      payload: { ruleId: number; clientId: number; userId: number; action: { tool: string; delay: number }; eventPayload: Record<string, unknown> };
    };
    expect(params.clientId).toBe(42);
    expect(params.type).toBe('automation.delayed_action');
    // runAt lands within a few seconds of now + 3600s.
    expect(Math.abs(params.runAt.getTime() - (before + 3_600_000))).toBeLessThan(5_000);
    expect(params.payload.ruleId).toBe(rule.id);
    // Delay stripped so the deferred run executes instead of re-deferring.
    expect(params.payload.action.delay).toBe(0);
    expect(params.payload.action.tool).toBe('create_crm_contact');

    // The rule's own log row records the action as deferred, not errored.
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    const actionsExecuted = logInsert!.values.actionsExecuted as Array<{ result: { deferred?: boolean }; error?: string }>;
    expect(actionsExecuted[0].result.deferred).toBe(true);
    expect(actionsExecuted[0].error).toBeUndefined();
    expect(logInsert!.values.status).toBe('success');
  });

  it('records an action error (not a throw) when the enqueue itself fails', async () => {
    mockEnqueueJob.mockRejectedValueOnce(new Error('insert exploded'));
    const rule = makeRule({
      scopes: ['crm:write'],
      actions: [{ tool: 'create_crm_contact', params: {}, delay: 60 }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    expect(mockExecutePortalTool).not.toHaveBeenCalled();
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    const actionsExecuted = logInsert!.values.actionsExecuted as Array<{ error?: string }>;
    expect(actionsExecuted[0].error).toMatch(/insert exploded/);
    expect(logInsert!.values.status).toBe('failed');
  });

  it('delay=0 still executes inline (no enqueue)', async () => {
    const rule = makeRule({
      scopes: ['crm:write'],
      actions: [{ tool: 'create_crm_contact', params: {}, delay: 0 }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(mockExecutePortalTool).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. runDelayedAutomationAction — fire-time handler
// ───────────────────────────────────────────────────────────────────────────

function handlerPayload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ruleId: 1,
    clientId: 42,
    userId: 7,
    action: { tool: 'create_crm_contact', params: { name: 'x' }, delay: 0 },
    eventPayload: { _userId: 7, _event: 'test.event' },
    ...overrides,
  };
}

describe('runDelayedAutomationAction (fire-time handler)', () => {
  it('executes the snapshotted action with the rule\'s CURRENT scopes and logs its own row', async () => {
    state.selectQueues['automationRules'] = [[makeRule({ scopes: ['crm:write'] })]];

    await runDelayedAutomationAction(handlerPayload(), db as unknown as Db);

    expect(mockExecutePortalTool).toHaveBeenCalledTimes(1);
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert!.values.triggerEvent).toBe('automation.delayed_action');
    expect(logInsert!.values.status).toBe('success');
    const actionsExecuted = logInsert!.values.actionsExecuted as Array<{ tool: string }>;
    expect(actionsExecuted[0].tool).toBe('create_crm_contact');
  });

  it('denies at fire time when the scope was revoked during the delay window', async () => {
    // Enqueued while the rule held crm:write; revoked before firing.
    state.selectQueues['automationRules'] = [[makeRule({ scopes: [] })]];

    await runDelayedAutomationAction(handlerPayload(), db as unknown as Db);

    expect(mockExecutePortalTool).not.toHaveBeenCalled();
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert!.values.status).toBe('failed');
    const actionsExecuted = logInsert!.values.actionsExecuted as Array<{ error?: string }>;
    expect(actionsExecuted[0].error).toMatch(/scope_denied/);
  });

  it('drops (with an audit row) when the rule was disabled during the delay window', async () => {
    state.selectQueues['automationRules'] = [[makeRule({ scopes: ['crm:write'], enabled: false })]];

    await runDelayedAutomationAction(handlerPayload(), db as unknown as Db);

    expect(mockExecutePortalTool).not.toHaveBeenCalled();
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert!.values.status).toBe('failed');
    expect(logInsert!.values.errorMessage).toMatch(/disabled/);
  });

  it('drops (with a rule-less audit row) when the rule was deleted during the delay window', async () => {
    state.selectQueues['automationRules'] = [[]];

    await runDelayedAutomationAction(handlerPayload(), db as unknown as Db);

    expect(mockExecutePortalTool).not.toHaveBeenCalled();
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert!.values.ruleId).toBeNull();
    expect(logInsert!.values.errorMessage).toMatch(/no longer exists/);
  });

  it('drops when the rule no longer belongs to the enqueuing tenant', async () => {
    state.selectQueues['automationRules'] = [[makeRule({ clientId: 999, scopes: ['crm:write'] })]];

    await runDelayedAutomationAction(handlerPayload(), db as unknown as Db);

    expect(mockExecutePortalTool).not.toHaveBeenCalled();
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert!.values.ruleId).toBeNull();
    expect(logInsert!.values.errorMessage).toMatch(/no longer belongs/);
  });

  it('throws on a malformed payload (queue-level retry/dead-letter is the correct escalation)', async () => {
    await expect(
      runDelayedAutomationAction({ ruleId: 'nope' }, db as unknown as Db),
    ).rejects.toThrow(/malformed payload/);
  });
});
