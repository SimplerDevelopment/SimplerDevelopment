/**
 * Portal Projects & Tickets API E2E Tests
 *
 * Tests for /api/portal/projects, /portal/tickets, /portal/cards
 * Note: Card creation (POST /portal/cards) requires admin/employee role,
 * so those tests use adminApi. Client-facing read tests use clientApi.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Projects @projects @critical', () => {
  test('GET /projects lists client projects', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/projects');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /projects rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Tickets @tickets @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /tickets lists client tickets', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tickets');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /tickets creates a new support ticket', async ({ clientApi }) => {
    const subject = `Test Ticket ${Date.now()}`;
    const res = await clientApi.post('/api/portal/tickets', {
      subject,
      body: 'This is an E2E test ticket body.',
      category: 'technical',
      priority: 'medium',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.subject).toBe(subject);
    expect(res.data.data.status).toBe('open');
    expect(res.data.data.number).toBeTruthy();

    // No delete endpoint for tickets — track for leak cleanup
  });

  test('POST /tickets rejects missing subject/body', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/tickets', {
      subject: '',
      body: '',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /tickets/:id/messages adds a message to a ticket', async ({ clientApi }) => {
    // Create a ticket first
    const ticket = await clientApi.post('/api/portal/tickets', {
      subject: `Msg Test ${Date.now()}`,
      body: 'Initial message',
    });
    expect(ticket.status).toBe(200);
    const ticketId = ticket.data.data.id;

    // Add a follow-up message
    const res = await clientApi.post(`/api/portal/tickets/${ticketId}/messages`, {
      body: 'Follow-up message from client',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.body).toBe('Follow-up message from client');
    expect(res.data.data.ticketId).toBe(ticketId);
  });

  test('POST /tickets/:id/messages rejects empty body', async ({ clientApi }) => {
    const ticket = await clientApi.post('/api/portal/tickets', {
      subject: `Empty Msg Test ${Date.now()}`,
      body: 'Need a ticket first',
    });
    const ticketId = ticket.data.data.id;

    const res = await clientApi.post(`/api/portal/tickets/${ticketId}/messages`, {
      body: '',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /tickets rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tickets');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Kanban Columns & Cards @projects @kanban', () => {
  // These tests depend on an existing project. We read projects first.
  // Card creation requires admin/employee role.

  test('GET /projects/:id/columns returns columns for a project', async ({ clientApi }) => {
    const projects = await clientApi.get('/api/portal/projects');
    if (!projects.data.data?.length) {
      test.skip(); // no projects seeded
      return;
    }
    const projectId = projects.data.data[0].id;

    const res = await clientApi.get(`/api/portal/projects/${projectId}/columns`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /projects/:id/columns rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/projects/1/columns');
    expect(res.status).toBe(401);
  });

  test('POST /cards rejects client role (requires admin/employee)', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/cards', {
      columnId: 1,
      title: 'Should Fail',
    });
    expect(res.status).toBe(403);
  });

  test('POST /cards rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/cards', {
      columnId: 1,
      title: 'Should Fail',
    });
    expect(res.status).toBe(401);
  });
});
