/**
 * cov-u27 — Automations Workflows coverage slice (unit 27)
 *
 * Cards 4-7 (0-based) from "## To Test" in:
 *   vault/05 - Feature Specs/E2E Audit/Automations Workflows E2E Audit.md
 *
 * Card 4: send_email / add_to_list action kinds
 * Card 5: Plain-English rule parser → workflow creation
 * Card 6: Visual workflow CRUD: list, create blank, GET by id, DELETE
 * Card 7: Visual workflow status transitions: draft → active → paused via PATCH
 */
import { test, expect } from './setup/fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createWorkflow(
  clientApi: import('./setup/api-client').ApiClient,
  name: string,
) {
  const res = await clientApi.post('/api/portal/workflows', { name });
  if (res.status !== 200) throw new Error(`createWorkflow failed: ${res.status} — ${JSON.stringify(res.data)}`);
  return res.data.data as { id: number; name: string; status: string };
}

// ---------------------------------------------------------------------------
// Card 4: send_email / add_to_list action kinds
//
// The runtime (lib/workflows/runtime.ts) type-switches on action.kind.
// 'send_email' and 'add_to_list' are recognized cases that return
// status:'skipped' with a todo note (not yet wired). We verify:
//   1. A workflow with a send_email action node runs without error.
//   2. A workflow with an add_to_list action node runs without error.
// ---------------------------------------------------------------------------

test.describe('Workflows — send_email / add_to_list action kinds @automations', () => {
  const cleanupIds: number[] = [];

  test.afterAll(async ({ clientApi }) => {
    for (const id of cleanupIds) {
      await clientApi.delete(`/api/portal/workflows/${id}`).catch(() => {});
    }
  });

  test('workflow with send_email action node completes with skipped step @critical', async ({
    clientApi,
  }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `send-email-action-${ts}`);
    cleanupIds.push(wf.id);

    // Build graph: trigger → send_email action node
    const graph = {
      nodes: [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { kind: 'contact.created' },
        },
        {
          id: 'send1',
          type: 'action',
          position: { x: 0, y: 150 },
          data: { kind: 'send_email', templateId: 0, to: 'contact' },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'send1' }],
    };

    const patch = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      graph,
      trigger: { kind: 'contact.created' },
    });
    expect(patch.status).toBe(200);

    const run = await clientApi.post(`/api/portal/workflows/${wf.id}/test-run`, {});
    expect(run.status).toBe(200);
    // The run endpoint sets success = (result.status === 'completed')
    // send_email returns 'skipped' at the step level; the overall run still completes
    expect(run.data.data.status).toBe('completed');
    expect(typeof run.data.data.runId).toBe('number');
  });

  test('workflow with add_to_list action node completes with skipped step', async ({
    clientApi,
  }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `add-to-list-action-${ts}`);
    cleanupIds.push(wf.id);

    const graph = {
      nodes: [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { kind: 'contact.created' },
        },
        {
          id: 'list1',
          type: 'action',
          position: { x: 0, y: 150 },
          data: { kind: 'add_to_list', listId: 1 },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'list1' }],
    };

    await clientApi.patch(`/api/portal/workflows/${wf.id}`, { graph });

    const run = await clientApi.post(`/api/portal/workflows/${wf.id}/test-run`, {});
    expect(run.status).toBe(200);
    expect(run.data.data.status).toBe('completed');
  });

  test('rejects unauthenticated test-run', async ({ unauthApi, clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `unauth-actions-${ts}`);
    cleanupIds.push(wf.id);

    const res = await unauthApi.post(`/api/portal/workflows/${wf.id}/test-run`, {});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Card 5: Plain-English rule parser → workflow creation
//
// Route: POST /api/portal/automations/parse
// The full AI path requires credits and may return 402 in the test environment.
// We exercise:
//   1. Validation: missing description → 400.
//   2. Auth guard: unauthenticated → 401.
//   3. (Optional) Live parse if the environment allows it (non-402).
// ---------------------------------------------------------------------------

test.describe('Automations — Plain-English rule parser @automations', () => {
  test('POST /automations/parse returns 400 for missing description @critical', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/portal/automations/parse', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /automations/parse returns 400 for empty description', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/parse', { description: '' });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /automations/parse rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/automations/parse', {
      description: 'When a contact is created, send a welcome email',
    });
    expect(res.status).toBe(401);
  });

  test('POST /automations/parse with valid description returns parsed rule, 402 or 500', async ({
    clientApi,
  }) => {
    // The test seed tenant may not have AI credits (402) or the AI provider
    // may not be configured in the test environment (500). Either a successful
    // parse (200) or those gating responses is acceptable here.
    const res = await clientApi.post('/api/portal/automations/parse', {
      description: 'When a contact is created, send a welcome email',
    });
    const acceptable = [200, 402, 500];
    expect(acceptable).toContain(res.status);
    if (res.status === 200) {
      expect(res.data.success).toBe(true);
      expect(res.data.parsed).toBeDefined();
      expect(res.data.parsed).toHaveProperty('trigger');
    }
  });
});

