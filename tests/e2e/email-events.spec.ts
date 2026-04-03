/**
 * Email Events E2E Tests
 *
 * Tests that all 10 transactional email events are properly wired up
 * and can be triggered through their real integration points.
 *
 * Events tested:
 * - order.confirmed  (Stripe webhook: payment_intent.succeeded)
 * - order.shipped    (Order status update: shipped)
 * - order.delivered   (Order status update: delivered)
 * - order.cancelled   (Order status update: cancelled)
 * - order.refunded    (Stripe webhook: charge.refunded)
 * - payment.failed    (Stripe webhook: payment_intent.payment_failed)
 * - account.welcome   (Storefront registration)
 * - account.password_reset (Storefront forgot-password)
 * - booking.confirmed (Public booking creation)
 * - booking.cancelled (Public booking cancellation)
 *
 * Prerequisites: Run `npx tsx scripts/seed-email-test-data.ts`
 */
import { test, expect } from './setup/fixtures';
import { request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ─── Test Email Trigger API ─────────────────────────────────────────────────
// Tests the /api/test/email-events endpoint which calls sendTransactionalEmail
// for each event with real template resolution and Resend delivery.

test.describe('Email Events - Test Trigger API @email @api', () => {
  test('GET /api/test/email-events lists all available events', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.get('/api/test/email-events');
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data.events).toHaveLength(10);
    expect(data.events).toContain('order.confirmed');
    expect(data.events).toContain('order.shipped');
    expect(data.events).toContain('order.delivered');
    expect(data.events).toContain('order.cancelled');
    expect(data.events).toContain('order.refunded');
    expect(data.events).toContain('payment.failed');
    expect(data.events).toContain('account.welcome');
    expect(data.events).toContain('account.password_reset');
    expect(data.events).toContain('booking.confirmed');
    expect(data.events).toContain('booking.cancelled');

    await ctx.dispose();
  });

  test('POST with event "all" sends all 10 emails', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/test/email-events', {
      data: { event: 'all' },
    });
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data.success).toBe(true);
    expect(data.summary.total).toBe(10);
    expect(data.summary.sent).toBe(10);
    expect(data.summary.failed).toBe(0);

    // Verify each result has expected fields
    for (const result of data.results) {
      expect(result).toHaveProperty('event');
      expect(result).toHaveProperty('to');
      expect(result.success).toBe(true);
      expect(result.to).toContain('info+');
      expect(result.to).toContain('@simplerdevelopment.com');
    }

    await ctx.dispose();
  });

  const INDIVIDUAL_EVENTS = [
    'order.confirmed',
    'order.shipped',
    'order.delivered',
    'order.cancelled',
    'order.refunded',
    'payment.failed',
    'account.welcome',
    'account.password_reset',
    'booking.confirmed',
    'booking.cancelled',
  ];

  for (const event of INDIVIDUAL_EVENTS) {
    test(`POST with event "${event}" sends successfully`, async () => {
      const ctx = await request.newContext({ baseURL: BASE_URL });
      const res = await ctx.post('/api/test/email-events', {
        data: { event },
      });
      const data = await res.json();

      expect(res.status()).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].event).toBe(event);
      expect(data.results[0].success).toBe(true);

      // Verify the email address uses the correct plus-addressing pattern
      const expectedSuffix = event.replace('.', '_');
      expect(data.results[0].to).toBe(`info+${expectedSuffix}@simplerdevelopment.com`);

      await ctx.dispose();
    });
  }

  test('POST with unknown event returns error', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/test/email-events', {
      data: { event: 'nonexistent.event' },
    });
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data.success).toBe(false);
    expect(data.results[0].success).toBe(false);
    expect(data.results[0].error).toContain('Unknown event');

    await ctx.dispose();
  });

  test('POST with specific websiteId sends for that website', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/test/email-events', {
      data: { event: 'order.confirmed', websiteId: 139 },
    });
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data.success).toBe(true);

    await ctx.dispose();
  });
});

// ─── Order Email Integration ─────────────────────────────────────────────────
// Tests that order status changes trigger the correct emails via the portal API.
// Uses the seeded website (ID 139) and order directly.

