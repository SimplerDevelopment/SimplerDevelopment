// Tests for the manifest fetcher. We stub global fetch via vitest so we can
// drive every branch — fresh fetch, cache hit, force refresh, transient HTTP
// failure with and without a populated cache, schema violation, and the two
// cross-checks (id mismatch + scope-superset).

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchAndCacheManifest,
  clearManifestCache,
  isScopeCovered,
} from '@/lib/plugins/manifest';

// Minimal fake of `RegisteredApp` — we only need the four fields the fetcher
// reads. Cast through `unknown` to keep TS happy without dragging in the full
// row shape.
type FakeApp = {
  id: number;
  slug: string;
  manifestUrl: string;
  defaultScopes: string[];
};

const baseApp: FakeApp = {
  id: 1,
  slug: 'content-tools',
  manifestUrl: 'https://content-tools.simplerdevelopment.com/sd-manifest.json',
  defaultScopes: ['content:research:read', 'content:research:write'],
};

const validManifestJson = {
  id: 'content-tools',
  version: '0.1.0',
  nav: [{ label: 'Dashboard', href: '/', icon: 'dashboard' }],
  requiredScopes: ['content:research:read'],
  callbacks: [
    {
      method: 'POST',
      path: '/scripts/run',
      scope: 'content:research:write',
    },
  ],
  publishedAt: '2026-05-15T00:00:00Z',
};

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response);
}

function mockFetchStatus(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response);
}

beforeEach(() => {
  clearManifestCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAndCacheManifest — happy path + caching', () => {
  it('first fetch returns fresh result and populates cache', async () => {
    const fetchMock = mockFetchOk(validManifestJson);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAndCacheManifest(baseApp);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.stale).toBe(false);
    expect(result.manifest.id).toBe('content-tools');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('second fetch within TTL returns from cache without hitting fetch', async () => {
    const fetchMock = mockFetchOk(validManifestJson);
    vi.stubGlobal('fetch', fetchMock);

    await fetchAndCacheManifest(baseApp, { now: 1_000_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const result = await fetchAndCacheManifest(baseApp, { now: 1_000_500 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.stale).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('force=true bypasses cache and refetches', async () => {
    const fetchMock = mockFetchOk(validManifestJson);
    vi.stubGlobal('fetch', fetchMock);

    await fetchAndCacheManifest(baseApp, { now: 1_000_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchAndCacheManifest(baseApp, { now: 1_000_500, force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches once cache TTL has elapsed', async () => {
    const fetchMock = mockFetchOk(validManifestJson);
    vi.stubGlobal('fetch', fetchMock);

    await fetchAndCacheManifest(baseApp, { now: 1_000_000 });
    // 60_001 ms later — past the 60s TTL.
    await fetchAndCacheManifest(baseApp, { now: 1_060_001 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchAndCacheManifest — fetch failures', () => {
  it('HTTP 500 with populated cache returns stale=true', async () => {
    // Prime the cache with a successful fetch.
    vi.stubGlobal('fetch', mockFetchOk(validManifestJson));
    await fetchAndCacheManifest(baseApp, { now: 1_000_000 });

    // Now switch fetch to fail; force-refresh to bypass cache freshness.
    vi.stubGlobal('fetch', mockFetchStatus(500));
    const result = await fetchAndCacheManifest(baseApp, {
      now: 1_060_001, // past TTL so we attempt a refetch
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.stale).toBe(true);
    if (!result.stale) throw new Error('expected stale');
    expect(result.reason).toMatch(/500/);
    expect(result.manifest.id).toBe('content-tools');
  });

  it('HTTP 500 with no cache returns ok=false fetch-failed', async () => {
    vi.stubGlobal('fetch', mockFetchStatus(500));
    const result = await fetchAndCacheManifest(baseApp);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.reason).toBe('fetch-failed');
    expect(result.details).toMatch(/500/);
  });

  it('fetch rejection (e.g. timeout) with cache returns stale=true', async () => {
    vi.stubGlobal('fetch', mockFetchOk(validManifestJson));
    await fetchAndCacheManifest(baseApp, { now: 1_000_000 });

    const timeoutErr = new Error('TimeoutError: signal timed out');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));

    const result = await fetchAndCacheManifest(baseApp, { now: 1_060_001 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.stale).toBe(true);
    if (!result.stale) throw new Error('expected stale');
    expect(result.reason).toMatch(/Timeout|fetch-failed/);
  });

  it('fetch rejection with no cache returns fetch-failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    );
    const result = await fetchAndCacheManifest(baseApp);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.reason).toBe('fetch-failed');
  });
});

describe('fetchAndCacheManifest — cross-checks', () => {
  it('rejects when manifest.id does not match app.slug', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk({ ...validManifestJson, id: 'wrong-slug' }),
    );
    const result = await fetchAndCacheManifest(baseApp);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.reason).toBe('id-mismatch');
    expect(result.details).toMatch(/wrong-slug/);
  });

  it('rejects when requiredScopes is not subset of defaultScopes', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk({
        ...validManifestJson,
        requiredScopes: ['content:research:read', 'admin:everything:write'],
      }),
    );
    const result = await fetchAndCacheManifest(baseApp);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.reason).toBe('scope-superset');
    expect(result.details).toMatch(/admin:everything:write/);
  });

  it('rejects when manifest JSON fails Zod validation', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk({ ...validManifestJson, version: 'not-semver' }),
    );
    const result = await fetchAndCacheManifest(baseApp);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.reason).toBe('validation-failed');
  });

  it('accepts requiredScopes covered by wildcard defaultScope', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk({
        ...validManifestJson,
        requiredScopes: ['content:research:read', 'content:research:write'],
      }),
    );
    const wildcardApp: FakeApp = {
      ...baseApp,
      defaultScopes: ['content:*'],
    };
    const result = await fetchAndCacheManifest(wildcardApp);
    expect(result.ok).toBe(true);
  });
});

describe('isScopeCovered', () => {
  it('exact match returns true', () => {
    expect(isScopeCovered('foo:bar:read', ['foo:bar:read'])).toBe(true);
  });

  it('exact mismatch returns false', () => {
    expect(isScopeCovered('foo:bar:read', ['foo:bar:write'])).toBe(false);
  });

  it("'foo:bar:*' covers 'foo:bar:read'", () => {
    expect(isScopeCovered('foo:bar:read', ['foo:bar:*'])).toBe(true);
  });

  it("'foo:*' covers 'foo:bar:read'", () => {
    expect(isScopeCovered('foo:bar:read', ['foo:*'])).toBe(true);
  });

  it("'foo:*' covers a wildcard 'foo:bar:*'", () => {
    expect(isScopeCovered('foo:bar:*', ['foo:*'])).toBe(true);
  });

  it("'foo:bar:*' does NOT cover 'foo:baz:read'", () => {
    expect(isScopeCovered('foo:baz:read', ['foo:bar:*'])).toBe(false);
  });

  it('empty granted returns false', () => {
    expect(isScopeCovered('foo:bar:read', [])).toBe(false);
  });

  it('multiple granted scopes — any match wins', () => {
    expect(
      isScopeCovered('foo:bar:read', ['other:thing:*', 'foo:bar:*']),
    ).toBe(true);
  });
});
