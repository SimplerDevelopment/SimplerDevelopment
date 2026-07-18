import { describe, it, expect } from 'vitest';
import { normalizeUrl, redactKey, resolveConfigFromSources } from '../../../packages/cli/src/config.js';

describe('normalizeUrl', () => {
  it('leaves a bare origin untouched', () => {
    expect(normalizeUrl('https://portal.example.com')).toBe('https://portal.example.com');
  });

  it('strips a trailing slash', () => {
    expect(normalizeUrl('https://portal.example.com/')).toBe('https://portal.example.com');
  });

  it('strips a trailing /api/mcp (users pasting the full endpoint)', () => {
    expect(normalizeUrl('https://portal.example.com/api/mcp')).toBe('https://portal.example.com');
  });

  it('strips a trailing /api/mcp/ with a trailing slash too', () => {
    expect(normalizeUrl('https://portal.example.com/api/mcp/')).toBe('https://portal.example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://portal.example.com  ')).toBe('https://portal.example.com');
  });
});

describe('redactKey', () => {
  it('shows the sd_mcp_ prefix plus the last 4 characters', () => {
    expect(redactKey('sd_mcp_abcdefghijklmnop1234')).toBe('sd_mcp_...1234');
  });

  it('masks non-prefixed keys generically', () => {
    expect(redactKey('some-other-long-token-value')).toBe('****...alue');
  });

  it('handles missing keys', () => {
    expect(redactKey(undefined)).toBe('(none)');
    expect(redactKey(null)).toBe('(none)');
  });

  it('fully masks short keys', () => {
    expect(redactKey('short')).toBe('****');
  });
});

describe('resolveConfigFromSources — precedence', () => {
  const projectConfig = { apiUrl: 'https://project.example.com', apiKey: 'sd_mcp_projectkey1234' };
  const userConfig = { apiUrl: 'https://user.example.com', apiKey: 'sd_mcp_userkey12345678' };

  it('flags win over everything', () => {
    const resolved = resolveConfigFromSources({
      flags: { apiUrl: 'https://flag.example.com', apiKey: 'sd_mcp_flagkey12345678' },
      env: { SIMPLER_API_URL: 'https://simpler-env.example.com', SD_MCP_URL: 'https://sd-env.example.com' },
      projectConfig,
      userConfig,
    });
    expect(resolved.apiUrl).toBe('https://flag.example.com');
    expect(resolved.apiKey).toBe('sd_mcp_flagkey12345678');
    expect(resolved.source).toBe('flag');
  });

  it('SIMPLER_API_URL/KEY win over SD_MCP_* and files', () => {
    const resolved = resolveConfigFromSources({
      flags: {},
      env: { SIMPLER_API_URL: 'https://simpler-env.example.com/', SD_MCP_URL: 'https://sd-env.example.com' },
      projectConfig,
      userConfig,
    });
    expect(resolved.apiUrl).toBe('https://simpler-env.example.com');
    expect(resolved.apiUrlSource).toBe('env:SIMPLER');
  });

  it('SD_MCP_URL/KEY win over project/user files', () => {
    const resolved = resolveConfigFromSources({
      flags: {},
      env: { SD_MCP_URL: 'https://sd-env.example.com' },
      projectConfig,
      userConfig,
    });
    expect(resolved.apiUrl).toBe('https://sd-env.example.com');
    expect(resolved.apiUrlSource).toBe('env:SD_MCP');
  });

  it('project file wins over user file', () => {
    const resolved = resolveConfigFromSources({
      flags: {},
      env: {},
      projectConfig,
      userConfig,
    });
    expect(resolved.apiUrl).toBe('https://project.example.com');
    expect(resolved.apiUrlSource).toBe('project-file');
  });

  it('falls back to the user file when nothing else is set', () => {
    const resolved = resolveConfigFromSources({
      flags: {},
      env: {},
      projectConfig: null,
      userConfig,
    });
    expect(resolved.apiUrl).toBe('https://user.example.com');
    expect(resolved.apiUrlSource).toBe('user-file');
  });

  it('resolves to null with source "none" when nothing is configured', () => {
    const resolved = resolveConfigFromSources({ flags: {}, env: {}, projectConfig: null, userConfig: null });
    expect(resolved.apiUrl).toBeNull();
    expect(resolved.apiKey).toBeNull();
    expect(resolved.source).toBe('none');
  });

  it('resolves apiUrl and apiKey independently across layers', () => {
    // URL only in env, key only in the user file.
    const resolved = resolveConfigFromSources({
      flags: {},
      env: { SIMPLER_API_URL: 'https://env-only.example.com' },
      projectConfig: null,
      userConfig: { apiKey: 'sd_mcp_useronlykey1234' },
    });
    expect(resolved.apiUrl).toBe('https://env-only.example.com');
    expect(resolved.apiUrlSource).toBe('env:SIMPLER');
    expect(resolved.apiKey).toBe('sd_mcp_useronlykey1234');
    expect(resolved.apiKeySource).toBe('user-file');
  });

  it('normalizes the resolved URL regardless of which layer supplied it', () => {
    const resolved = resolveConfigFromSources({
      flags: {},
      env: { SIMPLER_API_URL: 'https://env.example.com/api/mcp' },
      projectConfig: null,
      userConfig: null,
    });
    expect(resolved.apiUrl).toBe('https://env.example.com');
  });

  it('defaults the timeout when flags do not specify one', () => {
    const resolved = resolveConfigFromSources({ flags: {}, env: {}, projectConfig: null, userConfig: null });
    expect(resolved.timeout).toBe(30_000);
  });

  it('honors an explicit flag timeout', () => {
    const resolved = resolveConfigFromSources({
      flags: { timeout: 5000 },
      env: {},
      projectConfig: null,
      userConfig: null,
    });
    expect(resolved.timeout).toBe(5000);
  });
});
