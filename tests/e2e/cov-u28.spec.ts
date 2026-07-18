/**
 * E2E coverage for Automations / Workflows — unit-28 slice (indices 8–11).
 *
 * Cards covered:
 *   8. Visual workflow test-run endpoint returns completed status and step logs
 *   9. Visual workflow run history: GET /workflows/[id]/runs returns runs array
 *  10. Visual workflow templates: GET /workflows/templates returns template list;
 *      POST with templateId clones graph
 *  11. Schedule preview: POST /automations/preview-schedule returns description
 *      + nextRunAt for valid schedule
 */
import { test, expect } from './setup/fixtures';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a blank workflow and return its id + cleanup fn. */
async function createWorkflow(
  clientApi: { post: (path: string, body: unknown) => Promise<{ status: number; data: Record<string, unknown> & { data?: { id?: number } & Record<string, unknown> } }> },
  name: string,
): Promise<{ id: number; cleanup: () => Promise<void> }> {
  const res = await clientApi.post('/api/portal/workflows', { name });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`createWorkflow failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const id = (res.data.data as { id: number }).id;
  return {
    id,
    cleanup: async () => {
      await (clientApi as unknown as { delete: (path: string) => Promise<unknown> })
        .delete(`/api/portal/workflows/${id}`)
        .catch(() => {});
    },
  };
}

// ── Card 8: test-run endpoint ─────────────────────────────────────────────────

test.describe('Workflows — test-run endpoint @automations', () => {
  let workflowId: number;
  let cleanupWorkflow: () => Promise<void>;

  test.beforeEach(async ({ clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `test-run-wf-${ts}`);
    workflowId = wf.id;
    cleanupWorkflow = wf.cleanup;
  });

  test.afterEach(async () => {
    await cleanupWorkflow?.();
  });

  test('POST /workflows/[id]/test-run returns success + data with status field @critical', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/workflows/${workflowId}/test-run`, {});
    // 200 with success shape
    expect(res.status).toBe(200);
    expect(typeof res.data.success).toBe('boolean');
    expect(res.data.data).toBeDefined();
    // The result object must carry a `status` field (e.g. "completed")
    const result = res.data.data as { status: string };
    expect(typeof result.status).toBe('string');
  });

  test('POST /workflows/[id]/test-run with unknown id returns 404', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/workflows/999999999/test-run', {});
    expect(res.status).toBe(404);
  });

  test('POST /workflows/[id]/test-run rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/workflows/${workflowId}/test-run`, {});
    expect(res.status).toBe(401);
  });
});

// ── Card 9: run history ───────────────────────────────────────────────────────

test.describe('Workflows — run history @automations', () => {
  let workflowId: number;
  let cleanupWorkflow: () => Promise<void>;

  test.beforeEach(async ({ clientApi }) => {
    const ts = Date.now();
    const wf = await createWorkflow(clientApi, `runs-hist-${ts}`);
    workflowId = wf.id;
    cleanupWorkflow = wf.cleanup;
  });

  test.afterEach(async () => {
    await cleanupWorkflow?.();
  });

  test('GET /workflows/[id]/runs returns runs array @critical', async ({ clientApi }) => {
    // Trigger a test-run so there's at least one run entry.
    await clientApi.post(`/api/portal/workflows/${workflowId}/test-run`, {});

    const res = await clientApi.get(`/api/portal/workflows/${workflowId}/runs`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // At minimum, the run we just triggered should be present.
    expect((res.data.data as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('GET /workflows/[id]/runs for unknown workflow returns 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows/999999999/runs');
    expect(res.status).toBe(404);
  });

  test('GET /workflows/[id]/runs rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/workflows/${workflowId}/runs`);
    expect(res.status).toBe(401);
  });
});

// ── Card 10: workflow templates ───────────────────────────────────────────────

test.describe('Workflows — templates @automations', () => {
  let clonedWorkflowId: number | null = null;

  test.afterEach(async ({ clientApi }) => {
    if (clonedWorkflowId != null) {
      await (clientApi as unknown as { delete: (path: string) => Promise<unknown> })
        .delete(`/api/portal/workflows/${clonedWorkflowId}`)
        .catch(() => {});
      clonedWorkflowId = null;
    }
  });

  test('GET /workflows/templates returns non-empty template list @critical', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/workflows/templates');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect((res.data.data as unknown[]).length).toBeGreaterThan(0);
    // Each template has required shape fields
    const first = (res.data.data as Array<{ id: string; name: string; triggerKind: string }>)[0];
    expect(typeof first.id).toBe('string');
    expect(typeof first.name).toBe('string');
    expect(typeof first.triggerKind).toBe('string');
  });

  test('POST /workflows with templateId clones the template into a draft @critical', async ({ clientApi }) => {
    // Fetch the first available template id
    const templatesRes = await clientApi.get('/api/portal/workflows/templates');
    expect(templatesRes.status).toBe(200);
    const templates = templatesRes.data.data as Array<{ id: string; name: string }>;
    expect(templates.length).toBeGreaterThan(0);
    const templateId = templates[0].id;

    const ts = Date.now();
    const cloneRes = await clientApi.post('/api/portal/workflows', {
      templateId,
      name: `clone-${ts}`,
    });
    expect(cloneRes.status).toBe(200);
    expect(cloneRes.data.success).toBe(true);
    const cloned = cloneRes.data.data as { id: number; status: string; graph: { nodes: unknown[] } };
    expect(cloned.status).toBe('draft');
    // Graph was populated from template — should have at least the trigger node
    expect(Array.isArray(cloned.graph?.nodes)).toBe(true);
    expect(cloned.graph.nodes.length).toBeGreaterThan(0);
    clonedWorkflowId = cloned.id;
  });

  test('POST /workflows with unknown templateId returns 404', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/workflows', {
      templateId: 'no-such-template-xyz',
    });
    expect(res.status).toBe(404);
  });

  test('GET /workflows/templates rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/workflows/templates');
    expect(res.status).toBe(401);
  });
});

// ── Card 11: schedule preview ─────────────────────────────────────────────────

test.describe('Automations — schedule preview @automations', () => {
  test('POST /automations/preview-schedule with daily schedule returns description + nextRunAt @critical', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'daily', time: '09:00' },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.description).toBe('string');
    expect(res.data.description).toContain('09:00');
    // nextRunAt is an ISO string or null
    expect(res.data.nextRunAt === null || typeof res.data.nextRunAt === 'string').toBe(true);
  });

  test('POST /automations/preview-schedule with weekly schedule returns description', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'weekly', time: '08:30', dayOfWeek: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // Should mention Monday (dayOfWeek=1)
    expect(typeof res.data.description).toBe('string');
    expect(res.data.description.toLowerCase()).toContain('monday');
  });

  test('POST /automations/preview-schedule with cron schedule returns description', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'cron', cronExpression: '*/15 * * * *' },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.description).toBe('string');
  });

  test('POST /automations/preview-schedule with invalid cadence returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'yearly' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /automations/preview-schedule with missing schedule returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /automations/preview-schedule with bad time format returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'daily', time: '9am' },
    });
    expect(res.status).toBe(400);
  });

  test('POST /automations/preview-schedule rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/automations/preview-schedule', {
      schedule: { cadence: 'daily', time: '09:00' },
    });
    expect(res.status).toBe(401);
  });
});
