/**
 * Portal Support Tickets API E2E Tests
 *
 * Tests for /api/portal/tickets and ticket messages.
 * All tests are rerunnable.
 */
import { test, expect } from './setup/fixtures';
import { createTestTicket } from './setup/helpers';

test.describe('Portal Tickets @tickets @critical', () => {
  test('POST creates a ticket', async ({ clientApi }) => {
    const { ticket } = await createTestTicket(clientApi);

    expect(ticket).toHaveProperty('id');
    expect(ticket).toHaveProperty('number');
    expect(ticket.subject).toContain('Test Ticket');
    expect(ticket.status).toBe('open');
    expect(ticket.category).toBe('general');
    expect(ticket.priority).toBe('medium');
  });

  test('POST creates a ticket with custom priority and category', async ({ clientApi }) => {
    const { ticket } = await createTestTicket(clientApi, {
      subject: `Urgent Ticket ${Date.now()}`,
      body: 'Urgent issue body',
      priority: 'high',
      category: 'billing',
    });

    expect(ticket.priority).toBe('high');
    expect(ticket.category).toBe('billing');
  });

  test('GET /tickets lists tickets', async ({ clientApi }) => {
    await createTestTicket(clientApi);

    const res = await clientApi.get('/api/portal/tickets');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('POST rejects missing subject', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/tickets', {
      subject: '',
      body: 'Body without subject',
    });
    expect(res.status).toBe(400);
  });

  test('POST rejects missing body', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/tickets', {
      subject: 'Subject without body',
      body: '',
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tickets');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Ticket Messages @tickets @messages', () => {
  test('POST /tickets/[id]/messages adds a message', async ({ clientApi }) => {
    const { ticket } = await createTestTicket(clientApi);

    const res = await clientApi.post(`/api/portal/tickets/${ticket.id}/messages`, {
      body: `Reply message ${Date.now()}`,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.body).toContain('Reply message');
  });

  test('multiple messages can be posted', async ({ clientApi }) => {
    const { ticket } = await createTestTicket(clientApi);

    const r1 = await clientApi.post(`/api/portal/tickets/${ticket.id}/messages`, { body: 'Follow up 1' });
    expect(r1.status).toBe(200);
    expect(r1.data.success).toBe(true);

    const r2 = await clientApi.post(`/api/portal/tickets/${ticket.id}/messages`, { body: 'Follow up 2' });
    expect(r2.status).toBe(200);
    expect(r2.data.success).toBe(true);
    expect(r2.data.data.id).not.toBe(r1.data.data.id);
  });

  test('POST rejects empty message body', async ({ clientApi }) => {
    const { ticket } = await createTestTicket(clientApi);

    const res = await clientApi.post(`/api/portal/tickets/${ticket.id}/messages`, { body: '' });
    expect(res.status).toBe(400);
  });
});
