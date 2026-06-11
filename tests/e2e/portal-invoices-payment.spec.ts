/**
 * Portal Invoices — Stripe Pay Path E2E Tests
 *
 * Covers the full invoicing & payment flow:
 *   1. Admin creates a seeded invoice with line items (admin route, staff-only)
 *   2. Assert invoice shape: number format, line items, subtotal/tax/total math
 *   3. Assert client can see the invoice in billing summary (sent status visible)
 *   4. Assert draft invoice rejects checkout (status gate)
 *   5. Advance to "sent" status via PATCH (if not already sent at creation)
 *   6. Call the Stripe checkout endpoint as client — assert session URL returned
 *   7. Assert stripeCheckoutSessionId is written back to the invoice row
 *   8. Advance invoice to "paid" via admin PATCH — assert status changes; paidAt
 *      is null (no webhook roundtrip in E2E — webhook sets paidAt)
 *   9. Assert paid invoice checkout call is rejected (status gate: not payable)
 *  10. Auth rejection: client cannot access admin invoice routes
 *  11. Unauthenticated rejection: checkout endpoint rejects unauthenticated
 *
 * Seeding: uses adminApi to create invoices; checkout is called as clientApi.
 * Cleanup: no DELETE endpoint exists for invoices — PATCH to 'cancelled'
 *   to neutralise records. Accepted test-environment leak documented in recon.
 *
 * Stripe guard: checkout tests are skipped when STRIPE_SECRET_KEY is absent
 *   or is not a test key (sk_test_...).
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PREFIX = 'INV-PAY-E2E-';

test.describe('Portal Invoices — Stripe Pay Path @invoices @billing @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Neutralise an invoice by patching it to 'cancelled'.
   * There is no DELETE endpoint for invoices (confirmed by mirror spec comment).
   */
  async function cancelInvoice(
    adminApi: ReturnType<typeof Object.create>,
    invoiceId: number,
  ) {
    await adminApi
      .patch(`/api/admin/portal/invoices/${invoiceId}`, { status: 'cancelled' })
      .catch(() => {});
  }

  // ── tests ──────────────────────────────────────────────────────────────────

  test('POST /admin/portal/invoices creates invoice with correct line-item math', async ({
    adminApi,
  }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    expect(clients.status).toBe(200);
    if (!clients.data.data?.length) {
      test.skip();
      return;
    }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    const res = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      notes: `${PREFIX}math-check-${ts}`,
      tax: 500, // $5 in cents
      items: [
        { description: `${PREFIX}Web Dev-${ts}`, quantity: 5, unitPrice: 20000 }, // $100 each → $500
        { description: `${PREFIX}Design-${ts}`, quantity: 2, unitPrice: 10000 }, // $100 each → $200
      ],
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const { invoice, items } = res.data.data as {
      invoice: {
        id: number;
        number: string;
        status: string;
        subtotal: number;
        tax: number;
        total: number;
        paidAt: string | null;
        stripeCheckoutSessionId: string | null;
      };
      items: Array<{
        id: number;
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
    };

    // Number format: INV-YYYY-NNNN
    expect(invoice.number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(invoice.status).toBe('draft');

    // Line-item totals: each item.total = unitPrice * quantity
    expect(items.length).toBe(2);
    const itemTotals = items.map((i) => i.unitPrice * i.quantity);
    items.forEach((item, idx) => {
      expect(item.total).toBe(itemTotals[idx]);
    });

    // Invoice-level math: subtotal = sum of item totals, total = subtotal + tax
    const expectedSubtotal = 5 * 20000 + 2 * 10000; // 100000 + 20000 = 120000
    expect(invoice.subtotal).toBe(expectedSubtotal);
    expect(invoice.tax).toBe(500);
    expect(invoice.total).toBe(expectedSubtotal + 500);

    // paidAt is null for a newly-created draft
    expect(invoice.paidAt).toBeNull();
    expect(invoice.stripeCheckoutSessionId).toBeNull();

    cleanups.push(async () => cancelInvoice(adminApi, invoice.id));
  });

  test('POST /admin/portal/invoices with status:sent creates a payable invoice', async ({
    adminApi,
  }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    const res = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      status: 'sent',
      notes: `${PREFIX}sent-at-creation-${ts}`,
      items: [{ description: `${PREFIX}Consulting-${ts}`, quantity: 1, unitPrice: 30000 }],
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.invoice.status).toBe('sent');

    cleanups.push(async () => cancelInvoice(adminApi, res.data.data.invoice.id));
  });

  test('GET /admin/portal/invoices/:id returns itemised invoice after creation', async ({
    adminApi,
  }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      notes: `${PREFIX}get-single-${ts}`,
      items: [
        { description: `${PREFIX}Item A-${ts}`, quantity: 3, unitPrice: 5000 },
        { description: `${PREFIX}Item B-${ts}`, quantity: 1, unitPrice: 8000 },
      ],
    });
    expect(create.status).toBe(200);
    const invoiceId: number = create.data.data.invoice.id;

    cleanups.push(async () => cancelInvoice(adminApi, invoiceId));

    const res = await adminApi.get(`/api/admin/portal/invoices/${invoiceId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('invoice');
    expect(res.data.data).toHaveProperty('items');
    expect(res.data.data.items.length).toBe(2);

    // Assert item shapes
    const items = res.data.data.items as Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    items.forEach((item) => {
      expect(item.total).toBe(item.quantity * item.unitPrice);
    });
  });

  test('PATCH /admin/portal/invoices/:id advances draft to sent', async ({ adminApi }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      notes: `${PREFIX}patch-to-sent-${ts}`,
      items: [{ description: `${PREFIX}Patch Test-${ts}`, quantity: 1, unitPrice: 12000 }],
    });
    expect(create.status).toBe(200);
    const invoiceId: number = create.data.data.invoice.id;

    cleanups.push(async () => cancelInvoice(adminApi, invoiceId));

    // Invoice starts as draft
    expect(create.data.data.invoice.status).toBe('draft');

    const patch = await adminApi.patch(`/api/admin/portal/invoices/${invoiceId}`, {
      status: 'sent',
      notes: 'Advanced to sent for E2E test',
    });
    expect(patch.status).toBe(200);
    expect(patch.data.success).toBe(true);
    // Status actually changed
    expect(patch.data.data.status).toBe('sent');
  });

  test('GET /portal/settings/billing includes sent invoice in client billing summary', async ({
    adminApi,
    clientApi,
  }) => {
    // The clientApi session is the `client@example.com` seed account. To assert the
    // invoice actually surfaces in *that* client's billing summary, we must create it
    // against the SAME clientId — not a blind clients.data.data[0]. The admin clients
    // list exposes userEmail, so resolve the seed client deterministically.
    const clients = await adminApi.get('/api/admin/portal/clients');
    expect(clients.status).toBe(200);
    if (!clients.data.data?.length) { test.skip(); return; }

    const seedClient = clients.data.data.find(
      (c: { userEmail?: string }) => c.userEmail === 'client@example.com',
    );
    // Without a deterministic match we cannot meaningfully assert visibility — skip
    // rather than degrade into assertion theater.
    if (!seedClient) { test.skip(); return; }
    const clientId: number = seedClient.id;
    const ts = Date.now();

    // The billing summary returns the 10 most-recent invoices (desc createdAt).
    // Creating one now puts it at the top, so it is guaranteed to be in the window.
    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      status: 'sent',
      notes: `${PREFIX}billing-visible-${ts}`,
      items: [{ description: `${PREFIX}Visible Item-${ts}`, quantity: 1, unitPrice: 25000 }],
    });
    expect(create.status).toBe(200);
    const invoiceId: number = create.data.data.invoice.id;
    const invoiceNumber: string = create.data.data.invoice.number;

    cleanups.push(async () => cancelInvoice(adminApi, invoiceId));

    const billing = await clientApi.get('/api/portal/settings/billing');
    expect(billing.status).toBe(200);
    expect(billing.data.success).toBe(true);
    expect(Array.isArray(billing.data.data.invoices)).toBe(true);

    // Real behavior: the just-created sent invoice MUST appear in this client's
    // billing summary with the correct number + status.
    const visibleInvoice = billing.data.data.invoices.find(
      (inv: { id: number }) => inv.id === invoiceId,
    );
    expect(visibleInvoice).toBeTruthy();
    expect(visibleInvoice.number).toBe(invoiceNumber);
    expect(visibleInvoice.status).toBe('sent');
  });

  test('POST /portal/invoices/:id/checkout rejects draft invoice (status gate)', async ({
    adminApi,
    clientApi,
  }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      notes: `${PREFIX}draft-checkout-reject-${ts}`,
      items: [{ description: `${PREFIX}Draft Item-${ts}`, quantity: 1, unitPrice: 5000 }],
      // No status override — defaults to 'draft'
    });
    expect(create.status).toBe(200);
    const invoiceId: number = create.data.data.invoice.id;

    cleanups.push(async () => cancelInvoice(adminApi, invoiceId));

    // Draft invoice should NOT be payable. The status gate fires (400) BEFORE the
    // Stripe-key check (500), so this is unambiguous even without a Stripe key.
    const checkout = await clientApi.post(`/api/portal/invoices/${invoiceId}/checkout`, {});
    expect(checkout.status).toBe(400);
    expect(checkout.data.success).toBe(false);
    expect(checkout.data.message).toMatch(/not payable/i);
  });

  test('POST /portal/invoices/:id/checkout creates Stripe session for sent invoice', async ({
    adminApi,
    clientApi,
  }) => {
    // Guard: skip when no valid Stripe test key is configured
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      test.skip();
      return;
    }

    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    // Create a 'sent' invoice so it is immediately payable
    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      status: 'sent',
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      notes: `${PREFIX}checkout-happy-${ts}`,
      items: [
        { description: `${PREFIX}Service A-${ts}`, quantity: 2, unitPrice: 15000 },
        { description: `${PREFIX}Service B-${ts}`, quantity: 1, unitPrice: 10000 },
      ],
    });
    expect(create.status).toBe(200);
    expect(create.data.data.invoice.status).toBe('sent');
    const invoiceId: number = create.data.data.invoice.id;

    cleanups.push(async () => cancelInvoice(adminApi, invoiceId));

    // Call checkout as client (PayInvoiceButton path)
    const checkout = await clientApi.post(`/api/portal/invoices/${invoiceId}/checkout`, {});
    expect(checkout.status).toBe(200);
    expect(checkout.data.success).toBe(true);

    // Response must include a Stripe checkout URL — do NOT follow it
    const url: string = checkout.data.data?.url;
    expect(typeof url).toBe('string');
    expect(url.startsWith('https://checkout.stripe.com')).toBe(true);

    // Verify stripeCheckoutSessionId was written back to the invoice row
    const invoiceGet = await adminApi.get(`/api/admin/portal/invoices/${invoiceId}`);
    expect(invoiceGet.status).toBe(200);
    const updatedInvoice = invoiceGet.data.data.invoice as {
      stripeCheckoutSessionId: string | null;
      status: string;
    };
    expect(updatedInvoice.stripeCheckoutSessionId).not.toBeNull();
    expect(typeof updatedInvoice.stripeCheckoutSessionId).toBe('string');
    // Status remains 'sent' — paidAt is only set by Stripe webhook, not by checkout
    expect(updatedInvoice.status).toBe('sent');
  });

  test('PATCH /admin/portal/invoices/:id advances to paid; paidAt null without webhook', async ({
    adminApi,
  }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      status: 'sent',
      notes: `${PREFIX}advance-to-paid-${ts}`,
      items: [{ description: `${PREFIX}Paid Item-${ts}`, quantity: 1, unitPrice: 9900 }],
    });
    expect(create.status).toBe(200);
    const invoiceId: number = create.data.data.invoice.id;

    cleanups.push(async () => cancelInvoice(adminApi, invoiceId));

    // Advance to paid via admin PATCH (simulates manual reconciliation)
    const patch = await adminApi.patch(`/api/admin/portal/invoices/${invoiceId}`, {
      status: 'paid',
    });
    expect(patch.status).toBe(200);
    expect(patch.data.success).toBe(true);
    expect(patch.data.data.status).toBe('paid');

    // paidAt stays null — the admin PATCH route does not write paidAt; only the
    // Stripe webhook does on a real payment. This is the webhook boundary the title
    // promises, so assert it explicitly rather than just commenting on it.
    expect(patch.data.data.paidAt).toBeNull();

    // Confirm the persisted row agrees (PATCH .returning() reflects the DB write).
    const reread = await adminApi.get(`/api/admin/portal/invoices/${invoiceId}`);
    expect(reread.status).toBe(200);
    expect(reread.data.data.invoice.status).toBe('paid');
    expect(reread.data.data.invoice.paidAt).toBeNull();
  });

  test('POST /portal/invoices/:id/checkout rejects paid invoice (not payable)', async ({
    adminApi,
    clientApi,
  }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    // Create a 'paid' invoice
    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      status: 'sent', // create as sent first
      notes: `${PREFIX}paid-checkout-reject-${ts}`,
      items: [{ description: `${PREFIX}Already Paid-${ts}`, quantity: 1, unitPrice: 7500 }],
    });
    expect(create.status).toBe(200);
    const invoiceId: number = create.data.data.invoice.id;

    cleanups.push(async () => cancelInvoice(adminApi, invoiceId));

    // Advance to paid
    const patch = await adminApi.patch(`/api/admin/portal/invoices/${invoiceId}`, {
      status: 'paid',
    });
    expect(patch.data.data.status).toBe('paid');

    // Paid invoice must be rejected by checkout (status gate)
    const checkout = await clientApi.post(`/api/portal/invoices/${invoiceId}/checkout`, {});
    expect(checkout.status).toBe(400);
    expect(checkout.data.success).toBe(false);
    expect(checkout.data.message).toMatch(/not payable/i);
  });

  test('POST /portal/invoices/:id/checkout rejects cancelled invoice', async ({
    adminApi,
    clientApi,
  }) => {
    const clients = await adminApi.get('/api/admin/portal/clients');
    if (!clients.data.data?.length) { test.skip(); return; }
    const clientId: number = clients.data.data[0].id;
    const ts = Date.now();

    const create = await adminApi.post('/api/admin/portal/invoices', {
      clientId,
      status: 'sent',
      notes: `${PREFIX}cancelled-checkout-${ts}`,
      items: [{ description: `${PREFIX}Cancel Me-${ts}`, quantity: 1, unitPrice: 3000 }],
    });
    expect(create.status).toBe(200);
    const invoiceId: number = create.data.data.invoice.id;

    // Cancel it (this is also our cleanup path, so no extra cleanup push needed)
    const cancel = await adminApi.patch(`/api/admin/portal/invoices/${invoiceId}`, {
      status: 'cancelled',
    });
    expect(cancel.data.data.status).toBe('cancelled');

    const checkout = await clientApi.post(`/api/portal/invoices/${invoiceId}/checkout`, {});
    expect(checkout.status).toBe(400);
    expect(checkout.data.success).toBe(false);
    expect(checkout.data.message).toMatch(/not payable/i);
  });

  test('GET /admin/portal/invoices rejects client role (auth split)', async ({
    clientApi,
  }) => {
    const res = await clientApi.get('/api/admin/portal/invoices');
    expect(res.status).toBe(401);
  });

  test('POST /admin/portal/invoices rejects client role (auth split)', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/admin/portal/invoices', {
      clientId: 1,
      items: [{ description: 'Should be rejected', quantity: 1, unitPrice: 1000 }],
    });
    expect(res.status).toBe(401);
  });

  test('POST /portal/invoices/:id/checkout rejects unauthenticated', async ({
    unauthApi,
  }) => {
    const res = await unauthApi.post('/api/portal/invoices/1/checkout', {});
    expect(res.status).toBe(401);
  });
});
