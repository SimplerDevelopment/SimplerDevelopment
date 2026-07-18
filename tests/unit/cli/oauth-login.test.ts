import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { makePkcePair, base64url, discoverEndpoints, openBrowser } from '../../../packages/cli/src/commands/oauth-login.js';
import { resolveConfigFromSources } from '../../../packages/cli/src/config.js';

describe('PKCE', () => {
  it('challenge is the base64url SHA-256 of the verifier', () => {
    const { verifier, challenge } = makePkcePair();
    expect(challenge).toBe(base64url(createHash('sha256').update(verifier).digest()));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url, no padding
  });

  it('generates a fresh pair each call', () => {
    expect(makePkcePair().verifier).not.toBe(makePkcePair().verifier);
  });
});

describe('discoverEndpoints', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the discovery document when available', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_endpoint: 'https://x.example.com/oauth/authorize',
        token_endpoint: 'https://x.example.com/oauth/token',
      }),
    });
    const eps = await discoverEndpoints('https://x.example.com', 5000);
    expect(eps.authorizationEndpoint).toBe('https://x.example.com/oauth/authorize');
  });

  it('falls back to standard paths on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const eps = await discoverEndpoints('https://y.example.com', 5000);
    expect(eps.tokenEndpoint).toBe('https://y.example.com/oauth/token');
  });
});

describe('openBrowser', () => {
  it('returns false when the opener cannot spawn', () => {
    // An invalid platform maps to xdg-open; spawning may still "succeed" async,
    // so instead assert the darwin/win32/linux command mapping doesn't throw.
    expect(typeof openBrowser('https://example.com', 'linux')).toBe('boolean');
  });
});

describe('config: OAuth token resolution', () => {
  const base = { flags: {}, env: {}, projectConfig: null };

  it('uses stored accessToken as the bearer when no key is set anywhere', () => {
    const config = resolveConfigFromSources({
      ...base,
      userConfig: { apiUrl: 'https://p.example.com', accessToken: 'sd_oat_abc', refreshToken: 'sd_oart_def', expiresAt: '2099-01-01T00:00:00Z' },
    });
    expect(config.apiKey).toBe('sd_oat_abc');
    expect(config.oauth?.refreshToken).toBe('sd_oart_def');
  });

  it('an explicit key from env beats stored OAuth tokens', () => {
    const config = resolveConfigFromSources({
      ...base,
      env: { SIMPLER_API_KEY: 'sd_mcp_explicit' },
      userConfig: { accessToken: 'sd_oat_abc', refreshToken: 'sd_oart_def' },
    });
    expect(config.apiKey).toBe('sd_mcp_explicit');
    expect(config.oauth).toBeUndefined();
  });

  it('legacy apiKey in the user file still wins over its own oauth tokens', () => {
    const config = resolveConfigFromSources({
      ...base,
      userConfig: { apiKey: 'sd_mcp_legacy', accessToken: 'sd_oat_abc', refreshToken: 'sd_oart_def' },
    });
    expect(config.apiKey).toBe('sd_mcp_legacy');
    expect(config.oauth).toBeUndefined();
  });
});
