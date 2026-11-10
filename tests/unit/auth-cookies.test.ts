/**
 * The escape hatch AUTH_INSECURE_COOKIES=1 drops the Secure flag. It is correct
 * for a production BUILD served over plain HTTP (CI e2e, self-host behind
 * upstream TLS) and catastrophic on a real production deploy, where it would
 * ship the session cookie over plaintext HTTP. AUTH79-018.
 *
 * These cases pin both halves: the flag must keep working where it is needed,
 * and must be ignored where it is dangerous.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secureCookiesEnabled, sessionCookieName, __resetSecureCookieWarning } from '@/lib/auth-cookies';

const saved = { ...process.env };

function env(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string>)[k] = v;
  }
}

beforeEach(() => {
  __resetSecureCookieWarning();
  env({ NODE_ENV: undefined, AUTH_INSECURE_COOKIES: undefined, VERCEL_ENV: undefined });
});
afterEach(() => {
  for (const k of ['NODE_ENV', 'AUTH_INSECURE_COOKIES', 'VERCEL_ENV']) {
    if (saved[k] === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string>)[k] = saved[k] as string;
  }
});

describe('secureCookiesEnabled', () => {
  it('is off outside a production build — localhost is http', () => {
    env({ NODE_ENV: 'development' });
    expect(secureCookiesEnabled()).toBe(false);
  });

  it('is on for an ordinary production build', () => {
    env({ NODE_ENV: 'production' });
    expect(secureCookiesEnabled()).toBe(true);
  });

  // The case the flag exists for: CI runs `bun start` (NODE_ENV=production) on
  // http://localhost:3000. Breaking this re-breaks ~1000 e2e specs (QAD-047).
  it('honours the escape hatch in CI — production build, no VERCEL_ENV', () => {
    env({ NODE_ENV: 'production', AUTH_INSECURE_COOKIES: '1' });
    expect(secureCookiesEnabled()).toBe(false);
  });

  it('honours the escape hatch on a preview deploy', () => {
    env({ NODE_ENV: 'production', AUTH_INSECURE_COOKIES: '1', VERCEL_ENV: 'preview' });
    expect(secureCookiesEnabled()).toBe(false);
  });

  // The bug AUTH79-018 is about: a CI env-var set copy-pasted into production.
  it('IGNORES the escape hatch on a real production deploy', () => {
    env({ NODE_ENV: 'production', AUTH_INSECURE_COOKIES: '1', VERCEL_ENV: 'production' });
    expect(secureCookiesEnabled()).toBe(true);
  });

  it('logs loudly when it ignores the flag, so the misconfiguration is findable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    env({ NODE_ENV: 'production', AUTH_INSECURE_COOKIES: '1', VERCEL_ENV: 'production' });
    secureCookiesEnabled();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('auth.insecure_cookies_ignored');
    spy.mockRestore();
  });

  it('warns once, not on every request', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    env({ NODE_ENV: 'production', AUTH_INSECURE_COOKIES: '1', VERCEL_ENV: 'production' });
    secureCookiesEnabled();
    secureCookiesEnabled();
    secureCookiesEnabled();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

// PUX-258: the session cookie name encodes the scheme. `__Host-` is the
// host-only default that closes cross-subdomain riding/fixation; a self-hoster
// who pins AUTH_COOKIE_DOMAIN falls back to `__Secure-` because `__Host-` cannot
// carry a Domain; insecure builds use the bare name.
describe('sessionCookieName (PUX-258)', () => {
  it('uses the bare name for insecure builds, Domain pinned or not', () => {
    expect(sessionCookieName(false, undefined)).toBe('authjs.session-token');
    expect(sessionCookieName(false, '.example.com')).toBe('authjs.session-token');
  });

  it('defaults to a host-only __Host- cookie when secure and no Domain is pinned', () => {
    expect(sessionCookieName(true, undefined)).toBe('__Host-authjs.session-token');
  });

  it('falls back to __Secure- when a Domain is pinned — __Host- forbids a Domain', () => {
    expect(sessionCookieName(true, '.example.com')).toBe('__Secure-authjs.session-token');
  });
});

// The three call sites drifted once already (QAD-047). Pin that they import the
// shared helper rather than restating the condition.
describe('no call site restates the condition', () => {
  it.each([
    'lib/auth.ts',
    'lib/plugins/tenant-cookie.ts',
    'app/api/portal/sign-out/route.ts',
  ])('%s imports secureCookiesEnabled instead of hand-rolling it', async (file) => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(file, 'utf8');
    expect(src).toContain("from '@/lib/auth-cookies'");
    expect(
      src.includes("process.env.AUTH_INSECURE_COOKIES !== '1'"),
      `${file} hand-rolls the secure-cookie condition again — import secureCookiesEnabled instead`,
    ).toBe(false);
  });
});
