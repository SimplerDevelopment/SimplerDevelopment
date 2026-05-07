/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock DB + auth before importing middleware so the imports don't try to
// reach a real Postgres connection or NextAuth setup.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
}));

const resolveCustomDomain = vi.fn();
vi.mock('@/lib/agency/custom-domain', () => ({
  resolveCustomDomain: (...args: unknown[]) => resolveCustomDomain(...args),
  clearCustomDomainCache: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function buildRequest(url: string, host: string): NextRequest {
  return new NextRequest(new Request(url, { headers: { host } }));
}

describe('middleware: white-label custom domain', () => {
  beforeEach(() => {
    resolveCustomDomain.mockReset();
  });

  it('rewrites root requests on a verified custom domain to /portal', async () => {
    resolveCustomDomain.mockResolvedValueOnce({ clientId: 42, defaultWebsiteId: null });

    const res = await middleware(
      buildRequest('https://portal.acme-agency.com/', 'portal.acme-agency.com'),
    );

    // NextResponse.rewrite produces a response with x-middleware-rewrite
    // pointing at the rewritten URL.
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeTruthy();
    expect(rewriteHeader).toContain('/portal');
    expect(rewriteHeader).not.toContain('/sites/');
    expect(res.headers.get('x-agency-client-id')).toBe('42');
    expect(res.headers.get('x-custom-portal-domain')).toBe('portal.acme-agency.com');
  });

  it('rewrites nested paths on a verified custom domain under /portal/*', async () => {
    resolveCustomDomain.mockResolvedValueOnce({ clientId: 7, defaultWebsiteId: null });

    const res = await middleware(
      buildRequest('https://portal.acme.com/dashboard', 'portal.acme.com'),
    );
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/portal/dashboard');
  });

  it('does not double-prefix when the path already starts with /portal', async () => {
    resolveCustomDomain.mockResolvedValueOnce({ clientId: 1, defaultWebsiteId: null });

    const res = await middleware(
      buildRequest('https://portal.acme.com/portal/login', 'portal.acme.com'),
    );
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/portal/login');
    // Make sure we didn't end up with /portal/portal/login.
    expect(rewriteHeader).not.toContain('/portal/portal/');
  });

  it('falls through to the public-site renderer when no verified custom-domain match exists', async () => {
    resolveCustomDomain.mockResolvedValueOnce(null);

    const res = await middleware(
      buildRequest('https://acme-public-site.com/about', 'acme-public-site.com'),
    );
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/sites/acme-public-site.com/about');
    expect(res.headers.get('x-agency-client-id')).toBeNull();
  });

  it('does not call the custom-domain resolver for app hostnames', async () => {
    // localhost is in APP_HOSTNAMES — the request should be handled by
    // the standard NextAuth middleware, not the custom-domain branch.
    await middleware(buildRequest('http://localhost:3000/portal', 'localhost:3000'));
    expect(resolveCustomDomain).not.toHaveBeenCalled();
  });

  it('does not rewrite static asset requests on a custom-domain host', async () => {
    // File extension short-circuits before custom-domain resolution.
    const res = await middleware(
      buildRequest('https://portal.acme.com/iconLogo.png', 'portal.acme.com'),
    );
    expect(resolveCustomDomain).not.toHaveBeenCalled();
    // No rewrite header on a passthrough.
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
