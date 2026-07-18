/**
 * Gap coverage: Automations — Visual workflow builder API + scope-gated denial
 *
 * Gap 1: Visual workflow builder API
 *   Routes exercised:
 *     GET  /api/portal/workflows                        — list
 *     POST /api/portal/workflows                        — create (blank + from template)
 *     GET  /api/portal/workflows/templates              — list templates
 *     GET  /api/portal/workflows/[id]                   — get one
 *     PATCH /api/portal/workflows/[id]                  — update (name, status, graph)
 *     DELETE /api/portal/workflows/[id]                 — delete
 *     POST /api/portal/workflows/[id]/test-run          — test-run
 *     GET  /api/portal/workflows/[id]/runs              — runs list
 *
 *   Also covers the legacy automation rules API (same domain):
 *     GET  /api/portal/automations                      — list rules
 *     POST /api/portal/automations                      — create rule
 *     PATCH /api/portal/automations/[id]                — toggle / edit rule
 *     DELETE /api/portal/automations/[id]               — delete rule
 *     GET  /api/portal/automations/logs                 — logs list (slim)
 *     GET  /api/portal/automations/logs?detail=true     — logs list (full)
 *     POST /api/portal/automations/preview-schedule     — schedule preview
 *
 * Gap 2: Scope-gated action denial
 *   The engine `isActionAllowed()` helper + `scope_denied` log path is fully
 *   covered by unit tests in tests/unit/automation-scope-gate.test.ts which
 *   can mock DB writes. Via E2E (HTTP only, no DB direct access, scopes always
 *   auto-derived at create time from deriveRuleScopes(actions)) the success
 *   path is tested by verifying:
 *     - A rule created with a known-scope action derives the correct scope.
 *     - Auth-guard: unauthenticated callers get 401 on every route.
 *   The "scope_denied → log entry" E2E path is marked partial because the
 *   automation engine executes asynchronously (fire-and-forget from the event
 *   bus) with no REST trigger endpoint, and `scopes` is always auto-derived
 *   server-side — there is no supported API path to force a scope mismatch at
 *   runtime. The unit-test layer owns that assertion.
 */

import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

// ── Helpers ────────────────────────────────────────────────────────────────

async function createRule(
  api: Parameters<typeof runCleanups>[0][0] extends () => Promise<void>
    ? never
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any,
  overrides?: Record<string, unknown>,
) {
  const ts = Date.now();
  const res = await api.post('/api/portal/automations', {
    name: `E2E Rule ${ts}`,
    trigger: { event: 'crm.contact.created' },
    actions: [{ tool: 'get_my_tickets', params: {} }],
    ...overrides,
  });
  return res;
}

async function createWorkflow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: any,
  overrides?: Record<string, unknown>,
) {
  const ts = Date.now();
  const res = await api.post('/api/portal/workflows', {
    name: `E2E Workflow ${ts}`,
    ...overrides,
  });
  return res;
}

// ── Gap 1a: Automation rules CRUD ─────────────────────────────────────────

