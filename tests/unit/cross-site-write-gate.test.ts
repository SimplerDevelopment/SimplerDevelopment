/**
 * AUTH79-013. Tenant sites are siblings of the app on one registrable domain
 * and execute free-form per-site customJs, so SameSite=Lax withholds nothing
 * and script there could fire authenticated writes at /api/portal/** riding a
 * logged-in staff session. CORS does not stop it — CORS governs reading the
 * response, not sending the request.
 *
 * These cases pin both directions, because both are easy to get wrong: the gate
 * must block the sibling-subdomain case, and must NOT block the several kinds
 * of legitimate caller that would otherwise be locked out of the API.
 */
import { describe, it, expect } from 'vitest';
import { isCrossSiteWriteBlocked } from '@/lib/security/cross-site-write-gate';

const base = {
  method: 'POST',
  pathname: '/api/portal/cms/posts',
  secFetchSite: 'same-origin' as string | null,
  isTrustedDevOrigin: false,
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

  // Scope is deliberately /api/portal/**. Widening it here would be a separate,
  // much larger decision — public site routes and webhooks live elsewhere and
  // legitimately receive cross-origin traffic.
  it.each([
    '/api/surveys/abc',          // public, CORS-enabled by design
    '/api/sites/1/navigation',   // public, CORS-enabled by design
    '/api/mcp',                  // external agents, bearer-authenticated
    '/api/cron/process-scheduled-posts',
  ])('does not touch %s', (pathname) => {
    expect(at({ pathname, secFetchSite: 'cross-site' })).toBe(false);
  });
});
