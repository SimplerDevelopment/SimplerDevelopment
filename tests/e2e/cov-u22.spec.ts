/**
 * cov-u22 — Projects Tickets Kanban E2E coverage
 *
 * Slice: indices [0..3] from the "Projects Tickets Kanban" To-Test backlog.
 * Cards:
 *   0 - GET /projects/:id/velocity returns sprint velocity data
 *   1 - GET /projects/:id/cfd returns cumulative flow diagram data
 *   2 - GET /projects/:id/cycle-time returns cycle time rows
 *   3 - GET+POST /projects/:id/saved-views CRUD
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject } from './setup/helpers';

// ── Velocity ──────────────────────────────────────────────────────────────────

test.describe('Projects — Velocity @projects @velocity', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/velocity returns success with data shape', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/velocity`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // No completed sprints yet, so rows should be empty
    expect(Array.isArray(res.data.data.rows)).toBe(true);
    expect(typeof res.data.data.averageCommitted).toBe('number');
    expect(typeof res.data.data.averageCompleted).toBe('number');
  });

  test('GET /projects/:id/velocity?limit=3 accepts limit param', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/velocity?limit=3`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.rows)).toBe(true);
  });

  test('GET /projects/999999/velocity returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/velocity');
    expect(res.status).toBe(404);
  });

  test('GET /projects/:id/velocity rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/velocity');
    expect(res.status).toBe(401);
  });
});

// ── Cumulative Flow Diagram ────────────────────────────────────────────────────

test.describe('Projects — CFD (Cumulative Flow Diagram) @projects @cfd', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/cfd returns success with columns + days shape', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/cfd`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.columns)).toBe(true);
    expect(Array.isArray(res.data.data.days)).toBe(true);
  });

  test('GET /projects/:id/cfd?days=7 accepts days param', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/cfd?days=7`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET /projects/999999/cfd returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/cfd');
    expect(res.status).toBe(404);
  });

  test('GET /projects/:id/cfd rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/cfd');
    expect(res.status).toBe(401);
  });
});

// ── Cycle Time ────────────────────────────────────────────────────────────────

test.describe('Projects — Cycle Time @projects @cycle-time', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/cycle-time returns success with rows + averages shape', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/cycle-time`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // No done cards yet, so rows should be empty
    expect(Array.isArray(res.data.data.rows)).toBe(true);
    expect(typeof res.data.data.averageLeadDays).toBe('number');
    expect(typeof res.data.data.averageCycleDays).toBe('number');
  });

  test('GET /projects/999999/cycle-time returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/cycle-time');
    expect(res.status).toBe(404);
  });

  test('GET /projects/:id/cycle-time rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/cycle-time');
    expect(res.status).toBe(401);
  });
});

// ── Saved Views ───────────────────────────────────────────────────────────────

test.describe('Projects — Saved Views @projects @saved-views', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /projects/:id/saved-views creates a private view @critical', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const ts = Date.now();
    const res = await adminApi.post(`/api/portal/projects/${project.id}/saved-views`, {
      name: `My View ${ts}`,
      scope: 'board',
      filterJson: { priority: 'high' },
      shared: false,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.name).toBe(`My View ${ts}`);
    expect(res.data.data.scope).toBe('board');
  });

  test('GET /projects/:id/saved-views lists views including the created one', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const ts = Date.now();
    const createRes = await adminApi.post(`/api/portal/projects/${project.id}/saved-views`, {
      name: `Listed View ${ts}`,
      scope: 'backlog',
      filterJson: {},
      shared: false,
    });
    expect(createRes.status).toBe(201);
    const viewId = createRes.data.data.id;

    const listRes = await adminApi.get(`/api/portal/projects/${project.id}/saved-views`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    expect(Array.isArray(listRes.data.data)).toBe(true);
    const found = listRes.data.data.find((v: { id: number }) => v.id === viewId);
    expect(found).toBeTruthy();
  });

  test('GET /projects/:id/saved-views?scope=board filters by scope', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const ts = Date.now();
    await adminApi.post(`/api/portal/projects/${project.id}/saved-views`, {
      name: `Board View ${ts}`,
      scope: 'board',
      filterJson: {},
      shared: false,
    });

    const res = await adminApi.get(`/api/portal/projects/${project.id}/saved-views?scope=board`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    for (const v of res.data.data as Array<{ scope: string }>) {
      expect(v.scope).toBe('board');
    }
  });

  test('POST /projects/:id/saved-views rejects missing name', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/saved-views`, {
      name: '',
      scope: 'board',
    });
    expect(res.status).toBe(400);
  });

  test('POST /projects/:id/saved-views rejects invalid scope', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/saved-views`, {
      name: 'Bad Scope View',
      scope: 'bogus',
    });
    expect(res.status).toBe(400);
  });

  test('GET /projects/999999/saved-views returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/saved-views');
    expect(res.status).toBe(404);
  });

  test('GET /projects/:id/saved-views rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/saved-views');
    expect(res.status).toBe(404); // returns 404 for unauthenticated (auth returns null → access null)
  });
});
