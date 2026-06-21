/**
 * Portal Automations API E2E Tests
 *
 * Tests for /api/portal/automations CRUD, NLP parse, and execution logs
 */
import { test, expect } from './setup/coverage-fixture';
import { runCleanups } from './setup/helpers';

test.describe('Portal Automations @automations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── CRUD ────────────────────────────────────────────────────────────────────

  test('GET /automations returns empty list for new client', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.rules)).toBe(true);
  });

  test('POST /automations creates a manual rule', async ({ clientApi }) => {
    const name = `E2E Test Rule ${Date.now()}`;
    const res = await clientApi.post('/api/portal/automations', {
      name,
      description: 'Created by E2E test',
      trigger: { event: 'booking.created' },
      conditions: [],
      actions: [
        { tool: 'create_support_ticket', params: { subject: 'Auto: {{event.guestName}}', body: 'Test action' } },
      ],
      source: 'manual',
      productScope: 'booking',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.rule.name).toBe(name);
    expect(res.data.rule.trigger.event).toBe('booking.created');
    expect(res.data.rule.enabled).toBe(true);
    expect(res.data.rule.source).toBe('manual');
    expect(res.data.rule.productScope).toBe('booking');
    expect(res.data.rule.actions).toHaveLength(1);

    const ruleId = res.data.rule.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${ruleId}`).catch(() => {});
    });
  });

  test('POST /automations validates required fields', async ({ clientApi }) => {
    // Missing name
    const res1 = await clientApi.post('/api/portal/automations', {
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'create_support_ticket', params: { subject: 'test' } }],
    });
    expect(res1.status).toBe(400);

    // Missing trigger
    const res2 = await clientApi.post('/api/portal/automations', {
      name: 'Test',
      actions: [{ tool: 'create_support_ticket', params: { subject: 'test' } }],
    });
    expect(res2.status).toBe(400);

    // Missing actions
    const res3 = await clientApi.post('/api/portal/automations', {
      name: 'Test',
      trigger: { event: 'booking.created' },
    });
    expect(res3.status).toBe(400);
  });

  test('PATCH /automations/:id toggles enabled state', async ({ clientApi }) => {
    // Create rule
    const createRes = await clientApi.post('/api/portal/automations', {
      name: `Toggle Test ${Date.now()}`,
      trigger: { event: 'ticket.created' },
      actions: [{ tool: 'create_support_ticket', params: { subject: 'Test' } }],
      source: 'manual',
    });
    const ruleId = createRes.data.rule.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${ruleId}`).catch(() => {});
    });

    // Disable
    const disableRes = await clientApi.patch(`/api/portal/automations/${ruleId}`, { enabled: false });
    expect(disableRes.status).toBe(200);
    expect(disableRes.data.success).toBe(true);
    expect(disableRes.data.rule.enabled).toBe(false);

    // Re-enable
    const enableRes = await clientApi.patch(`/api/portal/automations/${ruleId}`, { enabled: true });
    expect(enableRes.status).toBe(200);
    expect(enableRes.data.rule.enabled).toBe(true);
  });

  test('PATCH /automations/:id updates rule fields', async ({ clientApi }) => {
    const createRes = await clientApi.post('/api/portal/automations', {
      name: `Update Test ${Date.now()}`,
      trigger: { event: 'crm.deal.created' },
      actions: [{ tool: 'create_support_ticket', params: { subject: 'Original' } }],
      source: 'manual',
      productScope: 'crm',
    });
    const ruleId = createRes.data.rule.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${ruleId}`).catch(() => {});
    });

    // Update name, description, actions
    const updateRes = await clientApi.patch(`/api/portal/automations/${ruleId}`, {
      name: 'Updated Name',
      description: 'Updated description',
      actions: [
        { tool: 'create_support_ticket', params: { subject: 'Updated action 1' } },
        { tool: 'create_support_ticket', params: { subject: 'Updated action 2' } },
      ],
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.data.rule.name).toBe('Updated Name');
    expect(updateRes.data.rule.description).toBe('Updated description');
    expect(updateRes.data.rule.actions).toHaveLength(2);
  });

  test('DELETE /automations/:id removes a rule', async ({ clientApi }) => {
    const createRes = await clientApi.post('/api/portal/automations', {
      name: `Delete Test ${Date.now()}`,
      trigger: { event: 'form.submitted' },
      actions: [{ tool: 'create_support_ticket', params: { subject: 'Delete me' } }],
      source: 'manual',
    });
    const ruleId = createRes.data.rule.id;

    // Delete
    const deleteRes = await clientApi.delete(`/api/portal/automations/${ruleId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.data.success).toBe(true);

    // Verify gone — PATCH should 404
    const patchRes = await clientApi.patch(`/api/portal/automations/${ruleId}`, { enabled: false });
    expect(patchRes.status).toBe(404);
  });

  // ── LISTING & FILTERING ─────────────────────────────────────────────────────

  test('GET /automations returns rules in descending order', async ({ clientApi }) => {
    // Create two rules
    const res1 = await clientApi.post('/api/portal/automations', {
      name: `Order Test A ${Date.now()}`,
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'create_support_ticket', params: { subject: 'A' } }],
      source: 'manual',
    });
    const res2 = await clientApi.post('/api/portal/automations', {
      name: `Order Test B ${Date.now()}`,
      trigger: { event: 'ticket.created' },
      actions: [{ tool: 'create_support_ticket', params: { subject: 'B' } }],
      source: 'manual',
    });

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${res1.data.rule.id}`).catch(() => {});
      await clientApi.delete(`/api/portal/automations/${res2.data.rule.id}`).catch(() => {});
    });

    const listRes = await clientApi.get('/api/portal/automations');
    expect(listRes.status).toBe(200);
    const rules = listRes.data.rules;

    // Most recent first
    const idxA = rules.findIndex((r: { id: number }) => r.id === res1.data.rule.id);
    const idxB = rules.findIndex((r: { id: number }) => r.id === res2.data.rule.id);
    expect(idxB).toBeLessThan(idxA); // B created after A, so B should be first
  });

  // ── LOGS ────────────────────────────────────────────────────────────────────

  test('GET /automations/logs returns execution history', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations/logs');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.logs)).toBe(true);
  });

  test('GET /automations/logs supports limit parameter', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations/logs?limit=5');
    expect(res.status).toBe(200);
    expect(res.data.logs.length).toBeLessThanOrEqual(5);
  });

  // ── SETTINGS-SOURCE RULES ──────────────────────────────────────────────────

  test('POST /automations with source=settings creates product-scoped rule', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations', {
      name: 'Booking Confirmation Email',
      description: 'Auto-send confirmation when booking is created',
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'create_support_ticket', params: { subject: 'Booking confirmed for {{event.guestName}}' } }],
      source: 'settings',
      productScope: 'booking',
    });
    expect(res.status).toBe(200);
    expect(res.data.rule.source).toBe('settings');
    expect(res.data.rule.productScope).toBe('booking');

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${res.data.rule.id}`).catch(() => {});
    });
  });

  // ── CROSS-PRODUCT RULES ─────────────────────────────────────────────────────

  test('POST /automations supports cross-product rules (null scope)', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations', {
      name: `Cross-Product ${Date.now()}`,
      trigger: { event: 'crm.deal.won' },
      conditions: [{ field: 'value', operator: 'gt', value: 5000 }],
      actions: [
        { tool: 'create_support_ticket', params: { subject: 'Won deal: {{event.title}}', body: 'Create project for {{event.title}}' } },
        { tool: 'create_support_ticket', params: { subject: 'Welcome email for {{event.title}}', body: 'Send onboarding email' }, delay: 3600 },
      ],
      source: 'nlp',
      productScope: null,
    });
    expect(res.status).toBe(200);
    expect(res.data.rule.productScope).toBeNull();
    expect(res.data.rule.conditions).toHaveLength(1);
    expect(res.data.rule.actions).toHaveLength(2);
    expect(res.data.rule.actions[1].delay).toBe(3600);

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${res.data.rule.id}`).catch(() => {});
    });
  });

  // ── AUTH ─────────────────────────────────────────────────────────────────────

  test('unauthenticated requests return 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/automations');
    expect(res.status).toBe(401);
  });

  // ── NLP PARSE ───────────────────────────────────────────────────────────────

  test('POST /automations/parse validates description field', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/parse', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── WORKFLOW CONDITION NODE (BRANCHING) ──────────────────────────────────────
// Regression test for the bug where executeStep() read action from
// node.data.kind which was undefined for condition nodes, causing a NOT NULL
// constraint failure in workflow_step_logs and making every workflow containing
// a condition node always fail with "Failed query".
//
// Fix: lib/workflows/runtime.ts line 191 — fallback to node.type so the insert
// always has a non-null action value.

test.describe('Workflow condition node execution @automations', () => {
  let workflowId: number | null = null;

  test.afterEach(async ({ clientApi }) => {
    if (workflowId != null) {
      await (clientApi as unknown as { delete: (path: string) => Promise<unknown> })
        .delete(`/api/portal/workflows/${workflowId}`)
        .catch(() => {});
      workflowId = null;
    }
  });

  test('workflow with a condition/branch node completes without NOT NULL failure @critical', async ({ clientApi }) => {
    const ts = Date.now();

    // 1. Create a blank workflow.
    const createRes = await clientApi.post('/api/portal/workflows', {
      name: `e2e-condition-bug-${ts}`,
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.success).toBe(true);
    const wf = createRes.data.data as { id: number };
    workflowId = wf.id;

    // 2. Patch in a graph that contains a condition node branching to a
    //    create_task action on the "true" branch. This is the shape that
    //    previously caused a NOT NULL failure in workflow_step_logs.action.
    const graph = {
      nodes: [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 50, y: 50 },
          data: { kind: 'contact.created' },
        },
        {
          id: 'cond-1',
          type: 'condition',
          position: { x: 50, y: 200 },
          // condition nodes have data.kind === 'condition'; the bug was that
          // the runtime coerced this to undefined under certain paths.
          data: { kind: 'condition', expression: 'always.true' },
        },
        {
          id: 'task-1',
          type: 'action',
          position: { x: 50, y: 350 },
          data: { kind: 'create_task', title: `E2E condition branch task ${ts}` },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'cond-1' },
        // label 'true' — the condition engine defaults to true so this branch fires.
        { id: 'e2', source: 'cond-1', target: 'task-1', label: 'true' },
      ],
    };

    const patchRes = await clientApi.patch(`/api/portal/workflows/${workflowId}`, { graph });
    expect(patchRes.status).toBe(200);

    // 3. Trigger a test-run. Before the fix this always returned status:'failed'
    //    with error containing "Failed query" or similar PG NOT NULL violation.
    const runRes = await clientApi.post(`/api/portal/workflows/${workflowId}/test-run`, {
      // Pass a condition override so the true branch fires deterministically.
      context: { conditions: { 'always.true': true } },
    });
    expect(runRes.status).toBe(200);

    const result = runRes.data.data as { status: string; runId: number; error?: string };

    // 4. The run must succeed — not fail with a NOT NULL DB error.
    expect(result.status).toBe('completed');
    expect(result.error).toBeUndefined();

    // 5. Verify the run history records the step.
    const runsRes = await clientApi.get(`/api/portal/workflows/${workflowId}/runs`);
    expect(runsRes.status).toBe(200);
    const runs = runsRes.data.data as Array<{ id: number; status: string }>;
    const thisRun = runs.find((r) => r.id === result.runId);
    expect(thisRun).toBeDefined();
    expect(thisRun?.status).toBe('completed');
  });

  test('workflow with condition node on false branch still completes @automations', async ({ clientApi }) => {
    const ts = Date.now();

    const createRes = await clientApi.post('/api/portal/workflows', {
      name: `e2e-condition-false-${ts}`,
    });
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data as { id: number };
    workflowId = wf.id;

    // Graph with a condition node and TWO branches: true → task, false → wait.
    const graph = {
      nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 50, y: 0 }, data: { kind: 'contact.created' } },
        { id: 'cond-1', type: 'condition', position: { x: 50, y: 150 }, data: { kind: 'condition', expression: 'deal.stale' } },
        { id: 'task-true', type: 'action', position: { x: -100, y: 300 }, data: { kind: 'create_task', title: `Stale deal follow-up ${ts}` } },
        // false branch — just a wait so the graph has two branches.
        { id: 'wait-false', type: 'action', position: { x: 200, y: 300 }, data: { kind: 'wait', ms: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', target: 'task-true', label: 'true' },
        { id: 'e3', source: 'cond-1', target: 'wait-false', label: 'false' },
      ],
    };

    await clientApi.patch(`/api/portal/workflows/${workflowId}`, { graph });

    // Pass condition=false so the false branch fires.
    const runRes = await clientApi.post(`/api/portal/workflows/${workflowId}/test-run`, {
      context: { conditions: { 'deal.stale': false } },
    });
    expect(runRes.status).toBe(200);
    const result = runRes.data.data as { status: string; error?: string };
    expect(result.status).toBe('completed');
    expect(result.error).toBeUndefined();
  });
});
