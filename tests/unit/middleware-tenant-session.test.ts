/**
 * @vitest-environment node
 *
 * PUX-255. In production the portal session cookie is pinned to
 * `.simplerdevelopment.com`, so browsers send it to tenant subdomains too, and
 * those hosts serve /api/** as well as pages. Tenant-authored script there is
 * same-origin with that /api, so the only safe answer is that the session never
 * reaches a route on a tenant subdomain. These cases pin that — and pin that
 * hosts outside the cookie's domain, and the app host itself, are left alone.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => NextResponse.next()) }));
vi.mock('@/lib/agency/custom-domain', () => ({
  resolveCustomDomain: vi.fn(async () => null),
  clearCustomDomainCache: vi.fn(),
}));
vi.mock('@/lib/sites/host-resolver', () => ({
  resolveSiteForHost: vi.fn(async () => ({
    siteId: 1,
    publicAccess: true,
    cdnCacheEnabled: false,
    hasRunningExperiment: false,
    canonicalHost: null,
    redirects: [],
  })),
}));

import { middleware } from '@/middleware';

const SESSION = '__Secure-authjs.session-token=SECRET';

function request(url: string, headers: Record<string, string>, method = 'GET'): NextRequest {
  return new NextRequest(new Request(url, { headers, method }));
}

/**
 * The Cookie header the route will receive. NextResponse.next/rewrite with
 * `{ request: { headers } }` replaces the request headers wholesale: every
 * header the route gets is listed in `x-middleware-override-headers` and
 * carried as `x-middleware-request-<name>`; a header missing from the list is
 * removed. No list at all means the original request passes through.
 */
function forwardedCookie(res: Response): string | null | 'untouched' {
  const list = res.headers.get('x-middleware-override-headers');
  if (list === null) return 'untouched';
  return list.split(',').includes('cookie') ? res.headers.get('x-middleware-request-cookie') : null;
}

describe('tenant subdomains never forward the portal session', () => {
  it('strips it from /api requests and keeps the other cookies', async () => {
    const res = await middleware(
      request('https://acme.simplerdevelopment.com/api/portal/team', {
        host: 'acme.simplerdevelopment.com',
        cookie: `sd_visitor=v1; ${SESSION}`,
      }),
    );
    expect(forwardedCookie(res)).toBe('sd_visitor=v1');
  });

  it('drops the Cookie header entirely when the session was all there was', async () => {
    const res = await middleware(
      request('https://acme.simplerdevelopment.com/api/users', {
        host: 'acme.simplerdevelopment.com',
        cookie: SESSION,
      }),
    );
    expect(forwardedCookie(res)).toBeNull();
  });

  it('strips it from page requests rewritten to the sites renderer', async () => {
    const res = await middleware(
      request('https://acme.simplerdevelopment.com/about', {
        host: 'acme.simplerdevelopment.com',
        cookie: `${SESSION}; theme=dark`,
      }),
    );
    expect(res.headers.get('x-middleware-rewrite')).toContain('/sites/acme.simplerdevelopment.com/about');
    expect(forwardedCookie(res)).toBe('theme=dark');
  });
});

describe('what is left alone', () => {
  it('does not rewrite headers when there is no session cookie', async () => {
    const res = await middleware(
      request('https://acme.simplerdevelopment.com/api/surveys/1', {
        host: 'acme.simplerdevelopment.com',
        cookie: 'sd_visitor=v1',
      }),
    );
    expect(forwardedCookie(res)).toBe('untouched');
  });

  // A custom domain is outside the cookie's domain — the browser never sends it.
  it('does not touch a tenant custom domain', async () => {
    const res = await middleware(
      request('https://acme.com/api/surveys/1', { host: 'acme.com', cookie: SESSION }),
    );
    expect(forwardedCookie(res)).toBe('untouched');
  });

  it('does not touch the app host — the portal needs its session', async () => {
    const res = await middleware(
      request('https://www.simplerdevelopment.com/api/portal/team', {
        host: 'www.simplerdevelopment.com',
        cookie: SESSION,
        'sec-fetch-site': 'same-origin',
      }),
    );
    expect(res.status).not.toBe(403);
    // The app-host flow may republish headers for its own reasons; what matters
    // is that the session still arrives.
    expect([SESSION, 'untouched']).toContain(forwardedCookie(res));
  });
});

describe('the app host refuses forged writes outside /api/portal too', () => {
  it('refuses a same-site POST to /api/users carrying the session', async () => {
    const res = await middleware(
      request(
        'https://www.simplerdevelopment.com/api/users',
        { host: 'www.simplerdevelopment.com', cookie: SESSION, 'sec-fetch-site': 'same-site' },
        'POST',
      ),
    );
    expect(res.status).toBe(403);
  });
});
