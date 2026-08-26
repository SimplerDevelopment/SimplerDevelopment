import { secureCookiesEnabled } from '@/lib/auth-cookies';
import { NextResponse } from 'next/server';

/**
 * Custom sign-out endpoint that clears session cookies on both the bare domain
 * and the wildcard domain. This handles the transition from old cookies scoped
 * to simplerdevelopment.com to new cookies on .simplerdevelopment.com.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  // Whether NextAuth used the `__Secure-` cookie prefix. Shared with lib/auth.ts
  // via lib/auth-cookies.ts — this was a hand copy of the condition, and a bare
  // `NODE_ENV === 'production'` version of it diverged under the e2e / QAD-047
  // combo, clearing only `__Secure-…` while the real unprefixed session cookie
  // survived, so sign-out silently no-op'd.
  const secure = secureCookiesEnabled();

  // Clear BOTH the prefixed and unprefixed variants regardless of config —
  // clearing a cookie that doesn't exist is a harmless no-op, and it makes
  // sign-out robust to the prefix decision instead of guessing one name.
  const bases = ['authjs.session-token', 'authjs.csrf-token', 'authjs.callback-url'];
  const cookieNames = [...bases, ...bases.map((n) => `__Secure-${n}`), 'sd-active-client'];

  for (const name of cookieNames) {
    // Clear on the bare/host domain (the only scope in dev/insecure config).
    response.cookies.set(name, '', {
      expires: new Date(0),
      path: '/',
      secure: secure,
      domain: secure ? 'simplerdevelopment.com' : undefined,
    });
    // Prod also scopes cookies to the wildcard domain — clear that too.
    if (secure) {
      response.cookies.set(name, '', {
        expires: new Date(0),
        path: '/',
        secure: true,
        domain: '.simplerdevelopment.com',
      });
    }
  }

  return response;
}
