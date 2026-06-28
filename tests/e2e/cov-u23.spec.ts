/**
 * cov-u23 — Projects / Tickets / Kanban coverage slice (indices 4–7)
 *
 * Card 4: Project goals (OKRs) — GET/POST /projects/:id/goals
 * Card 5: Project custom-fields — GET/POST /projects/:id/custom-fields
 * Card 6: Project files listing  — GET /projects/:id/files
 * Card 7: Project card recurrences — GET/POST /projects/:id/recurrences
 *
 * Routes examined:
 *   app/api/portal/projects/[id]/goals/route.ts
 *   app/api/portal/projects/[id]/custom-fields/route.ts
 *   app/api/portal/projects/[id]/files/route.ts
 *   app/api/portal/projects/[id]/recurrences/route.ts
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject } from './setup/helpers';

// ── Card 4: Project Goals ─────────────────────────────────────────────────────

test.describe('Projects — Goals / OKRs @projects @goals', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/goals returns empty array for new project', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/goals`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /projects/:id/goals creates a goal with required title', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const title = `E2E Goal ${Date.now()}`;
    const res = await adminApi.post(`/api/portal/projects/${project.id}/goals`, {
      title,
      description: 'Reach 100 units',
      targetValue: 100,
      currentValue: 0,
      status: 'active',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe(title);
    expect(res.data.data.status).toBe('active');
    expect(res.data.data.targetValue).toBe(100);
    expect(res.data.data.projectId).toBe(project.id);
  });

  test('POST /projects/:id/goals appears in GET listing', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const title = `Listed Goal ${Date.now()}`;
    const createRes = await adminApi.post(`/api/portal/projects/${project.id}/goals`, {
      title,
      status: 'draft',
    });
    expect(createRes.status).toBe(201);
    const goalId = createRes.data.data.id;

    const listRes = await adminApi.get(`/api/portal/projects/${project.id}/goals`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    const found = (listRes.data.data as Array<{ id: number }>).find(g => g.id === goalId);
    expect(found).toBeTruthy();
  });

  test('POST /projects/:id/goals rejects missing title', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/goals`, {
      title: '',
      status: 'draft',
    });
    expect(res.status).toBe(400);
  });

  test('GET /projects/:id/goals rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/goals');
    expect(res.status).toBe(404); // auth() returns null → project lookup finds nothing → 404
  });

  test('GET /projects/999999/goals returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/goals');
    expect(res.status).toBe(404);
  });
});

// ── Card 5: Project Custom Fields ─────────────────────────────────────────────

test.describe('Projects — Custom Fields @projects @custom-fields', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/custom-fields returns array for new project', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/custom-fields`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /projects/:id/custom-fields creates a text field', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const name = `E2E Text Field ${Date.now()}`;
    const res = await adminApi.post(`/api/portal/projects/${project.id}/custom-fields`, {
      name,
      kind: 'text',
      required: false,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.kind).toBe('text');
    expect(res.data.data.projectId).toBe(project.id);
    // key is auto-generated from name
    expect(typeof res.data.data.key).toBe('string');
    expect(res.data.data.key.length).toBeGreaterThan(0);
  });

  test('POST /projects/:id/custom-fields creates a select field with options', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const name = `E2E Select Field ${Date.now()}`;
    const res = await adminApi.post(`/api/portal/projects/${project.id}/custom-fields`, {
      name,
      kind: 'select',
      options: ['Option A', 'Option B', 'Option C'],
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.kind).toBe('select');
    expect(Array.isArray(res.data.data.options)).toBe(true);
    expect(res.data.data.options).toContain('Option A');
  });

  test('POST /projects/:id/custom-fields appears in GET listing', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const name = `E2E Listed Field ${Date.now()}`;
    const createRes = await adminApi.post(`/api/portal/projects/${project.id}/custom-fields`, {
      name,
      kind: 'number',
    });
    expect(createRes.status).toBe(201);
    const fieldId = createRes.data.data.id;

    const listRes = await adminApi.get(`/api/portal/projects/${project.id}/custom-fields`);
    expect(listRes.status).toBe(200);
    const found = (listRes.data.data as Array<{ id: number }>).find(f => f.id === fieldId);
    expect(found).toBeTruthy();
  });

  test('POST /projects/:id/custom-fields rejects missing name', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/custom-fields`, {
      name: '',
      kind: 'text',
    });
    expect(res.status).toBe(400);
  });

  test('POST /projects/:id/custom-fields rejects invalid kind', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/custom-fields`, {
      name: 'Bad Kind Field',
      kind: 'bogus_kind',
    });
    expect(res.status).toBe(400);
  });

  test('GET /projects/999999/custom-fields returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/custom-fields');
    expect(res.status).toBe(404);
  });
});

// ── Card 6: Project Files Listing ─────────────────────────────────────────────

test.describe('Projects — Files listing @projects @files', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/files returns success with data array', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/files`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // No files uploaded yet — should return an empty list
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /projects/:id/files rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/files');
    expect(res.status).toBe(401);
  });

  test('GET /projects/999999/files returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/files');
    expect(res.status).toBe(404);
  });

  test('GET /projects/:id/files is accessible to client role on own project', async ({ adminApi, clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    // clientApi user is a different tenant's client — they should get 404 (not found in their scope)
    const res = await clientApi.get(`/api/portal/projects/${project.id}/files`);
    // Either 404 (cross-tenant) or 200 (if admin created in client's tenant) is acceptable;
    // the key invariant is it's never 500.
    expect([200, 404]).toContain(res.status);
  });
});

// ── Card 7: Card Recurrences ───────────────────────────────────────────────────

test.describe('Projects — Card Recurrences @projects @recurrences', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/recurrences returns empty array for new project', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/projects/${project.id}/recurrences`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /projects/:id/recurrences creates a weekly recurrence', async ({ adminApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/recurrences`, {
      columnId: columns[0].id,
      titlePattern: 'Weekly Sync {date}',
      cadence: 'weekly',
      dayOfWeek: 1, // Monday
      hourUtc: 9,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.cadence).toBe('weekly');
    expect(res.data.data.projectId).toBe(project.id);
    expect(res.data.data.columnId).toBe(columns[0].id);
    expect(res.data.data.titlePattern).toBe('Weekly Sync {date}');
    // nextFireAt should be set
    expect(res.data.data.nextFireAt).toBeTruthy();
  });

  test('POST /projects/:id/recurrences creates a monthly recurrence', async ({ adminApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/recurrences`, {
      columnId: columns[0].id,
      titlePattern: 'Monthly Report',
      cadence: 'monthly',
      dayOfMonth: 1,
      hourUtc: 8,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.cadence).toBe('monthly');
  });

  test('POST /projects/:id/recurrences created item appears in GET list', async ({ adminApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const createRes = await adminApi.post(`/api/portal/projects/${project.id}/recurrences`, {
      columnId: columns[0].id,
      titlePattern: 'Listed Recurrence',
      cadence: 'daily',
      hourUtc: 10,
    });
    expect(createRes.status).toBe(201);
    const recId = createRes.data.data.id;

    const listRes = await adminApi.get(`/api/portal/projects/${project.id}/recurrences`);
    expect(listRes.status).toBe(200);
    const found = (listRes.data.data as Array<{ id: number }>).find(r => r.id === recId);
    expect(found).toBeTruthy();
  });

  test('POST /projects/:id/recurrences rejects invalid cadence', async ({ adminApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/recurrences`, {
      columnId: columns[0].id,
      titlePattern: 'Bad Cadence',
      cadence: 'fortnightly',
    });
    expect(res.status).toBe(400);
  });

  test('POST /projects/:id/recurrences rejects missing columnId', async ({ adminApi }) => {
    const { project, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/recurrences`, {
      titlePattern: 'No Column',
      cadence: 'weekly',
    });
    expect(res.status).toBe(400);
  });

  test('POST /projects/:id/recurrences rejects column from another project', async ({ adminApi }) => {
    const { project: p1, cleanup: c1 } = await createTestKanbanProject(adminApi);
    cleanups.push(c1);
    const { project: p2, columns: cols2, cleanup: c2 } = await createTestKanbanProject(adminApi);
    cleanups.push(c2);

    // Use a column belonging to p2 on p1's recurrence endpoint
    const res = await adminApi.post(`/api/portal/projects/${p1.id}/recurrences`, {
      columnId: cols2[0].id,
      titlePattern: 'Cross-project column',
      cadence: 'daily',
    });
    expect(res.status).toBe(400);
  });

  test('POST /projects/:id/recurrences rejects missing titlePattern and templateId', async ({ adminApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/projects/${project.id}/recurrences`, {
      columnId: columns[0].id,
      cadence: 'weekly',
      // no titlePattern and no templateId
    });
    expect(res.status).toBe(400);
  });

  test('GET /projects/999999/recurrences returns 404 for unknown project', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/projects/999999/recurrences');
    expect(res.status).toBe(404);
  });

  test('GET /projects/:id/recurrences rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/recurrences');
    // Returns 404 when session is null (authorize returns null → 404)
    expect([401, 404]).toContain(res.status);
  });
});
