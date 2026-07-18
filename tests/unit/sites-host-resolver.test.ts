// @vitest-environment node
/**
 * Unit tests for the middleware public-site host gate (lib/sites/host-resolver).
 * Locks the security-relevant behaviour: known tenant hosts pass, definitively
 * unknown hosts are rejected, pending domains don't route, and a DB hiccup fails
 * OPEN (never 404s a real tenant on a database blip).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: { selectQueue: unknown[][]; throwOnSelect: boolean } = {
  selectQueue: [],
  throwOnSelect: false,
};

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    if (state.throwOnSelect) throw new Error('db down');
    const rows = state.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'where', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  }
  return { db: { select: () => makeSelectChain() } };
});

import { isKnownSiteHost, clearSiteHostCache } from '@/lib/sites/host-resolver';

beforeEach(() => {
  state.selectQueue = [];
  state.throwOnSelect = false;
  clearSiteHostCache();
});

describe('isKnownSiteHost', () => {
  it('accepts a host that matches an active site on the legacy domain column', async () => {
    state.selectQueue = [[{ id: 1 }]]; // direct match
    expect(await isKnownSiteHost('acme.com')).toBe(true);
  });

  it('accepts a VERIFIED domain in website_domains', async () => {
    state.selectQueue = [[], [{ id: 2 }]]; // direct miss, website_domains hit
    expect(await isKnownSiteHost('shop.acme.com')).toBe(true);
  });

  it('accepts a platform subdomain that maps to an active site', async () => {
    state.selectQueue = [[], [], [{ id: 3 }]]; // direct + domains miss, subdomain hit
    expect(await isKnownSiteHost('client.simplerdevelopment.com')).toBe(true);
  });

  it('rejects a valid-looking host that no tenant has claimed', async () => {
    state.selectQueue = [[], []]; // both lookups empty, not a platform subdomain
    expect(await isKnownSiteHost('evil.example.com')).toBe(false);
  });

  it('rejects an empty host without touching the DB', async () => {
    expect(await isKnownSiteHost('')).toBe(false);
  });

  it('fails OPEN when the DB throws (never 404s a real tenant on a blip)', async () => {
    state.throwOnSelect = true;
    expect(await isKnownSiteHost('acme.com')).toBe(true);
  });

  it('caches a definitive negative (second call does not re-query)', async () => {
    state.selectQueue = [[], []];
    expect(await isKnownSiteHost('nope.example.com')).toBe(false);
    // queue is now empty; a re-query would read [] → still false, but assert the
    // cache short-circuits by flipping throwOnSelect: a cached host must not hit db.
    state.throwOnSelect = true;
    expect(await isKnownSiteHost('nope.example.com')).toBe(false); // served from cache
  });
});
