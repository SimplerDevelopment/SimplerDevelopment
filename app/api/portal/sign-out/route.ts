import { NextResponse } from 'next/server';

/**
 * Custom sign-out endpoint that clears session cookies on both the bare domain
 * and the wildcard domain. This handles the transition from old cookies scoped
 * to simplerdevelopment.com to new cookies on .simplerdevelopment.com.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  // Whether NextAuth used the `__Secure-` cookie prefix. This MUST mirror
  // lib/auth.ts's USE_SECURE_COOKIES — a bare `NODE_ENV === 'production'` check
  // diverges under the e2e / QAD-047 combo (NODE_ENV=production +
  // AUTH_INSECURE_COOKIES=1), where NextAuth actually sets the UNPREFIXED
  // `authjs.session-token`; clearing only `__Secure-…` there left the real
  // session cookie intact and sign-out silently no-op'd.
  const useSecureCookies =
    process.env.AUTH_INSECURE_COOKIES !== '1' && process.env.NODE_ENV === 'production';

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
      secure: useSecureCookies,
      domain: useSecureCookies ? 'simplerdevelopment.com' : undefined,
    });
    // Prod also scopes cookies to the wildcard domain — clear that too.
    if (useSecureCookies) {
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
