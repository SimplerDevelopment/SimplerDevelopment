/**
 * Ads inbound webhook — fail-closed contract E2E (@ads @webhook).
 *
 * The route only trusts HMAC-signed bodies (ADS_WEBHOOK_SECRET). This spec
 * pins the behavior that holds in EVERY environment, with or without the
 * secret configured on the server:
 *
 *   - garbage/missing signature → 403 when configured, 503 when not.
 *     Never 2xx, never 500: the endpoint must not accept unsigned leads
 *     and must not blow up on hostile input.
 *
 * The full matrix (201 intake, 400 validation) is covered in
 * tests/unit/ads-webhook-route.test.ts, where the server secret is
 * controllable. A 201 here would require knowing the e2e server's secret,
 * so it stays a documented CI-with-secret follow-up rather than a fake.
 */
import { test, expect, request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function postWebhook(body: unknown, signature: string | null) {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    const headers: Record<string, string> = signature ? { 'x-ads-signature': signature } : {};
    const res = await ctx.post('/api/ads/webhook', {
      data: body,
      headers,
    });
    return { status: res.status(), json: (await res.json().catch(() => null)) as unknown };
  } finally {
    await ctx.dispose();
  }
}

test.describe('Ads webhook fail-closed contract @ads @webhook', () => {
  test('garbage signature never intakes (403 configured / 503 unconfigured)', async () => {
    const { status, json } = await postWebhook(
      { clientId: 1, provider: 'mock', contact: { email: 'a@b.test' } },
      'deadbeef'.repeat(8),
    );
    expect([403, 503]).toContain(status);
    expect((json as { success?: boolean } | null)?.success).toBe(false);
  });

  test('missing signature never intakes (403 configured / 503 unconfigured)', async () => {
    const { status, json } = await postWebhook(
      { clientId: 1, provider: 'mock', contact: { email: 'a@b.test' } },
      null,
    );
    expect([403, 503]).toContain(status);
    expect((json as { success?: boolean } | null)?.success).toBe(false);
  });

  test('malformed JSON never intakes and never 500s', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    try {
      const res = await ctx.post('/api/ads/webhook', {
        data: 'this is not json {{{',
        headers: { 'content-type': 'text/plain', 'x-ads-signature': 'nope' },
      });
      expect([400, 403, 503]).toContain(res.status());
    } finally {
      await ctx.dispose();
    }
  });
});
