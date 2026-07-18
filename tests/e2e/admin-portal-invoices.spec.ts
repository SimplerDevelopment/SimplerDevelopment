/**
 * Admin Portal Invoices API E2E Tests
 *
 * Tests for /api/admin/portal/invoices CRUD
 * All endpoints require admin/employee role.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Admin Portal Invoices @admin @invoices @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /invoices lists all invoices with client info', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/invoices');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /invoices creates an invoice with line items', async ({ adminApi }) => {
    // Need a client
    const clients = await adminApi.get('/api/admin/portal/clients');
    expect(clients.status).toBe(200);
    if (!clients.data.data?.length) {
      test.skip();
      return;
    }
    const clientId = clients.data.data[0].id;

    const res = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      notes: 'E2E test invoice',
      items: [
        { description: 'Web Development', quantity: 10, unitPrice: 15000 },
        { description: 'Design Review', quantity: 2, unitPrice: 7500 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.invoice.number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(res.data.data.invoice.status).toBe('draft');
    expect(res.data.data.invoice.total).toBe(10 * 15000 + 2 * 7500);
    expect(res.data.data.items.length).toBe(2);

    // No direct delete for invoices — they accumulate
  });

  test('POST /invoices rejects missing clientId', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/invoices', {
      items: [{ description: 'Test', quantity: 1, unitPrice: 1000 }],
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /invoices rejects empty items', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/invoices', {
      clientId: 1,
      items: [],
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /invoices/:id returns invoice with items', async ({ adminApi }) => {
    // Create an invoice first
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }

    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId: clients.data.data[0].id,
      items: [{ description: 'E2E Item', quantity: 1, unitPrice: 5000 }],
    });
    expect(create.status).toBe(200);
    const invoiceId = create.data.data.invoice.id;

    const res = await adminApi.get(`/api/admin/portal/invoices/${invoiceId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('invoice');
    expect(res.data.data).toHaveProperty('items');
    expect(res.data.data.items.length).toBe(1);
  });

  test('GET /invoices/:id returns 404 for non-existent', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/invoices/999999');
    expect(res.status).toBe(404);
  });

  test('PATCH /invoices/:id updates invoice status', async ({ adminApi }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }

    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId: clients.data.data[0].id,
      items: [{ description: 'Status Test', quantity: 1, unitPrice: 1000 }],
    });
    expect(create.status).toBe(200);
    const invoiceId = create.data.data.invoice.id;

    const res = await adminApi.patch(`/api/admin/portal/invoices/${invoiceId}`, {
      status: 'sent',
      notes: 'Sent to client',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('sent');
  });

  test('GET /invoices rejects non-admin (client role)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/invoices');
    expect(res.status).toBe(401);
  });

  test('GET /invoices rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/invoices');
    expect(res.status).toBe(401);
  });
});