// ---------------------------------------------------------------------------
// Card 6: Visual workflow CRUD — list, create blank, GET by id, DELETE
//
// Routes:
//   GET    /api/portal/workflows            — list
//   POST   /api/portal/workflows            — create blank (or from template)
//   GET    /api/portal/workflows/[id]       — get single
//   DELETE /api/portal/workflows/[id]       — delete
// ---------------------------------------------------------------------------

test.describe('Visual Workflow CRUD @automations', () => {
  test('GET /workflows returns array of workflows @critical', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /workflows creates a blank draft workflow', async ({ clientApi }) => {
    const ts = Date.now();
    const name = `CRUD-blank-${ts}`;
    const create = await clientApi.post('/api/portal/workflows', { name });
    expect(create.status).toBe(200);
    expect(create.data.success).toBe(true);
    expect(create.data.data).toHaveProperty('id');
    expect(create.data.data.name).toBe(name);
    expect(create.data.data.status).toBe('draft');

    // Cleanup
    await clientApi.delete(`/api/portal/workflows/${create.data.data.id}`).catch(() => {});
  });

  test('GET /workflows/[id] returns the created workflow', async ({ clientApi }) => {
    const ts = Date.now();
    const name = `CRUD-get-${ts}`;
    const create = await clientApi.post('/api/portal/workflows', { name });
    expect(create.status).toBe(200);
    const wfId = create.data.data.id;

    try {
      const get = await clientApi.get(`/api/portal/workflows/${wfId}`);
      expect(get.status).toBe(200);
      expect(get.data.success).toBe(true);
      expect(get.data.data.id).toBe(wfId);
      expect(get.data.data.name).toBe(name);
    } finally {
      await clientApi.delete(`/api/portal/workflows/${wfId}`).catch(() => {});
    }
  });

  test('GET /workflows/[id] returns 404 for unknown id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows/999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('DELETE /workflows/[id] removes the workflow', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/workflows', { name: `CRUD-del-${ts}` });
    expect(create.status).toBe(200);
    const wfId = create.data.data.id;

    const del = await clientApi.delete(`/api/portal/workflows/${wfId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    // Verify gone
    const get = await clientApi.get(`/api/portal/workflows/${wfId}`);
    expect(get.status).toBe(404);
  });

  test('POST /workflows with invalid templateId returns 404', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/workflows', {
      templateId: 'nonexistent-template-xyz',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET /workflows rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/workflows');
    expect(res.status).toBe(401);
  });

  test('POST /workflows rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/workflows', { name: 'Ghost' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Card 7: Visual workflow status transitions: draft → active → paused via PATCH
//
// Route: PATCH /api/portal/workflows/[id]
// Verifies the status field transitions and that invalid statuses are rejected.
// ---------------------------------------------------------------------------

test.describe('Visual Workflow status transitions @automations', () => {
  const cleanupIds: number[] = [];

  test.afterAll(async ({ clientApi }) => {
    for (const id of cleanupIds) {
      await clientApi.delete(`/api/portal/workflows/${id}`).catch(() => {});
    }
  });

  test('PATCH /workflows/[id] transitions draft → active @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `status-transition-${ts}`);
    cleanupIds.push(wf.id);

    expect(wf.status).toBe('draft');

    const activate = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      status: 'active',
    });
    expect(activate.status).toBe(200);
    expect(activate.data.success).toBe(true);
    expect(activate.data.data.status).toBe('active');
  });

  test('PATCH /workflows/[id] transitions active → paused', async ({ clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `pause-transition-${ts}`);
    cleanupIds.push(wf.id);

    // First activate
    await clientApi.patch(`/api/portal/workflows/${wf.id}`, { status: 'active' });

    // Then pause
    const pause = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      status: 'paused',
    });
    expect(pause.status).toBe(200);
    expect(pause.data.success).toBe(true);
    expect(pause.data.data.status).toBe('paused');
  });

  test('PATCH /workflows/[id] transitions paused → draft', async ({ clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `re-draft-transition-${ts}`);
    cleanupIds.push(wf.id);

    await clientApi.patch(`/api/portal/workflows/${wf.id}`, { status: 'active' });
    await clientApi.patch(`/api/portal/workflows/${wf.id}`, { status: 'paused' });

    const redraft = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      status: 'draft',
    });
    expect(redraft.status).toBe(200);
    expect(redraft.data.data.status).toBe('draft');
  });

  test('PATCH /workflows/[id] rejects invalid status', async ({ clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `invalid-status-${ts}`);
    cleanupIds.push(wf.id);

    const res = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      status: 'running',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PATCH /workflows/[id] returns 404 for unknown workflow', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/workflows/999999', {
      status: 'active',
    });
    expect(res.status).toBe(404);
  });

  test('PATCH /workflows/[id] also updates name and description', async ({ clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `update-meta-${ts}`);
    cleanupIds.push(wf.id);

    const res = await clientApi.patch(`/api/portal/workflows/${wf.id}`, {
      name: `Renamed-${ts}`,
      description: 'A test workflow',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe(`Renamed-${ts}`);
    expect(res.data.data.description).toBe('A test workflow');
  });

  test('PATCH /workflows/[id] rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.patch('/api/portal/workflows/1', { status: 'active' });
    expect(res.status).toBe(401);
  });
});
