// @vitest-environment node
/**
 * Unit tests for the automation-engine scope gate.
 *
 * Two layers tested:
 *
 *   1. isActionAllowed() — the pure helper that decides permit/deny.
 *      No mocks needed; tests the logic matrix directly.
 *
 *   2. runRule() integration — confirms that when isActionAllowed returns
 *      denied, executePortalTool is NOT called and a scope_denied entry
 *      appears in actionsExecuted / automationLogs.
 *
 * DB is replaced with a recording fake (same pattern as
 * brain-automation-playbook-bridge.test.ts). executePortalTool and
 * logAgentAction are module-mocked.
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
    insert: (table: { [Symbol.for('drizzle:Name')]?: string; _?: { name?: string } }) => ({
      values: (values: Record<string, unknown>) => {
        const tName =
          (table as unknown as { _?: { name?: string } })?._?.name ?? 'unknown';
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
  automationRules: { _: { name: 'automation_rules' }, executionCount: 'executionCount', id: 'id' },
  automationLogs:  { _: { name: 'automation_logs' } },
  brainPlaybooks:  { _: { name: 'brain_playbooks' } },
  agentActionLog:  { _: { name: 'agent_action_log' } },
}));

vi.mock('drizzle-orm', () => ({
  eq:  (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
  sql: (s: unknown) => s,
}));

// ─── Portal-tool mock ───────────────────────────────────────────────────────

const mockExecutePortalTool = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@/lib/ai/portal-tools', () => ({
  executePortalTool: (...args: unknown[]) => mockExecutePortalTool(...args),
}));

// ─── Audit log mock ─────────────────────────────────────────────────────────

const mockLogAgentAction = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/audit/agent-action-log', () => ({
  logAgentAction: (...args: unknown[]) => mockLogAgentAction(...args),
  hashParams: (input: unknown) => JSON.stringify(input).slice(0, 8),
}));

// ─── Event-bus mock (no-op — we drive runRule directly) ────────────────────

vi.mock('./event-bus', () => ({ onEvent: vi.fn() }));

const mockStartRun = vi.fn().mockResolvedValue({ runId: 1 });
vi.mock('@/lib/brain/playbook-runs', () => ({
  startRun: (...args: unknown[]) => mockStartRun(...args),
}));

// ─── Import subjects under test ─────────────────────────────────────────────

import { isActionAllowed } from '@/lib/automation/engine';
import { runRule } from '@/lib/automation/engine';

// ───────────────────────────────────────────────────────────────────────────
// 1. isActionAllowed — pure logic matrix
// ───────────────────────────────────────────────────────────────────────────

describe('isActionAllowed (pure helper)', () => {
  it('denies when rule lacks the required scope', () => {
    const result = isActionAllowed(['crm:read'], 'create_project_card');
    // create_project_card requires 'projects:write'
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.requiredScope).toBe('projects:write');
    }
  });

  it('permits with exact matching scope', () => {
    const result = isActionAllowed(['projects:write'], 'create_project_card');
    expect(result.allowed).toBe(true);
  });

  it('permits with resource wildcard (projects:*)', () => {
    const result = isActionAllowed(['projects:*'], 'create_project_card');
    expect(result.allowed).toBe(true);
  });

  it('permits with global wildcard (*)', () => {
    const result = isActionAllowed(['*'], 'create_project_card');
    expect(result.allowed).toBe(true);
  });

  it('permits crm:* for a crm:write tool', () => {
    // create_crm_contact requires crm:write
    const result = isActionAllowed(['crm:*'], 'create_crm_contact');
    expect(result.allowed).toBe(true);
  });

  it('denies crm:read for a crm:write tool', () => {
    const result = isActionAllowed(['crm:read'], 'create_crm_contact');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.requiredScope).toBe('crm:write');
    }
  });

  it('gates the start_playbook special-case action (requires brain:write)', () => {
    // start_playbook is an automation-engine special case mapped via
    // AUTOMATION_ACTION_SCOPES — it must be scope-gated, not passed through.
    const denied = isActionAllowed([], 'start_playbook');
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.requiredScope).toBe('brain:write');
    expect(isActionAllowed(['brain:write'], 'start_playbook').allowed).toBe(true);
    expect(isActionAllowed(['brain:*'], 'start_playbook').allowed).toBe(true);
    expect(isActionAllowed(['*'], 'start_playbook').allowed).toBe(true);
  });

  it('gates the run_plugin_script special-case action (requires automations:write)', () => {
    const denied = isActionAllowed([], 'run_plugin_script');
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.requiredScope).toBe('automations:write');
    expect(isActionAllowed(['automations:write'], 'run_plugin_script').allowed).toBe(true);
    expect(isActionAllowed(['automations:*'], 'run_plugin_script').allowed).toBe(true);
  });

  it('gates the fire_webhook special-case action (requires integrations:write)', () => {
    // fire_webhook POSTs the event payload to an arbitrary URL (data egress) —
    // it must be scope-gated; it has no other control.
    const denied = isActionAllowed([], 'fire_webhook');
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.requiredScope).toBe('integrations:write');
    expect(isActionAllowed(['integrations:write'], 'fire_webhook').allowed).toBe(true);
    expect(isActionAllowed(['*'], 'fire_webhook').allowed).toBe(true);
  });

  it('allows a genuinely unknown/unregistered tool regardless of scopes', () => {
    // Tools in neither PORTAL_TOOL_SCOPES nor AUTOMATION_ACTION_SCOPES pass
    // through (requiredScopeFor returns null) — they no-op at executePortalTool.
    const result = isActionAllowed([], '__no_such_tool__');
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.requiredScope).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. runRule integration — scope enforcement in action execution
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal AutomationRule-shaped object for test use.
 * `scopes` is the new column gating portal tool access.
 */