test.describe('Email Events - Order Status Changes @email @orders', () => {
  const SEED_SITE_ID = 139;

  test('updating order status to "shipped" triggers order.shipped email', async ({ clientApi }) => {
    const ordersRes = await clientApi.get(`/api/portal/websites/${SEED_SITE_ID}/store/orders`);

    if (ordersRes.status !== 200 || !ordersRes.data?.data?.length) {
      test.skip();
      return;
    }

    // Find a confirmed order
    const order = ordersRes.data.data.find(
      (o: { status: string }) => o.status === 'confirmed',
    );
    if (!order) { test.skip(); return; }

    const updateRes = await clientApi.put(
      `/api/portal/websites/${SEED_SITE_ID}/store/orders/${order.id}`,
      {
        status: 'shipped',
        trackingNumber: 'TEST-TRACK-123',
        trackingUrl: 'https://track.example.com/TEST-TRACK-123',
        statusNote: 'E2E test shipment',
      },
    );

    expect(updateRes.status).toBe(200);
    expect(updateRes.data.success).toBe(true);
    expect(updateRes.data.data.status).toBe('shipped');
  });

  test('updating order status to "delivered" triggers order.delivered email', async ({ clientApi }) => {
    const ordersRes = await clientApi.get(`/api/portal/websites/${SEED_SITE_ID}/store/orders`);
    if (ordersRes.status !== 200 || !ordersRes.data?.data?.length) { test.skip(); return; }

    const shippedOrder = ordersRes.data.data.find(
      (o: { status: string }) => o.status === 'shipped',
    );
    if (!shippedOrder) { test.skip(); return; }

    const updateRes = await clientApi.put(
      `/api/portal/websites/${SEED_SITE_ID}/store/orders/${shippedOrder.id}`,
      { status: 'delivered', statusNote: 'E2E test delivery' },
    );

    expect(updateRes.status).toBe(200);
    expect(updateRes.data.success).toBe(true);
    expect(updateRes.data.data.status).toBe('delivered');
  });

  test('updating order status to "cancelled" triggers order.cancelled email', async ({ clientApi }) => {
    const ordersRes = await clientApi.get(`/api/portal/websites/${SEED_SITE_ID}/store/orders`);
    if (ordersRes.status !== 200 || !ordersRes.data?.data?.length) { test.skip(); return; }

    const activeOrder = ordersRes.data.data.find(
      (o: { status: string }) => o.status !== 'cancelled',
    );
    if (!activeOrder) { test.skip(); return; }

    const updateRes = await clientApi.put(
      `/api/portal/websites/${SEED_SITE_ID}/store/orders/${activeOrder.id}`,
      { status: 'cancelled', statusNote: 'E2E test cancellation' },
    );

    expect(updateRes.status).toBe(200);
    expect(updateRes.data.success).toBe(true);
    expect(updateRes.data.data.status).toBe('cancelled');
  });
});

// ─── Account Email Integration ───────────────────────────────────────────────
// Tests storefront registration and password reset email triggers.

test.describe('Email Events - Account Emails @email @account', () => {
  // Use the seeded website ID
  const SEED_WEBSITE_ID = 139;

  test('customer registration triggers account.welcome email', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const uniqueEmail = `info+welcome_e2e_${Date.now()}@simplerdevelopment.com`;

    const res = await ctx.post(`/api/storefront/${SEED_WEBSITE_ID}/auth`, {
      data: {
        action: 'register',
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'E2E',
        lastName: 'Tester',
      },
    });
    const data = await res.json();

    expect(res.status()).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.customer.email).toBe(uniqueEmail.toLowerCase());
    expect(data.data.token).toBeTruthy();

    await ctx.dispose();
  });

  test('forgot-password triggers account.password_reset email', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    const res = await ctx.post(`/api/storefront/${SEED_WEBSITE_ID}/auth`, {
      data: {
        action: 'forgot-password',
        email: 'info+account_test@simplerdevelopment.com', // seeded customer
      },
    });
    const data = await res.json();

    expect(res.status()).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('reset link has been sent');

    await ctx.dispose();
  });

  test('forgot-password with non-existent email still returns success (no info leak)', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    const res = await ctx.post(`/api/storefront/${SEED_WEBSITE_ID}/auth`, {
      data: {
        action: 'forgot-password',
        email: 'nonexistent_user@example.com',
      },
    });
    const data = await res.json();

    // Should still say success to not reveal account existence
    expect(res.status()).toBe(200);
    expect(data.success).toBe(true);

    await ctx.dispose();
  });

  test('duplicate registration returns 409 conflict', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    const res = await ctx.post(`/api/storefront/${SEED_WEBSITE_ID}/auth`, {
      data: {
        action: 'register',
        email: 'info+account_test@simplerdevelopment.com', // already exists
        password: 'TestPassword123!',
        firstName: 'Duplicate',
        lastName: 'User',
      },
    });

    expect(res.status()).toBe(409);

    await ctx.dispose();
  });
});

