/**
 * Billing Stripe E2E coverage — unit 18 slice (cards 0-3)
 *
 * All four cards in this slice reference features with no implemented API
 * routes. Tests are skipped and serve as gap documentation.
 *
 *  Card 0 — Failed-payment dunning + automatic retry
 *    No dunning or retry webhook handler exists (invoice.payment_failed is
 *    handled for e-commerce / bookings only; no platform-subscription dunning).
 *
 *  Card 1 — Customer self-serve billing portal
 *    No billingPortal.sessions.create endpoint exists in any portal route.
 *
 *  Card 2 — Stripe Connect / BYOK flow
 *    The store-level stripe-connect route exists but the platform-level
 *    Stripe Connect / BYOK billing flow has no dedicated API endpoint.
 *
 *  Card 3 — Module subscription checkout
 *    POST /billing/modules/checkout does not exist.
 */

import { test, expect } from './setup/fixtures';

// ── Card 0: Failed-payment dunning + automatic retry ──

test.describe('Billing — Failed-payment dunning + automatic retry @billing', () => {
  test.skip(true, 'gap: no dunning/retry webhook handler implemented for platform subscriptions');

  test('invoice.payment_failed triggers dunning email and schedules retry', async ({ clientApi }) => {
    // No route to test — implementation does not exist
    const res = await clientApi.post('/api/billing/dunning/retry', {});
    expect(res.status).toBe(200);
  });
});

// ── Card 1: Customer self-serve billing portal ──

test.describe('Billing — Customer self-serve billing portal @billing', () => {
  test.skip(true, 'gap: no billingPortal.sessions endpoint implemented');

  test('POST /billing/portal-session returns Stripe billing portal URL', async ({ clientApi }) => {
    // No route to test — billingPortal.sessions.create is not wired
    const res = await clientApi.post('/api/portal/billing/portal-session', {});
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('url');
  });
});

// ── Card 2: Stripe Connect / BYOK flow ──

test.describe('Billing — Stripe Connect / BYOK flow @billing', () => {
  test.skip(true, 'gap: no platform-level Stripe Connect / BYOK billing API endpoint');

  test('Stripe Connect / BYOK flow has a dedicated API endpoint', async ({ clientApi }) => {
    // Store-level stripe-connect exists but platform BYOK billing flow does not
    const res = await clientApi.post('/api/billing/connect', {});
    expect(res.status).toBe(200);
  });
});

// ── Card 3: Module subscription checkout ──

test.describe('Billing — Module subscription checkout @billing', () => {
  test.skip(true, 'gap: POST /billing/modules/checkout route does not exist');

  test('POST /billing/modules/checkout creates Stripe Checkout session', async ({ clientApi }) => {
    // Route has not been implemented
    const res = await clientApi.post('/api/billing/modules/checkout', {
      moduleId: 'crm',
      seats: 1,
    });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('url');
  });
});
