// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { parseBrandfetch, fetchBrandData, normalizeDomain } from '@/lib/branding/brandfetch';

const SAMPLE = {
  name: 'Acme Co',
  logos: [
    { type: 'logo', formats: [{ src: 'https://cdn.brandfetch.io/acme/logo.svg' }] },
    { type: 'icon', formats: [{ src: 'https://cdn.brandfetch.io/acme/icon.png' }] },
  ],
  colors: [
    { hex: '#ff5722', type: 'brand' },
    { hex: '#ffffff', type: 'light' },
    { hex: '#00bcd4', type: 'accent' },
  ],
};

describe('normalizeDomain', () => {
  it('strips scheme, www, path, port', () => {
    expect(normalizeDomain('https://www.Acme.com/about?x=1')).toBe('acme.com');
    expect(normalizeDomain('acme.com:3000')).toBe('acme.com');
    expect(normalizeDomain('  HTTP://ACME.COM  ')).toBe('acme.com');
  });
});

describe('parseBrandfetch', () => {
  it('maps name, logo, icon, and colors', () => {
    expect(parseBrandfetch(SAMPLE)).toEqual({
      name: 'Acme Co',
      logoUrl: 'https://cdn.brandfetch.io/acme/logo.svg',
      iconUrl: 'https://cdn.brandfetch.io/acme/icon.png',
      primaryColor: '#ff5722',
      secondaryColor: '#ffffff',
      accentColor: '#00bcd4',
    });
  });

  it('falls back primary→dark when no brand color', () => {
    const r = parseBrandfetch({ colors: [{ hex: '#222', type: 'dark' }] });
    expect(r?.primaryColor).toBe('#222');
    expect(r?.secondaryColor).toBe('#222');
  });

  it('returns null for empty / non-object / no usable fields', () => {
    expect(parseBrandfetch(null)).toBeNull();
    expect(parseBrandfetch('x')).toBeNull();
    expect(parseBrandfetch({})).toBeNull();
    expect(parseBrandfetch({ logos: [], colors: [] })).toBeNull();
  });
});

describe('fetchBrandData', () => {
  it('returns parsed data on a 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(SAMPLE) });
    const r = await fetchBrandData('https://www.acme.com', { apiKey: 'k', fetchImpl: fetchImpl as never });
    expect(r?.name).toBe('Acme Co');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.brandfetch.io/v2/brands/acme.com',
      expect.objectContaining({ headers: { Authorization: 'Bearer k' } }),
    );
  });

  it('returns null (no throw) when there is no API key — graceful fallback', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchBrandData('acme.com', { fetchImpl: fetchImpl as never })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null on a non-OK response or a network error', async () => {
    expect(await fetchBrandData('acme.com', { apiKey: 'k', fetchImpl: (() => Promise.resolve({ ok: false })) as never })).toBeNull();
    expect(await fetchBrandData('acme.com', { apiKey: 'k', fetchImpl: (() => Promise.reject(new Error('net'))) as never })).toBeNull();
  });

  it('returns null for an empty domain without calling fetch', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchBrandData('', { apiKey: 'k', fetchImpl: fetchImpl as never })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