test.describe('Automations — rules CRUD @gap @automations', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async ({ clientApi }) => {
    await runCleanups(cleanups);
    cleanups = [];
    void clientApi; // suppress unused var warning
  });

  test('GET /api/portal/automations returns { success, rules } array', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.rules)).toBe(true);
  });

  test('GET /api/portal/automations — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/automations');
    expect(res.status).toBe(401);
  });

  test('POST /api/portal/automations creates a rule and returns it with derived scopes', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/automations', {
      name: `E2E Rule ${ts}`,
      trigger: { event: 'crm.contact.created' },
      // get_my_tickets → tickets:read scope
      actions: [{ tool: 'get_my_tickets', params: {} }],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const rule = res.data.rule;
    expect(rule).toBeDefined();
    expect(rule.id).toBeDefined();
    expect(rule.name).toContain(`E2E Rule ${ts}`);
    // Derived scopes must include tickets:read
    expect(Array.isArray(rule.scopes)).toBe(true);
    expect(rule.scopes).toContain('tickets:read');

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${rule.id}`);
    });
  });

  test('POST /api/portal/automations rejects missing required fields with 400', async ({ clientApi }) => {
    // Missing trigger
    const res1 = await clientApi.post('/api/portal/automations', {
      name: 'No trigger',
      actions: [{ tool: 'get_my_tickets', params: {} }],
    });
    expect(res1.status).toBe(400);
    expect(res1.data.success).toBe(false);

    // Missing actions
    const res2 = await clientApi.post('/api/portal/automations', {
      name: 'No actions',
      trigger: { event: 'crm.contact.created' },
      actions: [],
    });
    expect(res2.status).toBe(400);
    expect(res2.data.success).toBe(false);

    // Missing name
    const res3 = await clientApi.post('/api/portal/automations', {
      trigger: { event: 'crm.contact.created' },
      actions: [{ tool: 'get_my_tickets', params: {} }],
    });
    expect(res3.status).toBe(400);
    expect(res3.data.success).toBe(false);
  });

  test('POST /api/portal/automations rejects invalid schedule with 400', async ({ clientApi }) => {
    // Wrong cadence value — should fail validateSchedule
    const res = await clientApi.post('/api/portal/automations', {
      name: `E2E Bad Schedule ${Date.now()}`,
      trigger: { event: 'automation.scheduled' },
      actions: [{ tool: 'get_my_tickets', params: {} }],
      schedule: { cadence: 'invalid_cadence' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PATCH /api/portal/automations/[id] toggles enabled and renames rule', async ({ clientApi }) => {
    const createRes = await createRule(clientApi);
    expect(createRes.status).toBe(200);
    const rule = createRes.data.rule;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${rule.id}`);
    });

    // Toggle off
    const patchRes = await clientApi.patch(`/api/portal/automations/${rule.id}`, {
      enabled: false,
      name: 'Renamed Rule',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.rule.enabled).toBe(false);
    expect(patchRes.data.rule.name).toBe('Renamed Rule');
  });

  test('PATCH /api/portal/automations/[id] rejects invalid schedule with 400', async ({ clientApi }) => {
    const createRes = await createRule(clientApi);
    expect(createRes.status).toBe(200);
    const rule = createRes.data.rule;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${rule.id}`);
    });

    // Bad cadence — validateSchedule returns { ok: false }
    const patchRes = await clientApi.patch(`/api/portal/automations/${rule.id}`, {
      schedule: { cadence: 'invalid_cadence' },
    });
    expect(patchRes.status).toBe(400);
    expect(patchRes.data.success).toBe(false);
  });

  test('PATCH /api/portal/automations/[id] returns 404 for unknown rule', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/automations/999999999', {
      enabled: false,
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('DELETE /api/portal/automations/[id] removes the rule', async ({ clientApi }) => {
    const createRes = await createRule(clientApi);
    expect(createRes.status).toBe(200);
    const rule = createRes.data.rule;

    const delRes = await clientApi.delete(`/api/portal/automations/${rule.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);

    // Verify gone — PATCH should 404
    const patchRes = await clientApi.patch(`/api/portal/automations/${rule.id}`, { enabled: true });
    expect(patchRes.status).toBe(404);
  });

  test('DELETE /api/portal/automations/[id] — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/automations/1');
    expect(res.status).toBe(401);
  });
});

// ── Gap 1b: Automation logs ────────────────────────────────────────────────

