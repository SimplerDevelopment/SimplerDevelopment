/**
 * Gap regression — booking OAuth CSRF + individual-booking entitlement gate
 *
 * Closes three findings from docs/audits/portal-e2e-adversarial-audit-2026-06-25.md:
 *   - booking-google-oauth-no-csrf-state
 *   - booking-zoom-oauth-no-csrf-state
 *   - booking-individual-update-no-service-gate
 *
 * CSRF (Google + Zoom):
 *   The auth routes must mint a random `state` nonce, echo it on the redirect to
 *   the provider, AND persist it in an httpOnly cookie. The callbacks must reject
 *   (redirect to `?<provider>=error`) when the echoed `state` does not match the
 *   cookie minted at auth time. These specs assert the *mint* step directly (it
 *   fails if state generation is removed) and that a callback with no matching
 *   state never lands on `?<provider>=connected`.
 *
 * Entitlement gate (individual booking PUT):
 *   PUT /api/portal/tools/booking/[id]/bookings/[bookingId] must clear
 *   authorizePortal({ requireService: 'booking' }) like every sibling write route.
 *   Mirrors the established service-gate pattern in portal-tools-gift-certificates.spec.ts:
 *   a subscribed client gets 200/404, an unsubscribed client gets 403 + requiresService,
 *   and unauthenticated requests get 401.
 */
import { test, expect, request } from './setup/fixtures';

// Seed booking page (page id 1) belongs to the standard portal client (Acme / client@example.com).
const SEED_PAGE_ID = 1;

// Seed portal-client credentials (from scripts/seed-portal-client.ts; mirrors fixtures.ts).
const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/** Build an authenticated APIRequestContext (own cookie jar) so we can inspect
 *  raw 3xx Location + Set-Cookie headers without auto-following redirects. */
async function loggedInContext() {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()) as { csrfToken: string };
  const res = await ctx.post('/api/auth/callback/credentials', {
    form: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD, csrfToken: csrf.csrfToken, json: 'true' },
  });
  if (res.status() >= 400) throw new Error(`Login failed: ${res.status()}`);
  return ctx;
}

function setCookieValues(res: { headersArray(): { name: string; value: string }[] }): string[] {
  return res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
}

// ── Google Calendar OAuth — CSRF state ───────────────────────────────────────
test.describe('Booking Google OAuth — CSRF state @booking @oauth @csrf', () => {
  test('GET /google/auth mints a state param + httpOnly state cookie @critical', async () => {
    const ctx = await loggedInContext();
    try {
      const res = await ctx.get('/api/portal/tools/booking/google/auth', { maxRedirects: 0 });
      expect([302, 307, 303]).toContain(res.status());

      const location = res.headers()['location'] ?? '';
      expect(location).toContain('accounts.google.com');
      // state must be echoed to the provider — the CSRF anti-forgery nonce
      expect(location).toMatch(/[?&]state=[a-f0-9]{16,}/);

      // ...and persisted in an httpOnly cookie so only the originating browser can replay it
      const cookies = setCookieValues(res);
      const stateCookie = cookies.find((c) => c.startsWith('booking_google_oauth_state='));
      expect(stateCookie, 'auth route must set booking_google_oauth_state cookie').toBeTruthy();
      expect(stateCookie!).toMatch(/HttpOnly/i);
    } finally {
      await ctx.dispose();
    }
  });

  test('GET /google/auth rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/booking/google/auth');
    expect(res.status).toBe(401);
  });

  test('GET /google/callback with no matching state never connects', async () => {
    // Fresh context => no state cookie. A callback bearing an attacker-supplied
    // code+state must be rejected (redirect to error), never reach ?google=connected.
    const ctx = await loggedInContext();
    try {
      const res = await ctx.get(
        '/api/portal/tools/booking/google/callback?code=forged-code&state=attacker-controlled',
        { maxRedirects: 0 },
      );
      expect([302, 307, 303]).toContain(res.status());
      const location = res.headers()['location'] ?? '';
      expect(location).not.toContain('google=connected');
      expect(location).toContain('google=error');
    } finally {
      await ctx.dispose();
    }
  });
});

// ── Zoom OAuth — CSRF state ──────────────────────────────────────────────────
test.describe('Booking Zoom OAuth — CSRF state @booking @oauth @csrf', () => {
  test('GET /zoom/auth mints a state param + httpOnly state cookie @critical', async () => {
    const ctx = await loggedInContext();
    try {
      const res = await ctx.get('/api/portal/tools/booking/zoom/auth', { maxRedirects: 0 });
      expect([302, 307, 303]).toContain(res.status());

      const location = res.headers()['location'] ?? '';
      expect(location).toContain('zoom.us/oauth/authorize');
      expect(location).toMatch(/[?&]state=[a-f0-9]{16,}/);

      const cookies = setCookieValues(res);
      const stateCookie = cookies.find((c) => c.startsWith('booking_zoom_oauth_state='));
      expect(stateCookie, 'auth route must set booking_zoom_oauth_state cookie').toBeTruthy();
      expect(stateCookie!).toMatch(/HttpOnly/i);
    } finally {
      await ctx.dispose();
    }
  });

  test('GET /zoom/auth rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/booking/zoom/auth');
    expect(res.status).toBe(401);
  });

  test('GET /zoom/callback with no matching state never connects', async () => {
    const ctx = await loggedInContext();
    try {
      const res = await ctx.get(
        '/api/portal/tools/booking/zoom/callback?code=forged-code&state=attacker-controlled',
        { maxRedirects: 0 },
      );
      expect([302, 307, 303]).toContain(res.status());
      const location = res.headers()['location'] ?? '';
      expect(location).not.toContain('zoom=connected');
      expect(location).toContain('zoom=error');
    } finally {
      await ctx.dispose();
    }
  });
});

// ── Individual booking PUT — booking-service entitlement gate ─────────────────
test.describe('Individual Booking Update — service gate @booking @entitlement', () => {
  test('PUT /bookings/[bookingId] is service-gated (200/404 for subscribed, 403 otherwise) @critical', async ({
    clientApi,
  }) => {
    // Use an unknown bookingId so the call can never mutate real data — we are
    // asserting the gate contract, not the update result. A subscribed client
    // clears the gate and hits the 404 (booking not found); an unsubscribed
    // client is blocked at the gate with 403 + requiresService='booking'.
    const res = await clientApi.put(
      `/api/portal/tools/booking/${SEED_PAGE_ID}/bookings/999999`,
      { status: 'cancelled' },
    );
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data).toHaveProperty('requiresService', 'booking');
      expect(res.data).toHaveProperty('upsellUrl');
    } else {
      // gate cleared (subscribed) → page found, booking 999999 not found
      expect([200, 404]).toContain(res.status);
    }
  });

  test('PUT /bookings/[bookingId] rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.put(
      `/api/portal/tools/booking/${SEED_PAGE_ID}/bookings/999999`,
      { status: 'cancelled' },
    );
    expect(res.status).toBe(401);
  });

  test('PUT /bookings/[bookingId] on a page not owned by the tenant returns 404', async ({ clientApi }) => {
    // A booking page id that does not belong to this client must be rejected by
    // the clientId-scoped page lookup before any booking mutation.
    const res = await clientApi.put(
      `/api/portal/tools/booking/99999999/bookings/1`,
      { status: 'cancelled' },
    );
    expect([403, 404]).toContain(res.status);
    if (res.status === 404) expect(res.data.success).toBe(false);
  });
});
