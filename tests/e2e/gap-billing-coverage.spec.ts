/**
 * Billing gap coverage — Stripe platform webhook signature-validation paths.
 *
 * Gap covered:
 *   1. POST /api/stripe/webhook (platform webhook) — signature-validation guards
 *      are testable without a real Stripe call. Asserts:
 *        - Route exists (not 404/405 on POST)
 *        - Missing stripe-signature header → 400
 *        - Malformed / bad stripe-signature header → 400
 *        - Empty body + empty signature → 400
 *        - GET method is not accepted (405)
 *
 *   NOTE: a real checkout.session.completed success path requires a valid
 *   Stripe-signed payload (HMAC-SHA256 using whsec_…). Constructing that would
 *   essentially re-implement stripe.webhooks.generateTestHeaderString which is
 *   only available to the Stripe SDK internals. The handler catches any
 *   constructEvent() error and returns 400 — the observable contract we assert
 *   below is the only meaningful path testable without a live Stripe webhook
 *   delivery or an exposed test-helper endpoint.
 */

import { test, expect } from './setup/fixtures';
import type { APIRequestContext } from '@playwright/test';

const WEBHOOK_PATH = '/api/stripe/webhook';

// ── Helper: make a raw POST to the Stripe webhook with arbitrary headers ──────
// We bypass ApiClient because ApiClient always sets Content-Type:application/json
// and we need to set stripe-signature explicitly.
// The Playwright `request` fixture is passed in directly — no newContext() needed.

async function rawWebhookPost(
  request: APIRequestContext,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
  const res = await request.post(WEBHOOK_PATH, {
    headers: { 'Content-Type': 'text/plain', ...headers },
    data: body,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status(), data };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Stripe platform webhook — signature-validation guards @gap @billing', () => {
  test(
    'POST without stripe-signature header → 400 (signature-validation rejection)',
    async ({ request }) => {
      const result = await rawWebhookPost(
        request,
        JSON.stringify({ type: 'checkout.session.completed', data: {} }),
        {}, // no stripe-signature header
      );
      // Handler calls stripe.webhooks.constructEvent → throws NoWebhookSignatureError
      // → caught → returns { error: 'webhook_error' } with 400
      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({ error: 'webhook_error' });
    },
  );

  test(
    'POST with malformed stripe-signature header → 400',
    async ({ request }) => {
      const result = await rawWebhookPost(
        request,
        JSON.stringify({ type: 'checkout.session.completed', data: {} }),
        { 'stripe-signature': 'this-is-not-a-valid-stripe-signature' },
      );
      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({ error: 'webhook_error' });
    },
  );

  test(
    'POST with structurally valid but incorrect stripe-signature (wrong HMAC) → 400',
    async ({ request }) => {
      // A structurally correct Stripe webhook signature header:
      //   t=<unix-timestamp>,v1=<hmac-sha256-hex>
      // Even with correct structure, the HMAC will not match the webhook secret.
      const ts = Math.floor(Date.now() / 1000);
      const fakeHmac = 'a'.repeat(64); // 64 hex chars, but wrong key
      const badSig = `t=${ts},v1=${fakeHmac}`;

      const result = await rawWebhookPost(
        request,
        JSON.stringify({ type: 'checkout.session.completed', data: {} }),
        { 'stripe-signature': badSig },
      );
      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({ error: 'webhook_error' });
    },
  );

  test(
    'POST with empty body and empty stripe-signature → 400',
    async ({ request }) => {
      const result = await rawWebhookPost(request, '', { 'stripe-signature': '' });
      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({ error: 'webhook_error' });
    },
  );

  test(
    'GET /api/stripe/webhook → 405 (method not allowed)',
    async ({ request }) => {
      const res = await request.get(WEBHOOK_PATH);
      expect(res.status()).toBe(405);
    },
  );
});