test.describe('Automations — logs API @gap @automations', () => {
  test('GET /api/portal/automations/logs returns slim shape with required fields', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations/logs');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.logs)).toBe(true);
    // Slim shape: each log has id, clientId, ruleId, triggerEvent, status but
    // NOT triggerPayload or actionsExecuted (those are in the detail mode).
    for (const log of res.data.logs as Array<Record<string, unknown>>) {
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('status');
      expect(log).toHaveProperty('triggerEvent');
      // Slim mode must NOT include the large JSON blob columns
      expect(log.triggerPayload).toBeUndefined();
      expect(log.actionsExecuted).toBeUndefined();
    }
  });

  test('GET /api/portal/automations/logs?detail=true returns full shape with blobs', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations/logs?detail=true');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.logs)).toBe(true);
    // Detail mode includes the full row
    for (const log of res.data.logs as Array<Record<string, unknown>>) {
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('status');
      // Full row — actionsExecuted is present (may be null for old rows, but key exists)
      expect('actionsExecuted' in log).toBe(true);
    }
  });

  test('GET /api/portal/automations/logs?limit=5 respects limit param', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations/logs?limit=5');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.logs)).toBe(true);
    expect(res.data.logs.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/portal/automations/logs — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/automations/logs');
    expect(res.status).toBe(401);
  });

  test('GET /api/portal/automations/logs?ruleId=<foreign> returns empty list (cross-tenant isolation)', async ({ clientApi, unauthApi }) => {
    void unauthApi;
    // A ruleId that doesn't belong to this client returns [] not 403
    const res = await clientApi.get('/api/portal/automations/logs?ruleId=999999999');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.logs).toEqual([]);
  });
});

// ── Gap 1c: Schedule preview ───────────────────────────────────────────────

test.describe('Automations — schedule preview @gap @automations', () => {
  test('POST /api/portal/automations/preview-schedule returns description + nextRunAt for valid daily schedule', async ({ clientApi }) => {
    // The API uses AutomationSchedule shape: { cadence, time } not { type, value }
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'daily', time: '09:00' },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.description).toBe('string');
    expect(res.data.description.length).toBeGreaterThan(0);
    expect(res.data.description).toContain('09:00');
    // nextRunAt is an ISO string or null
    if (res.data.nextRunAt !== null) {
      expect(typeof res.data.nextRunAt).toBe('string');
      expect(() => new Date(res.data.nextRunAt)).not.toThrow();
    }
  });

  test('POST /api/portal/automations/preview-schedule returns description for valid cron', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'cron', cronExpression: '0 9 * * 1' }, // every Monday 9am
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.description).toContain('0 9 * * 1');
  });

  test('POST /api/portal/automations/preview-schedule returns 400 for invalid schedule shape', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'cron', cronExpression: 'not-valid-cron' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /api/portal/automations/preview-schedule returns 400 for unknown cadence', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'invalid_type', value: 'something' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /api/portal/automations/preview-schedule — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/automations/preview-schedule', {
      schedule: { type: 'cron', value: '0 9 * * 1' },
    });
    expect(res.status).toBe(401);
  });
});

// ── Gap 1d: Visual workflow builder (workflows routes) ─────────────────────

