// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSerpProvider,
  getKeywordProvider,
  getBacklinkProvider,
  isProviderConfigured,
} from '@/lib/seo/providers';
import { ProviderNotConfiguredError } from '@/lib/seo/providers/types';

const ENV_KEYS = ['SEO_SERP_PROVIDER', 'SEO_KEYWORD_PROVIDER', 'SEO_BACKLINK_PROVIDER'] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('provider registry — env unset', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('returns the not-configured stub for each kind', () => {
    expect(getSerpProvider().name).toBe('not-configured');
    expect(getKeywordProvider().name).toBe('not-configured');
    expect(getBacklinkProvider().name).toBe('not-configured');
  });

  it('isProviderConfigured is false by default for every kind', () => {
    expect(isProviderConfigured('serp')).toBe(false);
    expect(isProviderConfigured('keyword')).toBe(false);
    expect(isProviderConfigured('backlink')).toBe(false);
  });
});

describe('provider registry — unknown env value', () => {
  beforeEach(() => {
    process.env.SEO_SERP_PROVIDER = 'some-vendor-that-does-not-exist';
    process.env.SEO_KEYWORD_PROVIDER = 'some-vendor-that-does-not-exist';
    process.env.SEO_BACKLINK_PROVIDER = 'some-vendor-that-does-not-exist';
  });

  it('falls back to the not-configured stub rather than throwing', () => {
    expect(() => getSerpProvider()).not.toThrow();
    expect(getSerpProvider().name).toBe('not-configured');
    expect(getKeywordProvider().name).toBe('not-configured');
    expect(getBacklinkProvider().name).toBe('not-configured');
  });

  it('still reports not configured', () => {
    expect(isProviderConfigured('serp')).toBe(false);
    expect(isProviderConfigured('keyword')).toBe(false);
    expect(isProviderConfigured('backlink')).toBe(false);
  });
});

describe('not-configured stub — SerpProvider', () => {
  it('rejects search() with the typed error', async () => {
    const provider = getSerpProvider();
    await expect(provider.search({ keyword: 'test' })).rejects.toMatchObject({
      code: 'provider-not-configured',
    });
    await expect(provider.search({ keyword: 'test' })).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });
});

describe('not-configured stub — KeywordProvider', () => {
  it('rejects getMetrics() with the typed error', async () => {
    const provider = getKeywordProvider();
    await expect(provider.getMetrics(['test'])).rejects.toMatchObject({
      code: 'provider-not-configured',
    });
  });

  it('rejects getSuggestions() with the typed error', async () => {
    const provider = getKeywordProvider();
    await expect(provider.getSuggestions('test')).rejects.toMatchObject({
      code: 'provider-not-configured',
    });
  });
});

describe('not-configured stub — BacklinkProvider', () => {
  it('rejects getSummary() with the typed error', async () => {
    const provider = getBacklinkProvider();
    await expect(provider.getSummary('example.com')).rejects.toMatchObject({
      code: 'provider-not-configured',
    });
  });

  it('rejects getBacklinks() with the typed error', async () => {
    const provider = getBacklinkProvider();
    await expect(provider.getBacklinks('example.com')).rejects.toMatchObject({
      code: 'provider-not-configured',
    });
  });

  it('rejects getReferringDomains() with the typed error', async () => {
    const provider = getBacklinkProvider();
    await expect(provider.getReferringDomains('example.com')).rejects.toMatchObject({
      code: 'provider-not-configured',
    });
  });
});
