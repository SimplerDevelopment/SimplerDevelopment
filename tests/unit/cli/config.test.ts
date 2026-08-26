import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  redactKey,
  resolveConfigFromSources,
  resolveActiveProfile,
  extractProfiles,
  LEGACY_PROFILE_NAME,
} from '../../../packages/cli/src/config.js';
import type { StoredConfigFile } from '../../../packages/cli/src/config.js';

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

// JUL9-001: multi-tenant profiles. `extractProfiles`/`resolveActiveProfile`
// are pure (no filesystem/env access — the raw file contents and flag/env
// overrides are passed in explicitly), so they're unit-testable the same way
// `resolveConfigFromSources` is above. The filesystem-touching siblings
// (writeProfile, listProfiles, setActiveProfile, authSwitch, …) read/write
// the REAL `~/.simpler/config.json` via homedir() with no injectable path —
// exercising those would mean mutating the operator's actual credential
// file from a unit test, which is worse than not testing them; per
// tests/CLAUDE.md's layer-picking rule that's not unit-test territory.
describe('extractProfiles', () => {
  it('returns {} for a null file', () => {
    expect(extractProfiles(null)).toEqual({});
  });

  it('returns {} for an empty file with no legacy fields and no profiles', () => {
    expect(extractProfiles({})).toEqual({});
  });

  it('reads a profiles-shaped file as-is', () => {
    const file: StoredConfigFile = {
      profiles: {
        work: { apiUrl: 'https://work.example.com', apiKey: 'test-workkey-1234' },
        personal: { apiUrl: 'https://personal.example.com', apiKey: 'test-persokey-1234' },
      },
      activeProfile: 'work',
    };
    expect(extractProfiles(file)).toEqual(file.profiles);
  });

  it('migrates a legacy flat file into one implicit profile named "default"', () => {
    const file: StoredConfigFile = {
      apiUrl: 'https://legacy.example.com',
      apiKey: 'test-legacykey-1234',
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
    };
    expect(extractProfiles(file)).toEqual({
      [LEGACY_PROFILE_NAME]: {
        apiUrl: 'https://legacy.example.com',
        apiKey: 'test-legacykey-1234',
        accessToken: undefined,
        refreshToken: undefined,
        expiresAt: undefined,
      },
    });
  });

  it('migrates a legacy OAuth-only flat file (accessToken, no apiKey) too', () => {
    const file: StoredConfigFile = {
      apiUrl: 'https://legacy.example.com',
      accessToken: 'oauth-token-123',
      refreshToken: 'refresh-123',
      expiresAt: '2026-01-01T00:00:00.000Z',
    };
    expect(extractProfiles(file)[LEGACY_PROFILE_NAME]).toMatchObject({ accessToken: 'oauth-token-123' });
  });

  it('prefers the profiles shape over legacy flat fields if both are somehow present', () => {
    const file: StoredConfigFile = {
      apiUrl: 'https://stale-legacy.example.com',
      apiKey: 'test-stalekey-1234',
      profiles: { work: { apiUrl: 'https://work.example.com', apiKey: 'test-workkey-1234' } },
    };
    expect(extractProfiles(file)).toEqual(file.profiles);
  });
});

describe('resolveActiveProfile — precedence (JUL9-001)', () => {
  const twoProfiles: StoredConfigFile = {
    profiles: {
      work: { apiUrl: 'https://work.example.com', apiKey: 'test-workkey-1234' },
      personal: { apiUrl: 'https://personal.example.com', apiKey: 'test-persokey-1234' },
    },
    activeProfile: 'personal',
  };

  it('the --profile flag wins over everything', () => {
    const r = resolveActiveProfile(twoProfiles, { flagProfile: 'work', envProfile: 'personal' });
    expect(r).toMatchObject({ name: 'work', source: 'flag', config: twoProfiles.profiles!.work });
  });

  it('SIMPLER_PROFILE env wins over the stored activeProfile', () => {
    const r = resolveActiveProfile(twoProfiles, { envProfile: 'work' });
    expect(r).toMatchObject({ name: 'work', source: 'env', config: twoProfiles.profiles!.work });
  });

  it('falls back to the file-stored activeProfile when no flag/env override is given', () => {
    const r = resolveActiveProfile(twoProfiles, {});
    expect(r).toMatchObject({ name: 'personal', source: 'stored', config: twoProfiles.profiles!.personal });
  });

  it('an explicit --profile naming an unknown profile reports notFound, not a silent fallback', () => {
    const r = resolveActiveProfile(twoProfiles, { flagProfile: 'nonexistent' });
    expect(r.config).toBeNull();
    expect(r.notFound).toBe('nonexistent');
    expect(r.profiles).toEqual(twoProfiles.profiles);
  });

  it('an unknown SIMPLER_PROFILE env value also reports notFound', () => {
    const r = resolveActiveProfile(twoProfiles, { envProfile: 'nope' });
    expect(r.notFound).toBe('nope');
  });

  it('a stored activeProfile pointing at a deleted profile reports notFound', () => {
    const file: StoredConfigFile = { profiles: { work: twoProfiles.profiles!.work }, activeProfile: 'personal' };
    const r = resolveActiveProfile(file, {});
    expect(r.notFound).toBe('personal');
  });

  it('resolves the sole profile implicitly when exactly one exists and none is marked active (legacy files)', () => {
    const file: StoredConfigFile = { apiUrl: 'https://legacy.example.com', apiKey: 'test-legacykey-1234' };
    const r = resolveActiveProfile(file, {});
    expect(r).toMatchObject({ name: LEGACY_PROFILE_NAME, source: 'implicit' });
  });

  it('is ambiguous (not a silent guess) when 2+ profiles exist and none is marked active', () => {
    const file: StoredConfigFile = { profiles: twoProfiles.profiles };
    const r = resolveActiveProfile(file, {});
    expect(r.name).toBeNull();
    expect(r.config).toBeNull();
    expect(r.ambiguous).toBe(true);
  });

  it('"no profile configured" path: a null file resolves to no profile, not an error', () => {
    const r = resolveActiveProfile(null, {});
    expect(r).toEqual({ name: null, source: 'none', profiles: {}, config: null });
  });

  it('"no profile configured" path: an empty file with no legacy fields resolves the same way', () => {
    const r = resolveActiveProfile({}, {});
    expect(r).toEqual({ name: null, source: 'none', profiles: {}, config: null });
  });

  it('flag takes precedence even when it names a profile that does not exist (fails loud, not quiet)', () => {
    const r = resolveActiveProfile(twoProfiles, { flagProfile: 'ghost', envProfile: 'work' });
    expect(r.source).toBe('flag');
    expect(r.notFound).toBe('ghost');
  });
});
