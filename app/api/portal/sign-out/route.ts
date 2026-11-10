import { secureCookiesEnabled } from '@/lib/auth-cookies';
import { NextResponse } from 'next/server';

/**
 * Custom sign-out endpoint that clears the auth cookies across every scope they
 * may have been issued under during the PUX-258 `__Host-` migration: host-only
 * (the new default) AND the legacy apex Domain pin. NextAuth's own sign-out
 * clears the current cookie correctly; this belt-and-braces route also removes a
 * lingering old apex-pinned session a mid-rollout user may still carry.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  // Whether NextAuth used a secure cookie prefix. Shared with lib/auth.ts via
  // lib/auth-cookies.ts — this was a hand copy of the condition, and a bare
  // `NODE_ENV === 'production'` version of it diverged under the e2e / QAD-047
  // combo, clearing only prefixed names while the real unprefixed session cookie
  // survived, so sign-out silently no-op'd.
  const secure = secureCookiesEnabled();

  const expire = (name: string, domain?: string) =>
    response.cookies.set(name, '', {
      expires: new Date(0),
      path: '/',
      secure,
      ...(domain ? { domain } : {}),
    });

  // Every session/csrf/callback name this app may have issued, plus the
  // active-client cookie. In secure mode NextAuth prefixes them: the session is
  // `__Host-` now (was `__Secure-`), csrf is `__Host-` by default, callback is
  // `__Secure-`. Clearing an absent cookie is a harmless no-op.
  const bases = ['authjs.session-token', 'authjs.csrf-token', 'authjs.callback-url'];
  const names = [
    ...bases,
    ...(secure ? bases.flatMap((n) => [`__Host-${n}`, `__Secure-${n}`]) : []),
    'sd-active-client',
  ];

  for (const name of names) {
    // Host-only clear (no Domain) — removes the current host-scoped cookies,
    // including every `__Host-` one, for which a Domain attribute is invalid.
    expire(name);
    // Legacy apex-pinned cookies (the old `__Secure-` session + the Domain-pinned
    // `sd-active-client`) also need a Domain-scoped clear. Never do this for a
    // `__Host-` name — the browser rejects a Domain attribute on it.
    if (secure && !name.startsWith('__Host-')) {
      expire(name, 'simplerdevelopment.com');
      expire(name, '.simplerdevelopment.com');
    }
  }

  return response;
}
