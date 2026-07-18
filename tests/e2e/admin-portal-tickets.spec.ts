/**
 * Admin Portal Tickets API E2E Tests
 *
 * Tests for /api/admin/portal/tickets listing and status management
 * All endpoints require admin/employee role.
 */
import { test, expect } from './setup/fixtures';

test.describe('Admin Portal Tickets @admin @tickets', () => {
  test('GET /tickets lists all tickets with client info', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/tickets');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    if (res.data.data.length > 0) {
      expect(res.data.data[0]).toHaveProperty('subject');
      expect(res.data.data[0]).toHaveProperty('status');
      expect(res.data.data[0]).toHaveProperty('company');
      expect(res.data.data[0]).toHaveProperty('clientName');
    }
  });

  test('PATCH /tickets updates ticket status and priority', async ({ adminApi, clientApi }) => {
    // Create a ticket via client
    const ticket = await clientApi.post('/api/portal/tickets', {
      subject: `Admin Update Test ${Date.now()}`,
      body: 'Testing admin status update',
    });
    expect(ticket.status).toBe(200);
    const ticketId = ticket.data.data.id;

    // Admin updates status
    const res = await adminApi.patch('/api/admin/portal/tickets', {
      id: ticketId,
      status: 'in_progress',
      priority: 'high',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('in_progress');
    expect(res.data.data.priority).toBe('high');
  });

  test('PATCH /tickets can resolve a ticket', async ({ adminApi, clientApi }) => {
    const ticket = await clientApi.post('/api/portal/tickets', {
      subject: `Resolve Test ${Date.now()}`,
      body: 'Will be resolved',
    });
    const ticketId = ticket.data.data.id;

    const res = await adminApi.patch('/api/admin/portal/tickets', {
      id: ticketId,
      status: 'resolved',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('resolved');
    expect(res.data.data.resolvedAt).toBeTruthy();
  });

  test('GET /tickets rejects non-admin (client role)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/tickets');
    expect(res.status).toBe(401);
  });

  test('GET /tickets rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/tickets');
    expect(res.status).toBe(401);
  });
});
