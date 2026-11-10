/**
 * AUTH79-013. Tenant sites are siblings of the app on one registrable domain
 * and execute free-form per-site customJs, so SameSite=Lax withholds nothing
 * and script there could fire authenticated writes at /api/portal/** riding a
 * logged-in staff session. CORS does not stop it — CORS governs reading the
 * response, not sending the request.
 *
 * PUX-255 widened the scope to all of /api (see the last two describes).
 *
 * These cases pin both directions, because both are easy to get wrong: the gate
 * must block the sibling-subdomain case, and must NOT block the several kinds
 * of legitimate caller that would otherwise be locked out of the API.
 */
import { describe, it, expect } from 'vitest';
import {
  isCrossSiteWriteBlocked,
  hasSessionCookie,
  stripSessionCookie,
} from '@/lib/security/cross-site-write-gate';

const base = {
  method: 'POST',
  pathname: '/api/portal/cms/posts',
  secFetchSite: 'same-origin' as string | null,
  isTrustedDevOrigin: false,
  hasSessionCookie: false,
  hasAuthorization: false,
};
const at = (o: Partial<typeof base>) => isCrossSiteWriteBlocked({ ...base, ...o });

describe('what gets blocked', () => {
  // The attack: script on <tenant>.simplerdevelopment.com posting to the app.
  // The browser reports this as same-SITE, which is exactly why SameSite=Lax
  // is no defence and why this gate has to exist.
  it('blocks a same-site (sibling subdomain) write', () => {
    expect(at({ secFetchSite: 'same-site' })).toBe(true);
  });

  it('blocks a cross-site write', () => {
    expect(at({ secFetchSite: 'cross-site' })).toBe(true);
  });

  // Typed URL / bookmark. Fine for a GET, meaningless for a portal write.
  it('blocks a write with no initiating context', () => {
    expect(at({ secFetchSite: 'none' })).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks %s', (method) => {
    expect(at({ method, secFetchSite: 'same-site' })).toBe(true);
  });

  it('is case-insensitive about the method', () => {
    expect(at({ method: 'post', secFetchSite: 'cross-site' })).toBe(true);
  });
});

describe('what must keep working', () => {
  it('allows the portal talking to itself', () => {
    expect(at({ secFetchSite: 'same-origin' })).toBe(false);
  });

  // The React Native app, curl, server-to-server, older browsers. Rejecting on
  // absence would break every non-browser consumer to stop an attack that
  // requires a browser to exist at all.
  it('allows a client that sends no Sec-Fetch-Site at all', () => {
    expect(at({ secFetchSite: null })).toBe(false);
  });

  // Expo web on :8081 calling this server on :3000 in local dev is genuinely
  // cross-site. isAllowedDevOrigin is dev-only by construction, so this
  // allowance cannot reach production.
  it('allows the trusted dev origin even when cross-site', () => {
    expect(at({ secFetchSite: 'cross-site', isTrustedDevOrigin: true })).toBe(false);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s — this closes a WRITE hole', (method) => {
    expect(at({ method, secFetchSite: 'cross-site' })).toBe(false);
  });

  // Outside /api/portal the gate only refuses requests that would ride a
  // session (PUX-255). Public routes and webhooks legitimately receive
  // cross-origin traffic, and without the session cookie there is nothing to
  // ride — so they keep working.
  it.each([
    '/api/surveys/abc',          // public, CORS-enabled by design
    '/api/sites/1/navigation',   // public, CORS-enabled by design
    '/api/mcp',                  // external agents, bearer-authenticated
    '/api/cron/process-scheduled-posts',
  ])('does not touch %s when no session cookie rides along', (pathname) => {
    expect(at({ pathname, secFetchSite: 'cross-site' })).toBe(false);
  });
});

// PUX-255: the first version stopped at /api/portal/**, which left every other
// cookie-authenticated mutation open — POST /api/users creates platform admins,
// and a route that reads request.json() accepts a text/plain simple request
// with no preflight.
describe('the rest of /api — refused when it would ride the session', () => {
  const ride = { pathname: '/api/users', hasSessionCookie: true };

  it.each(['same-site', 'cross-site', 'none'])('blocks a %s write carrying the session cookie', (site) => {
    expect(at({ ...ride, secFetchSite: site })).toBe(true);
  });

  it('still allows the app talking to itself', () => {
    expect(at({ ...ride, secFetchSite: 'same-origin' })).toBe(false);
  });

  // No cookie → no ambient authority to abuse.
  it('allows the same request without the session cookie', () => {
    expect(at({ ...ride, hasSessionCookie: false, secFetchSite: 'same-site' })).toBe(false);
  });

  // A page cannot attach Authorization cross-origin without a preflight we never
  // grant, so its presence means the caller is not a forged browser request.
  it('allows a request that authenticates with an Authorization header', () => {
    expect(at({ ...ride, hasAuthorization: true, secFetchSite: 'cross-site' })).toBe(false);
  });

  it('leaves /api/auth/** to NextAuth and its own CSRF token', () => {
    expect(at({ ...ride, pathname: '/api/auth/signout', secFetchSite: 'same-site' })).toBe(false);
  });

  it('keeps /api/portal/** refused even without the cookie (unchanged)', () => {
    expect(at({ secFetchSite: 'same-site', hasSessionCookie: false })).toBe(true);
  });

  it('does not touch non-API paths', () => {
    expect(at({ ...ride, pathname: '/portal/dashboard', secFetchSite: 'cross-site' })).toBe(false);
  });
});

describe('session cookie detection and stripping', () => {
  it.each([
    '__Host-authjs.session-token=abc',
    '__Secure-authjs.session-token=abc',
    'authjs.session-token=abc',
    'a=1; __Secure-authjs.session-token.0=abc; __Secure-authjs.session-token.1=def',
  ])('detects %s', (header) => {
    expect(hasSessionCookie(header)).toBe(true);
  });

  it.each([null, '', 'a=1; b=2', 'authjs.csrf-token=x', 'xauthjs.session-token=1'])(
    'does not mistake %s for a session',
    (header) => {
      expect(hasSessionCookie(header)).toBe(false);
    },
  );

  it('removes every session chunk and keeps everything else', () => {
    expect(
      stripSessionCookie('sd_visitor=v1; __Secure-authjs.session-token.0=a; theme=dark; __Secure-authjs.session-token.1=b'),
    ).toBe('sd_visitor=v1; theme=dark');
  });

  it('returns an empty string when only the session was there', () => {
    expect(stripSessionCookie('__Secure-authjs.session-token=a')).toBe('');
  });
});
