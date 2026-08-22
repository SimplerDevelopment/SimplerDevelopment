/**
 * Pins how a tenant request gets redirected before it renders.
 *
 * The failure modes here are not cosmetic: a wrong answer is either an
 * infinite redirect loop (the site is simply down), a lost query string
 * (campaign attribution silently reads zero), or a hijacked off-site link.
 * Each case below is one of those.
 */
import { describe, it, expect } from 'vitest';
import { resolveRedirect, type RedirectPolicyInput } from '@/lib/sites/redirect-policy';

const none: RedirectPolicyInput = { canonicalHost: null, redirects: [] };

describe('resolveRedirect', () => {
  it('renders normally when there is nothing to do', () => {
    expect(resolveRedirect('https://acme.com/about', 'acme.com', none)).toBeNull();
  });

  it('redirects a retired path on the same host', () => {
    const r = resolveRedirect('https://acme.com/services', 'acme.com', {
      canonicalHost: null,
      redirects: [{ from: '/services', to: '/', status: 301 }],
    });
    expect(r).toEqual({ url: 'https://acme.com/', status: 301 });
  });

  it('matches the path case-insensitively', () => {
    const r = resolveRedirect('https://acme.com/Services', 'acme.com', {
      canonicalHost: null,
      redirects: [{ from: '/services', to: '/', status: 301 }],
    });
    expect(r?.url).toBe('https://acme.com/');
  });

  it('honours a 302 when the rule asks for one', () => {
    const r = resolveRedirect('https://acme.com/old', 'acme.com', {
      canonicalHost: null,
      redirects: [{ from: '/old', to: '/new', status: 302 }],
    });
    expect(r?.status).toBe(302);
  });

  it('sends a non-primary domain to the canonical host, path intact', () => {
    const r = resolveRedirect('https://old.com/about', 'old.com', {
      canonicalHost: 'new.com',
      redirects: [],
    });
    expect(r).toEqual({ url: 'https://new.com/about', status: 301 });
  });

  it('leaves the canonical host alone', () => {
    expect(
      resolveRedirect('https://new.com/about', 'new.com', { canonicalHost: 'new.com', redirects: [] }),
    ).toBeNull();
  });

  it('ignores Host header casing when comparing to the canonical host', () => {
    expect(
      resolveRedirect('https://new.com/x', 'NEW.com', { canonicalHost: 'new.com', redirects: [] }),
    ).toBeNull();
  });

  // The whole reason the two mechanisms are resolved together.
  it('applies a path rule AND host canonicalisation in ONE hop', () => {
    const r = resolveRedirect('https://old.com/services', 'old.com', {
      canonicalHost: 'new.com',
      redirects: [{ from: '/services', to: '/', status: 301 }],
    });
    expect(r).toEqual({ url: 'https://new.com/', status: 301 });
  });

  it('preserves the query string so campaign attribution survives', () => {
    const r = resolveRedirect('https://old.com/services?utm_source=cards', 'old.com', {
      canonicalHost: 'new.com',
      redirects: [{ from: '/services', to: '/', status: 301 }],
    });
    expect(r?.url).toBe('https://new.com/?utm_source=cards');
  });

  it('does not re-point an absolute off-site target at the canonical host', () => {
    const r = resolveRedirect('https://old.com/book', 'old.com', {
      canonicalHost: 'new.com',
      redirects: [{ from: '/book', to: 'https://calendly.com/acme', status: 301 }],
    });
    expect(r?.url).toBe('https://calendly.com/acme');
  });

  it('refuses to redirect a path to itself', () => {
    expect(
      resolveRedirect('https://acme.com/loop', 'acme.com', {
        canonicalHost: null,
        redirects: [{ from: '/loop', to: '/loop', status: 301 }],
      }),
    ).toBeNull();
  });

  it('does not loop when the rule target equals the current URL after canonicalisation', () => {
    expect(
      resolveRedirect('https://new.com/a', 'new.com', {
        canonicalHost: 'new.com',
        redirects: [{ from: '/a', to: '/a', status: 301 }],
      }),
    ).toBeNull();
  });

  // A DB hiccup makes host-resolver fail open with these values. It must render,
  // never bounce traffic at a host it could not verify.
  it('renders when the fail-open resolver returns no canonical host or rules', () => {
    expect(resolveRedirect('https://acme.com/anything', 'acme.com', none)).toBeNull();
  });
});
