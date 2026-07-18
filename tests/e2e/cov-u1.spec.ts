/**
 * Auth Security E2E — unit 1 slice (indices 0-2)
 *
 * Card 0: Email verification token — GET /api/auth/verify-email?token=<valid>
 *         activates user and allows login.
 *
 * Cards 1 & 2 are "needs-spec":
 *   Card 1: Admin deactivates user → 401 within REVALIDATE_MS — requires 60s
 *           wait for JWT revalidation; no test hook available.
 *   Card 2: OAuth 2.1 sd_mcp_* token issuance — requires full authorization_code
 *           flow with consent screen; not testable via API.
 */

import { test, expect, request as pwRequest } from './setup/fixtures';
import postgres from 'postgres';
import 'dotenv/config';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL not set; required for token lookup.');
    sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 5 });
  }
  return sql;
}

test.afterAll(async () => {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
});

// ── Card 0: Email verification token ─────────────────────────────────────────

test.describe('Auth Security — Email Verification Token @auth', () => {
  let createdUserId: number | null = null;
  let createdClientId: number | null = null;

  test.afterAll(async () => {
    // Clean up the self-serve user + client created during the test
    if (createdUserId !== null) {
      try {
        // client rows have ON DELETE CASCADE from userId FK in practice,
        // but delete explicitly in correct order just in case.
        if (createdClientId !== null) {
          await db()`DELETE FROM clients WHERE id = ${createdClientId}`;
        }
        await db()`DELETE FROM users WHERE id = ${createdUserId}`;
      } catch {
        // best-effort
      }
    }
  });

  test(
    'GET /api/auth/verify-email?token=<valid> redirects to /portal/login?verified=1',
    async () => {
      const ts = Date.now();
      const email = `verify-test-${ts}@example.com`;
      const name = `Verify User ${ts}`;
      const password = 'Passw0rd!';

      // 1. Sign up — creates user with emailVerificationToken in DB.
      // The signup route has an in-process IP-based rate limiter (5/hour per
      // IP). Test requests arrive with no x-forwarded-for header and fall into
      // the "unknown" bucket, which exhausts after 5 runs within the same
      // server process. Send a timestamp-derived IP so each test run gets its
      // own bucket and the limiter never fires during the test suite.
      const fakeIp = `10.99.${Math.floor(ts / 1000) % 256}.${ts % 256}`;
      const signupCtx = await pwRequest.newContext({
        baseURL: BASE_URL,
        extraHTTPHeaders: { 'x-forwarded-for': fakeIp },
      });
      const signupRes = await signupCtx.post('/api/auth/signup', {
        data: { name, email, password },
      });
      expect(signupRes.status()).toBe(200);
      const signupBody = await signupRes.json();
      expect(signupBody.success).toBe(true);
      await signupCtx.dispose();

      // 2. Retrieve the verification token from the DB (out-of-band)
      const rows = await db()`
        SELECT id, email_verification_token
        FROM users
        WHERE email = ${email}
        LIMIT 1
      `;
      expect(rows.length).toBe(1);
      const { id: userId, email_verification_token: token } = rows[0] as {
        id: number;
        email_verification_token: string | null;
      };
      createdUserId = userId;
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect((token as string).length).toBe(64);

      // Also grab the client id for cleanup
      const clientRows = await db()`
        SELECT id FROM clients WHERE user_id = ${userId} LIMIT 1
      `;
      if (clientRows.length > 0) {
        createdClientId = (clientRows[0] as { id: number }).id;
      }

      // 3. Call GET /api/auth/verify-email?token=... — expect redirect
      const ctx = await pwRequest.newContext({
        baseURL: BASE_URL,
        maxRedirects: 0,
      });
      const verifyRes = await ctx.get(`/api/auth/verify-email?token=${token}`);
      // Next.js App Router NextResponse.redirect emits 307 for GET requests.
      expect([302, 307]).toContain(verifyRes.status());
      const location = verifyRes.headers()['location'] ?? '';
      expect(location).toContain('verified=1');
      expect(location).toContain('/portal/login');
      await ctx.dispose();

      // 4. Verify the token was consumed (emailVerificationToken is now null)
      const afterRows = await db()`
        SELECT email_verification_token, email_verified_at
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `;
      expect(afterRows.length).toBe(1);
      const after = afterRows[0] as {
        email_verification_token: string | null;
        email_verified_at: Date | null;
      };
      expect(after.email_verification_token).toBeNull();
      expect(after.email_verified_at).not.toBeNull();
    },
  );

  test(
    'GET /api/auth/verify-email?token=<invalid> redirects to signup error page',
    async () => {
      const ctx = await pwRequest.newContext({
        baseURL: BASE_URL,
        maxRedirects: 0,
      });
      const res = await ctx.get(
        '/api/auth/verify-email?token=' + 'a'.repeat(64),
      );
      expect([302, 307]).toContain(res.status());
      const location = res.headers()['location'] ?? '';
      expect(location).toContain('verification-expired');
      await ctx.dispose();
    },
  );

  test(
    'GET /api/auth/verify-email with no token redirects to signup error page',
    async () => {
      const ctx = await pwRequest.newContext({
        baseURL: BASE_URL,
        maxRedirects: 0,
      });
      const res = await ctx.get('/api/auth/verify-email');
      expect([302, 307]).toContain(res.status());
      const location = res.headers()['location'] ?? '';
      expect(location).toContain('verification-expired');
      await ctx.dispose();
    },
  );
});
