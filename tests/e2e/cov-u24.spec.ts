/**
 * cov-u24 — Projects / Tickets / Kanban coverage slice (indices 8–11)
 *
 * Card 8:  Project labels CRUD  — GET/POST /projects/:id/labels, PATCH/DELETE /labels/:id
 * Card 9:  Project sprints      — GET/POST /projects/:id/sprints
 * Card 10: Card checklist items — GET/POST /cards/:id/checklist
 * Card 11: Ticket detail/update — GET/PATCH /tickets/:id  (staff-only)
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

// ── shared helper: resolve first project id visible to the admin ──────────────

async function getFirstProjectId(
  api: import('./setup/api-client').ApiClient,
): Promise<number | null> {
  const res = await api.get('/api/portal/projects');
  const data = res.data?.data;
  const all: Array<{ id: number }> = Array.isArray(data)
    ? data
    : [...(data?.agency ?? []), ...(data?.private ?? [])];
  return all.length ? all[0].id : null;
}

async function getFirstColumnId(
  api: import('./setup/api-client').ApiClient,
  projectId: number,
): Promise<number | null> {
  const res = await api.get(`/api/portal/projects/${projectId}/columns`);
  const cols = res.data?.data as Array<{ id: number }> | undefined;
  return cols?.length ? cols[0].id : null;
}

async function createCard(
  api: import('./setup/api-client').ApiClient,
  columnId: number,
): Promise<{ id: number; cleanup: () => Promise<void> }> {
  const res = await api.post('/api/portal/cards', {
    columnId,
    title: `Cov-u24 Card ${Date.now()}`,
    description: 'E2E test card',
  });
  if (!res.data?.success) throw new Error(`Failed to create card: ${res.data?.message}`);
  const id = res.data.data.id as number;
  return {
    id,
    cleanup: async () => { await api.delete(`/api/portal/cards/${id}`).catch(() => {}); },
  };
}

// ── Card 8: Project labels ────────────────────────────────────────────────────

test.describe('Project labels CRUD @projects @labels', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/labels returns array', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const res = await adminApi.get(`/api/portal/projects/${projectId}/labels`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /projects/:id/labels creates a label', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const name = `Label ${Date.now()}`;
    const res = await adminApi.post(`/api/portal/projects/${projectId}/labels`, {
      name,
      color: '#ff5500',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.color).toBe('#ff5500');

    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/labels/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /projects/:id/labels rejects missing name', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const res = await adminApi.post(`/api/portal/projects/${projectId}/labels`, {
      name: '',
      color: '#123456',
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /labels/:id updates a label', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const create = await adminApi.post(`/api/portal/projects/${projectId}/labels`, {
      name: `PatchLabel ${Date.now()}`,
      color: '#aaaaaa',
    });
    const labelId = create.data.data.id;
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/labels/${labelId}`).catch(() => {});
    });

    const newName = `PatchLabel Updated ${Date.now()}`;
    const res = await adminApi.patch(`/api/portal/labels/${labelId}`, {
      name: newName,
      color: '#00ff00',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(newName);
    expect(res.data.data.color).toBe('#00ff00');
  });

  test('DELETE /labels/:id removes a label', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const create = await adminApi.post(`/api/portal/projects/${projectId}/labels`, {
      name: `DeleteLabel ${Date.now()}`,
      color: '#ff0000',
    });
    const labelId = create.data.data.id;

    const res = await adminApi.delete(`/api/portal/labels/${labelId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET /projects/:id/labels rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/labels');
    expect(res.status).toBe(401);
  });
});

// ── Card 9: Project sprints ───────────────────────────────────────────────────

test.describe('Project sprints GET/POST @projects @sprints', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects/:id/sprints returns sprints + backlog', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const res = await adminApi.get(`/api/portal/projects/${projectId}/sprints`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.sprints)).toBe(true);
    expect(Array.isArray(res.data.data.backlog)).toBe(true);
  });

  test('POST /projects/:id/sprints creates a sprint', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const name = `Sprint ${Date.now()}`;
    const res = await adminApi.post(`/api/portal/projects/${projectId}/sprints`, {
      name,
      goal: 'Deliver feature X',
      startDate: '2026-07-01',
      endDate: '2026-07-14',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.status).toBe('planning');

    const sprintId = res.data.data.id;
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/sprints/${sprintId}`).catch(() => {});
    });
  });

  test('POST /projects/:id/sprints rejects missing name', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }

    const res = await adminApi.post(`/api/portal/projects/${projectId}/sprints`, {
      name: '',
    });
    expect(res.status).toBe(400);
  });

  test('GET /projects/:id/sprints rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/sprints');
    expect(res.status).toBe(401);
  });

  test('client can read sprints for their own project', async ({ clientApi }) => {
    // The client account owns projects in the seed — just check we get 200 or 404
    const res = await clientApi.get('/api/portal/projects');
    const data = res.data?.data;
    const projects: Array<{ id: number }> = Array.isArray(data)
      ? data
      : [...(data?.agency ?? []), ...(data?.private ?? [])];
    if (!projects.length) { test.skip(); return; }

    const id = projects[0].id;
    const res2 = await clientApi.get(`/api/portal/projects/${id}/sprints`);
    expect([200, 404]).toContain(res2.status);
    if (res2.status === 200) {
      expect(res2.data.success).toBe(true);
    }
  });
});

// ── Card 10: Card checklist items ─────────────────────────────────────────────

test.describe('Card checklist items @kanban @checklist', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /cards/:id/checklist returns items array', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }
    const columnId = await getFirstColumnId(adminApi, projectId);
    if (!columnId) { test.skip(); return; }
    const { id: cardId, cleanup } = await createCard(adminApi, columnId);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/cards/${cardId}/checklist`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /cards/:id/checklist adds a checklist item', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }
    const columnId = await getFirstColumnId(adminApi, projectId);
    if (!columnId) { test.skip(); return; }
    const { id: cardId, cleanup } = await createCard(adminApi, columnId);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/cards/${cardId}/checklist`, {
      text: `Checklist item ${Date.now()}`,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.completed).toBe(false);
  });

  test('POST /cards/:id/checklist rejects empty text', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }
    const columnId = await getFirstColumnId(adminApi, projectId);
    if (!columnId) { test.skip(); return; }
    const { id: cardId, cleanup } = await createCard(adminApi, columnId);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/cards/${cardId}/checklist`, {
      text: '',
    });
    expect(res.status).toBe(400);
  });

  test('GET /cards/:id/checklist rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/cards/1/checklist');
    expect(res.status).toBe(401);
  });

  test('multiple checklist items accumulate in order', async ({ adminApi }) => {
    const projectId = await getFirstProjectId(adminApi);
    if (!projectId) { test.skip(); return; }
    const columnId = await getFirstColumnId(adminApi, projectId);
    if (!columnId) { test.skip(); return; }
    const { id: cardId, cleanup } = await createCard(adminApi, columnId);
    cleanups.push(cleanup);

    const ts = Date.now();
    await adminApi.post(`/api/portal/cards/${cardId}/checklist`, { text: `Step A ${ts}` });
    await adminApi.post(`/api/portal/cards/${cardId}/checklist`, { text: `Step B ${ts}` });

    const res = await adminApi.get(`/api/portal/cards/${cardId}/checklist`);
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBeGreaterThanOrEqual(2);
    const texts = (res.data.data as Array<{ text: string }>).map(i => i.text);
    expect(texts).toContain(`Step A ${ts}`);
    expect(texts).toContain(`Step B ${ts}`);
  });
});

// ── Card 11: Ticket detail / update (staff-only) ──────────────────────────────

test.describe('Ticket detail and update — staff-only @tickets @staff', () => {
  test('GET /tickets/:id returns ticket with assignee field (admin)', async ({ adminApi, clientApi }) => {
    // Create a ticket first via clientApi
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/tickets', {
      subject: `Detail Ticket ${ts}`,
      body: 'Body for detail test',
      category: 'general',
      priority: 'low',
    });
    expect(create.data.success).toBe(true);
    const ticketId = create.data.data.id as number;

    const res = await adminApi.get(`/api/portal/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(ticketId);
    expect(res.data.data.subject).toContain(`Detail Ticket ${ts}`);
    // assignee field always present (null when unassigned)
    expect('assignee' in res.data.data).toBe(true);
  });

  test('GET /tickets/:id returns 401 for unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tickets/1');
    expect(res.status).toBe(401);
  });

  test('GET /tickets/:id returns 401 for client role (staff-only endpoint)', async ({ clientApi, adminApi }) => {
    const ts = Date.now();
    const create = await adminApi.post('/api/portal/tickets', {
      subject: `Staff Only ${ts}`,
      body: 'Body',
      category: 'general',
      priority: 'medium',
    }).catch(() => null);
    // Create via clientApi instead (clients can create tickets)
    const c2 = await clientApi.post('/api/portal/tickets', {
      subject: `Staff Only ${ts}`,
      body: 'Body',
    });
    const ticketId = c2.data.data.id as number;

    const res = await clientApi.get(`/api/portal/tickets/${ticketId}`);
    // Client role must not access staff detail — expect 401 (requireStaff returns null → 401)
    expect(res.status).toBe(401);
    void create; // satisfy linter
  });

  test('PATCH /tickets/:id updates status (admin)', async ({ adminApi, clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/tickets', {
      subject: `Patch Status ${ts}`,
      body: 'Body for patch',
    });
    const ticketId = create.data.data.id as number;

    const res = await adminApi.patch(`/api/portal/tickets/${ticketId}`, {
      status: 'in_progress',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('in_progress');
  });

  test('PATCH /tickets/:id rejects invalid status', async ({ adminApi, clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/tickets', {
      subject: `Bad Status ${ts}`,
      body: 'Body',
    });
    const ticketId = create.data.data.id as number;

    const res = await adminApi.patch(`/api/portal/tickets/${ticketId}`, {
      status: 'bogus_status',
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /tickets/:id returns 401 for client role', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/tickets', {
      subject: `Client Patch ${ts}`,
      body: 'Body',
    });
    const ticketId = create.data.data.id as number;

    const res = await clientApi.patch(`/api/portal/tickets/${ticketId}`, {
      status: 'in_progress',
    });
    expect(res.status).toBe(401);
  });
});