test.describe('Workflows — visual builder API @gap @automations @workflows', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async ({ clientApi }) => {
    await runCleanups(cleanups);
    cleanups = [];
    void clientApi;
  });

  test('GET /api/portal/workflows/templates lists templates with required fields', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows/templates');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);
    for (const t of res.data.data as Array<Record<string, unknown>>) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('triggerKind');
      expect(t).toHaveProperty('nodeCount');
    }
  });

  test('GET /api/portal/workflows/templates — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/workflows/templates');
    expect(res.status).toBe(401);
  });

  test('GET /api/portal/workflows returns { success, data } array', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /api/portal/workflows — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/workflows');
    expect(res.status).toBe(401);
  });

  test('POST /api/portal/workflows creates a blank workflow', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/workflows', {
      name: `Blank WF ${ts}`,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const wf = res.data.data;
    expect(wf.id).toBeDefined();
    expect(wf.name).toBe(`Blank WF ${ts}`);
    expect(wf.status).toBe('draft');
    expect(wf.graph).toBeDefined();
    expect(Array.isArray(wf.graph.nodes)).toBe(true);

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });
  });

  test('POST /api/portal/workflows with a valid templateId clones the template graph', async ({ clientApi }) => {
    // First get a template id
    const tmplRes = await clientApi.get('/api/portal/workflows/templates');
    expect(tmplRes.status).toBe(200);
    const templates = tmplRes.data.data as Array<{ id: string; name: string }>;
    expect(templates.length).toBeGreaterThan(0);
    const firstTemplate = templates[0];

    const ts = Date.now();
    const res = await clientApi.post('/api/portal/workflows', {
      templateId: firstTemplate.id,
      name: `From Template ${ts}`,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const wf = res.data.data;
    expect(wf.id).toBeDefined();
    expect(wf.name).toBe(`From Template ${ts}`);
    // Graph must have at least one node (template-seeded)
    expect(wf.graph.nodes.length).toBeGreaterThan(0);

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });
  });

  test('POST /api/portal/workflows with unknown templateId returns 404', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/workflows', {
      templateId: 'no-such-template',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST /api/portal/workflows — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/workflows', { name: 'Auth test' });
    expect(res.status).toBe(401);
  });

  test('GET /api/portal/workflows/[id] returns the workflow by id', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });

    const getRes = await clientApi.get(`/api/portal/workflows/${wf.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    expect(getRes.data.data.id).toBe(wf.id);
  });

  test('GET /api/portal/workflows/[id] returns 404 for unknown id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows/999999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET /api/portal/workflows/[id] returns 400 for non-numeric id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows/not-a-number');
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PATCH /api/portal/workflows/[id] updates name and status', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });

    const patchRes = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      name: 'Updated Name',
      status: 'active',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.data.name).toBe('Updated Name');
    expect(patchRes.data.data.status).toBe('active');
  });

  test('PATCH /api/portal/workflows/[id] rejects invalid status with 400', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });

    const patchRes = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      status: 'invalid_status',
    });
    expect(patchRes.status).toBe(400);
    expect(patchRes.data.success).toBe(false);
  });

  test('PATCH /api/portal/workflows/[id] updates graph (visual builder save)', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });

    const newGraph = {
      nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 100, y: 100 }, data: { kind: 'crm.deal.created' } },
        { id: 'action-1', type: 'action', position: { x: 100, y: 250 }, data: { tool: 'create_support_ticket', params: {} } },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'action-1' }],
    };
    const patchRes = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      graph: newGraph,
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.data.graph.nodes.length).toBe(2);
    expect(patchRes.data.data.graph.edges.length).toBe(1);
  });

  test('PATCH /api/portal/workflows/[id] returns 404 for unknown id', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/workflows/999999999', { name: 'X' });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('DELETE /api/portal/workflows/[id] removes the workflow', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;

    const delRes = await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);

    // Gone
    const getRes = await clientApi.get(`/api/portal/workflows/${wf.id}`);
    expect(getRes.status).toBe(404);
  });

  test('DELETE /api/portal/workflows/[id] — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/workflows/1');
    expect(res.status).toBe(401);
  });

  test('POST /api/portal/workflows/[id]/test-run returns a run result', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });

    const runRes = await clientApi.post(`/api/portal/workflows/${wf.id}/test-run`, {
      context: { source: 'e2e-test' },
    });
    // Test-run always returns 200 with { success, data: { status, ... } }
    expect(runRes.status).toBe(200);
    // success reflects whether the run status === 'completed'
    const run = runRes.data.data;
    expect(run).toBeDefined();
    expect(typeof run.status).toBe('string');
    expect(['completed', 'failed', 'running']).toContain(run.status);
  });

  test('POST /api/portal/workflows/[id]/test-run returns 404 for unknown workflow', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/workflows/999999999/test-run', {});
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST /api/portal/workflows/[id]/test-run — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/workflows/1/test-run', {});
    expect(res.status).toBe(401);
  });

  test('GET /api/portal/workflows/[id]/runs lists run records after a test-run', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });

    // Fire a test run to generate at least one run record
    await clientApi.post(`/api/portal/workflows/${wf.id}/test-run`, {});

    const runsRes = await clientApi.get(`/api/portal/workflows/${wf.id}/runs`);
    expect(runsRes.status).toBe(200);
    expect(runsRes.data.success).toBe(true);
    expect(Array.isArray(runsRes.data.data)).toBe(true);
    expect(runsRes.data.data.length).toBeGreaterThanOrEqual(1);
    const run = runsRes.data.data[0];
    expect(run).toHaveProperty('id');
    expect(run).toHaveProperty('workflowId');
    expect(run).toHaveProperty('status');
  });

  test('GET /api/portal/workflows/[id]/runs returns 404 for unknown workflow', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows/999999999/runs');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET /api/portal/workflows/[id]/runs — unauthenticated gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/workflows/1/runs');
    expect(res.status).toBe(401);
  });

  test('GET /api/portal/workflows/[id]/runs?limit=1 respects limit param', async ({ clientApi }) => {
    const createRes = await createWorkflow(clientApi);
    expect(createRes.status).toBe(200);
    const wf = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/workflows/${wf.id}`);
    });

    // Fire two test runs
    await clientApi.post(`/api/portal/workflows/${wf.id}/test-run`, {});
    await clientApi.post(`/api/portal/workflows/${wf.id}/test-run`, {});

    const runsRes = await clientApi.get(`/api/portal/workflows/${wf.id}/runs?limit=1`);
    expect(runsRes.status).toBe(200);
    expect(runsRes.data.data.length).toBeLessThanOrEqual(1);
  });
});