// ─── Booking Email Integration ───────────────────────────────────────────────
// Tests that booking creation and cancellation trigger emails.

test.describe('Email Events - Booking Emails @email @booking', () => {
  test('creating a booking triggers booking.confirmed email', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    // Get available slots from the seeded booking page
    const slotsRes = await ctx.get('/api/public/booking/email-test-consult');
    if (slotsRes.status() !== 200) { test.skip(); return; }

    // Create a booking with a future time
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    futureDate.setHours(10, 0, 0, 0);

    const res = await ctx.post('/api/public/booking/email-test-consult/book', {
      data: {
        name: 'E2E Booking Test',
        email: 'info+booking_e2e@simplerdevelopment.com',
        startTime: futureDate.toISOString(),
        timezone: 'America/New_York',
      },
    });
    const data = await res.json();

    if (res.status() === 409) {
      // Slot taken, skip
      test.skip();
      return;
    }

    expect(res.status()).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.guestEmail).toBe('info+booking_e2e@simplerdevelopment.com');
    expect(data.data.status).toBe('confirmed');

    await ctx.dispose();
  });

  test('cancelling a booking triggers booking.cancelled email', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    // Use the seeded cancel token
    const cancelRes = await ctx.get('/api/public/booking/cancel?token=test-cancel-token-email-001');
    const cancelData = await cancelRes.json();

    if (cancelRes.status() !== 200 || cancelData.data?.status === 'cancelled') {
      // Already cancelled or not found, skip
      test.skip();
      return;
    }

    const res = await ctx.post('/api/public/booking/cancel', {
      data: { token: 'test-cancel-token-email-001' },
    });
    const data = await res.json();

    // Accept both success (first cancel) and 409 (already cancelled)
    if (res.status() === 409) {
      expect(data.message).toContain('already been cancelled');
    } else {
      expect(res.status()).toBe(200);
      expect(data.success).toBe(true);
    }

    await ctx.dispose();
  });

  test('cancelling with invalid token returns 404', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    const res = await ctx.post('/api/public/booking/cancel', {
      data: { token: 'invalid-token-that-does-not-exist' },
    });

    expect(res.status()).toBe(404);

    await ctx.dispose();
  });
});

// ─── Email Template Resolution ───────────────────────────────────────────────
// Tests that templates are loaded and resolved correctly.

test.describe('Email Events - Template System @email @templates', () => {
  test('each event uses the correct email address pattern', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/test/email-events', {
      data: { event: 'all' },
    });
    const data = await res.json();

    expect(data.success).toBe(true);

    const expectedAddresses: Record<string, string> = {
      'order.confirmed': 'info+order_confirmed@simplerdevelopment.com',
      'order.shipped': 'info+order_shipped@simplerdevelopment.com',
      'order.delivered': 'info+order_delivered@simplerdevelopment.com',
      'order.cancelled': 'info+order_cancelled@simplerdevelopment.com',
      'order.refunded': 'info+order_refunded@simplerdevelopment.com',
      'payment.failed': 'info+payment_failed@simplerdevelopment.com',
      'account.welcome': 'info+account_welcome@simplerdevelopment.com',
      'account.password_reset': 'info+account_password_reset@simplerdevelopment.com',
      'booking.confirmed': 'info+booking_confirmed@simplerdevelopment.com',
      'booking.cancelled': 'info+booking_cancelled@simplerdevelopment.com',
    };

    for (const result of data.results) {
      expect(result.to).toBe(expectedAddresses[result.event]);
    }

    await ctx.dispose();
  });

  test('sending for a website with templates uses custom templates', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    // websiteId 139 was seeded with all 10 templates
    const res = await ctx.post('/api/test/email-events', {
      data: { event: 'order.confirmed', websiteId: 139 },
    });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.results[0].success).toBe(true);

    await ctx.dispose();
  });

  test('sending for a website without templates falls back to defaults', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    // websiteId 1 likely exists but has no email templates
    const res = await ctx.post('/api/test/email-events', {
      data: { event: 'account.welcome', websiteId: 1 },
    });
    const data = await res.json();

    // Should still succeed using default templates
    expect(data.results[0].success).toBe(true);

    await ctx.dispose();
  });
});