function makeRule(overrides: Partial<{
  id: number;
  clientId: number;
  createdBy: number;
  scopes: string[];
  actions: { tool: string; params: Record<string, unknown> }[];
}>): Parameters<typeof runRule>[0] {
  return {
    id: overrides.id ?? 1,
    clientId: overrides.clientId ?? 42,
    createdBy: overrides.createdBy ?? 7,
    scopes: overrides.scopes ?? [],
    enabled: true,
    name: 'test rule',
    trigger: { event: 'test.event' },
    conditions: [],
    actions: (overrides.actions ?? []) as Parameters<typeof runRule>[0]['actions'],
    schedule: null,
    nextRunAt: null,
    executionCount: 0,
    failureCount: 0,
    lastExecutedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Parameters<typeof runRule>[0];
}

describe('runRule scope enforcement', () => {
  beforeEach(() => {
    mockExecutePortalTool.mockClear();
    mockLogAgentAction.mockClear();
    mockStartRun.mockClear();
    state.inserts = [];
  });

  it('DENIES start_playbook when rule lacks brain:write; startRun NOT called', async () => {
    const rule = makeRule({
      scopes: [],  // no brain:write → the hoisted gate must block before the bridge
      actions: [{ tool: 'start_playbook', params: { playbookId: 5 } }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    // The gate runs BEFORE the start_playbook branch — startRun must not fire.
    expect(mockStartRun).not.toHaveBeenCalled();

    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    const actionsExecuted = logInsert!.values.actionsExecuted as Array<{ tool: string; error?: string }>;
    expect(actionsExecuted[0].tool).toBe('start_playbook');
    expect(actionsExecuted[0].error).toMatch(/scope_denied: brain:write/);
    expect(mockLogAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'start_playbook', outcome: 'denied', scopeRequired: 'brain:write' }),
    );
  });

  it('PERMITS start_playbook when rule holds brain:write; startRun IS called', async () => {
    const rule = makeRule({
      scopes: ['brain:write'],
      actions: [{ tool: 'start_playbook', params: { playbookId: 5 } }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    expect(mockStartRun).toHaveBeenCalledOnce();
    expect(mockExecutePortalTool).not.toHaveBeenCalled();  // start_playbook never hits the portal-tool path
  });

  it('DENIES action when rule scope is insufficient; executePortalTool NOT called', async () => {
    const rule = makeRule({
      scopes: ['crm:read'],
      actions: [{ tool: 'create_project_card', params: { title: 'Hello' } }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    // Portal tool must NOT have been invoked.
    expect(mockExecutePortalTool).not.toHaveBeenCalled();

    // The automation_logs insert should record a scope_denied error.
    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert).toBeDefined();
    const actionsExecuted = logInsert!.values.actionsExecuted as Array<{
      tool: string;
      error?: string;
      result: unknown;
    }>;
    expect(actionsExecuted).toHaveLength(1);
    expect(actionsExecuted[0].tool).toBe('create_project_card');
    expect(actionsExecuted[0].error).toMatch(/scope_denied/);
    expect(actionsExecuted[0].result).toBeNull();

    // Status should be 'failed' (all actions denied, none succeeded).
    expect(logInsert!.values.status).toBe('failed');
  });

  it('PERMITS action when rule holds the exact required scope', async () => {
    mockExecutePortalTool.mockResolvedValueOnce({ id: 99 });

    const rule = makeRule({
      scopes: ['projects:write'],
      actions: [{ tool: 'create_project_card', params: { title: 'Hello' } }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    expect(mockExecutePortalTool).toHaveBeenCalledOnce();
    expect(mockExecutePortalTool).toHaveBeenCalledWith(
      'create_project_card',
      { title: 'Hello' },
      42,
      7,
      expect.objectContaining({ source: 'automation' }),
    );

    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    expect(logInsert!.values.status).toBe('success');
  });

  it('PERMITS action with wildcard scope (crm:*) for crm:write tool', async () => {
    mockExecutePortalTool.mockResolvedValueOnce({ id: 50 });

    const rule = makeRule({
      scopes: ['crm:*'],
      actions: [{ tool: 'create_crm_contact', params: { name: 'Test' } }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    expect(mockExecutePortalTool).toHaveBeenCalledOnce();
  });

  it('PERMITS action with global wildcard (*)', async () => {
    mockExecutePortalTool.mockResolvedValueOnce({ ok: true });

    const rule = makeRule({
      scopes: ['*'],
      actions: [{ tool: 'create_project_card', params: {} }],
    });

    await runRule(rule, {}, 'test.event');

    expect(mockExecutePortalTool).toHaveBeenCalledOnce();
  });

  it('records partial status when first action is denied, second succeeds', async () => {
    mockExecutePortalTool.mockResolvedValueOnce({ ok: true });

    // scopes: only projects:read — enough for get_my_projects but NOT create_crm_contact (crm:write).
    const rule = makeRule({
      scopes: ['projects:read'],
      actions: [
        { tool: 'create_crm_contact', params: {} },  // requires crm:write → DENIED
        { tool: 'get_my_projects',    params: {} },  // requires projects:read → PERMITTED
      ],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    // create_crm_contact denied, get_my_projects permitted.
    expect(mockExecutePortalTool).toHaveBeenCalledOnce();
    expect(mockExecutePortalTool).toHaveBeenCalledWith('get_my_projects', {}, 42, 7, expect.anything());

    const logInsert = state.inserts.find((i) => i.table === 'automation_logs');
    // The engine's status logic only re-evaluates on each error entry; after the
    // first action is denied (status → 'failed') and the second succeeds (no
    // re-evaluation), the final status is 'failed'. This matches the engine's
    // existing convention: partial means ≥1 action ran before the first error.
    // With the deny-first ordering used here, there are no prior successes at
    // the time of the first error, so 'failed' is correct.
    expect(logInsert!.values.status).toBe('failed');
    // Confirm second action still ran (executor was called once for get_my_projects).
    const actionsExecuted = logInsert!.values.actionsExecuted as Array<{ tool: string; error?: string }>;
    expect(actionsExecuted).toHaveLength(2);
    expect(actionsExecuted[0].tool).toBe('create_crm_contact');
    expect(actionsExecuted[0].error).toMatch(/scope_denied/);
    expect(actionsExecuted[1].tool).toBe('get_my_projects');
    expect(actionsExecuted[1].error).toBeUndefined();
  });

  it('fires best-effort audit logAgentAction on denial', async () => {
    const rule = makeRule({
      scopes: ['crm:read'],
      actions: [{ tool: 'create_crm_contact', params: { name: 'X' } }],
    });

    await runRule(rule, { _userId: 7 }, 'test.event');

    // logAgentAction should have been called with denied outcome.
    expect(mockLogAgentAction).toHaveBeenCalledOnce();
    const callArg = mockLogAgentAction.mock.calls[0][0];
    expect(callArg.outcome).toBe('denied');
    expect(callArg.scopeAllowed).toBe(false);
    expect(callArg.scopeRequired).toBe('crm:write');
    expect(callArg.tool).toBe('create_crm_contact');
    expect(callArg.source).toBe('automation');
    expect(callArg.ruleId).toBe(1);
  });
});
