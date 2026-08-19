/**
 * Guards the tenant boundary of the public-site cache.
 *
 * The whole point of siteCached() is that a cache entry can never be shared
 * across tenants. The realistic way that breaks is a closure — capturing siteId
 * instead of passing it, which leaves the argument list empty so every tenant
 * hashes to one key and one client's page is served on another client's site.
 * These tests pin the properties that make that unrepresentable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: { keyParts: string[]; tags: string[] }[] = [];

vi.mock('next/cache', () => ({
  // Record what the key/tags would be, then just run the function.
  unstable_cache: (fn: (...a: unknown[]) => unknown, keyParts: string[], opts: { tags: string[] }) => {
    calls.push({ keyParts, tags: opts.tags });
    return (...args: unknown[]) => fn(...args);
  },
  revalidateTag: vi.fn(),
}));

import { siteCached, siteTag, revalidateSiteContent, revalidateSiteChrome } from '@/lib/sites/site-cache';
import { revalidateTag } from 'next/cache';

beforeEach(() => {
  calls.length = 0;
  vi.mocked(revalidateTag).mockClear();
});

describe('siteCached', () => {
  it('always puts the tenant id in the cache key', async () => {
    await siteCached(42, 'branding', async (id: number) => ({ id }), [42]);
    expect(calls[0].keyParts).toContain('site');
    expect(calls[0].keyParts).toContain('42');
  });

  it('always tags the entry with the tenant', async () => {
    await siteCached(42, 'nav', async (id: number) => [id], [42]);
    expect(calls[0].tags).toContain('site:42');
    expect(calls[0].tags).toContain('site:42:nav');
  });

  it('gives two tenants different keys for the same read', async () => {
    await siteCached(1, 'page', async (id: number, slug: string) => `${id}:${slug}`, [1, 'about']);
    await siteCached(2, 'page', async (id: number, slug: string) => `${id}:${slug}`, [2, 'about']);
    expect(calls[0].keyParts).not.toEqual(calls[1].keyParts);
  });

  it('gives the SAME tenant different keys for different arguments', async () => {
    await siteCached(1, 'page', async (id: number, slug: string) => `${id}:${slug}`, [1, 'about']);
    await siteCached(1, 'page', async (id: number, slug: string) => `${id}:${slug}`, [1, 'contact']);
    expect(calls[0].keyParts).not.toEqual(calls[1].keyParts);
  });

  it('returns the fetcher result unchanged', async () => {
    const out = await siteCached(7, 'home', async (id: number) => ({ siteId: id, ok: true }), [7]);
    expect(out).toEqual({ siteId: 7, ok: true });
  });

  it('passes the arguments through to the fetcher', async () => {
    const fn = vi.fn(async (_id: number, _slug: string) => null);
    await siteCached(3, 'page', fn, [3, 'pricing']);
    expect(fn).toHaveBeenCalledWith(3, 'pricing');
  });
});

describe('purge helpers', () => {
  it('revalidateSiteContent purges only that tenant\'s content tags', () => {
    revalidateSiteContent(9);
    const tags = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(tags).toEqual(['site:9:page', 'site:9:home', 'site:9:blog-index', 'site:9:posttype']);
    // Nothing global, and nothing belonging to another tenant.
    expect(tags.every((t) => t.startsWith('site:9:'))).toBe(true);
  });

  it('revalidateSiteChrome purges only that tenant\'s chrome tags', () => {
    revalidateSiteChrome(9);
    const tags = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(tags).toEqual(['site:9:branding', 'site:9:nav', 'site:9:tracking']);
  });

  it('siteTag namespaces by tenant', () => {
    expect(siteTag(5)).toBe('site:5');
    expect(siteTag(5, 'nav')).toBe('site:5:nav');
    expect(siteTag(5)).not.toBe(siteTag(50));
  });
});