// ── Gap 2: Scope-gated denial (what IS testable at E2E level) ─────────────

test.describe('Automations — scope-gated action denial (E2E-reachable paths) @gap @automations @scope', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async ({ clientApi }) => {
    await runCleanups(cleanups);
    cleanups = [];
    void clientApi;
  });

  // The core `isActionAllowed()` + scope_denied log-write path is a unit-level
  // concern (see tests/unit/automation-scope-gate.test.ts). At E2E we verify:

  test('POST creates rule with actions and auto-derives the correct required scopes', async ({ clientApi }) => {
    // create_project_card requires projects:write
    const res = await clientApi.post('/api/portal/automations', {
      name: `Scope Derive Test ${Date.now()}`,
      trigger: { event: 'crm.deal.created' },
      actions: [{ tool: 'create_project_card', params: { boardId: 1, title: 'Deal follow-up' } }],
    });
    expect(res.status).toBe(200);
    const rule = res.data.rule;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${rule.id}`);
    });
    // Server must have derived projects:write (not empty, not tickets:read)
    expect(rule.scopes).toContain('projects:write');
  });

  test('PATCH rule with new actions re-derives scopes', async ({ clientApi }) => {
    // Start with tickets scope
    const createRes = await clientApi.post('/api/portal/automations', {
      name: `Scope Rederive Test ${Date.now()}`,
      trigger: { event: 'crm.contact.created' },
      actions: [{ tool: 'get_my_tickets', params: {} }],
    });
    expect(createRes.status).toBe(200);
    const rule = createRes.data.rule;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${rule.id}`);
    });
    expect(rule.scopes).toContain('tickets:read');

    // Update actions to email scope
    const patchRes = await clientApi.patch(`/api/portal/automations/${rule.id}`, {
      actions: [{ tool: 'get_my_email_campaigns', params: {} }],
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.rule.scopes).toContain('email:read');
    // Old tickets scope should be gone
    expect(patchRes.data.rule.scopes).not.toContain('tickets:read');
  });

  test('Logs endpoint is auth-gated: unauthenticated call returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/automations/logs');
    expect(res.status).toBe(401);
  });
});
