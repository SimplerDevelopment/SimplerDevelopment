/**
 * Config resolution for the `simpler` CLI.
 *
 * Precedence (highest wins): flags > SIMPLER_API_URL/SIMPLER_API_KEY env >
 * SD_MCP_URL/SD_MCP_API_KEY env (existing repo convention) > ./.simpler.json
 * (project) > the ACTIVE PROFILE in ~/.simpler/config.json (user, written by
 * `auth login`).
 *
 * The pure resolution logic (`resolveConfigFromSources`) takes an explicit
 * bag of inputs so it's unit-testable without touching the filesystem or
 * real env vars. `loadConfig()` is the impure entrypoint that gathers those
 * inputs from the real world and is what `src/index.ts` calls.
 *
 * Multi-tenant profiles (JUL9-001): `~/.simpler/config.json` can hold several
 * NAMED credentials under `profiles`, plus an `activeProfile` marker — e.g. a
 * dev with both an internal SimplerDevelopment key and a client key no longer
 * overwrites one with the other on every `auth login`. Which profile is
 * "active" is itself resolved with its own precedence (`resolveActiveProfile`,
 * used by `loadConfig`): --profile flag > SIMPLER_PROFILE env > the file's
 * stored `activeProfile` > the sole profile when exactly one exists (the
 * legacy, pre-profile shape collapses to this case so old files keep working
 * unchanged). This module NEVER trusts a profile's NAME as proof of which
 * tenant it belongs to — see `assertClientMatches` / `authSwitch` in
 * client.ts / commands/profile.ts, which resolve identity from a live
 * `whoami` call instead. A local label is exactly what went wrong in
 * JUL9-001 (a profile/key quietly bound to the wrong company).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

import { CliError } from './client.js';

export type ConfigSource =
  | 'flag'
  | 'env:SIMPLER'
  | 'env:SD_MCP'
  | 'project-file'
  | 'user-file'
  | 'none';

export interface ConfigFlags {
  apiUrl?: string;
  apiKey?: string;
  timeout?: number;
  /** Selects a named credential profile — see the module doc. */
  profile?: string;
}

export interface StoredConfig {
  apiUrl?: string;
  apiKey?: string;
  /** OAuth browser-login credentials (written by `auth login`). */
  accessToken?: string;
  refreshToken?: string;
  /** ISO timestamp when accessToken expires. */
  expiresAt?: string;
}

/**
 * On-disk shape of `~/.simpler/config.json`. The flat `apiUrl`/`apiKey`/…
 * fields are the LEGACY (pre-profiles) shape — `extractProfiles` reads them
 * as an implicit single profile named `default` so files written before
 * 2026-08-26 keep working without a migration step. Any write (`writeProfile`
 * / `setActiveProfile`) always persists the `profiles` shape going forward.
 */
export interface StoredConfigFile {
  apiUrl?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  profiles?: Record<string, StoredConfig>;
  activeProfile?: string;
}

export const LEGACY_PROFILE_NAME = 'default';

export interface ConfigSources {
  flags: ConfigFlags;
  env: Record<string, string | undefined>;
  projectConfig?: StoredConfig | null;
  userConfig?: StoredConfig | null;
}

export interface ResolvedConfig {
  apiUrl: string | null;
  apiKey: string | null;
  /** Which layer supplied apiUrl (or apiKey, if they diverge — apiUrlSource/apiKeySource cover that). */
  source: ConfigSource;
  apiUrlSource: ConfigSource;
  apiKeySource: ConfigSource;
  timeout: number;
  /** Set when apiKey is an OAuth access token from the user file — enables auto-refresh. */
  oauth?: { refreshToken: string; expiresAt: string | null };
  /** Name of the credential profile that supplied `userConfig`, if any (see `loadConfig`). */
  activeProfile?: string | null;
  activeProfileSource?: ProfileSource;
  /** Every profile name known in ~/.simpler/config.json, for error messages / `doctor`. */
  knownProfiles?: string[];
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Normalize a portal URL to a bare origin: strips a trailing `/api/mcp`
 * (in case the user pastes the full MCP endpoint) and any trailing slash.
 */
export function normalizeUrl(input: string): string {
  let url = input.trim();
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api\/mcp$/, '');
  url = url.replace(/\/+$/, '');
  return url;
}

/**
 * Redact an API key for display: shows the `sd_mcp_` prefix plus the last 4
 * characters, masking everything in between. Falls back to a generic mask
 * for keys that don't carry the expected prefix.
 */
export function redactKey(key: string | null | undefined): string {
  if (!key) return '(none)';
  const last4 = key.length >= 4 ? key.slice(-4) : key;
  const prefix = /^(sd_[a-z]+_)/.exec(key)?.[1];
  if (prefix) {
    return `${prefix}...${last4}`;
  }
  if (key.length <= 8) return '****';
  return `****...${last4}`;
}

function userConfigDir(): string {
  return join(homedir(), '.simpler');
}

export function userConfigPath(): string {
  return join(userConfigDir(), 'config.json');
}

export function projectConfigPath(cwd: string = process.cwd()): string {
  return resolvePath(cwd, '.simpler.json');
}

function readJsonConfig<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as T;
    return null;
  } catch {
    return null;
  }
}

/** Raw read of the whole `~/.simpler/config.json` file — may be legacy-flat or profiles-shaped. */
export function readUserConfigFile(): StoredConfigFile | null {
  return readJsonConfig<StoredConfigFile>(userConfigPath());
}

export function readProjectConfig(cwd: string = process.cwd()): StoredConfig | null {
  return readJsonConfig<StoredConfig>(projectConfigPath(cwd));
}

/**
 * Normalize a raw on-disk file to its named-profiles map. A legacy flat file
 * (no `profiles` key, just top-level apiUrl/apiKey/accessToken/…) is treated
 * as a single implicit profile named `default` — this is the entire back-compat
 * story: old files read correctly forever, and the first write upgrades the
 * shape (see `writeProfile`).
 */
export function extractProfiles(file: StoredConfigFile | null): Record<string, StoredConfig> {
  if (!file) return {};
  if (file.profiles && Object.keys(file.profiles).length > 0) {
    return { ...file.profiles };
  }
  if (file.apiUrl || file.apiKey || file.accessToken) {
    return {
      [LEGACY_PROFILE_NAME]: {
        apiUrl: file.apiUrl,
        apiKey: file.apiKey,
        accessToken: file.accessToken,
        refreshToken: file.refreshToken,
        expiresAt: file.expiresAt,
      },
    };
  }
  return {};
}

function persistProfilesFile(file: StoredConfigFile): void {
  const dir = userConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const path = userConfigPath();
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
  // writeFileSync's mode option only applies when the file is created; make
  // sure a pre-existing file is tightened too.
  chmodSync(path, 0o600);
}

/**
 * Merge `patch` into the named profile (creating it if new) and persist —
 * used by `auth login` / OAuth token refresh. Always upgrades a legacy flat
 * file to the `profiles` shape on write (reads keep supporting both shapes
 * forever; only writes normalize). Defaults to also marking `name` the
 * active profile, matching the pre-profiles behavior where logging in always
 * became "the" credential in use — pass `{ activate: false }` for a
 * same-profile token refresh that shouldn't change which profile is active.
 */
export function writeProfile(name: string, patch: StoredConfig, opts: { activate?: boolean } = {}): void {
  const existing = readUserConfigFile();
  const profiles = extractProfiles(existing);
  profiles[name] = { ...profiles[name], ...patch };

  const activeProfile =
    opts.activate === false
      ? (existing?.activeProfile ?? (Object.keys(profiles).length === 1 ? name : undefined))
      : name;

  persistProfilesFile({ profiles, ...(activeProfile ? { activeProfile } : {}) });
}

/** Set which stored profile is active without touching any credential data. Does not validate `name` exists — callers (e.g. `authSwitch`) validate first so they can give a clear "unknown profile" error. */
export function setActiveProfile(name: string): void {
  const profiles = extractProfiles(readUserConfigFile());
  persistProfilesFile({ profiles, activeProfile: name });
}

/** Remove one named profile's stored credentials (used by `auth logout`). Does not revoke the key server-side — that's a distinct, explicit action. Clears `activeProfile` too if it was the one removed. */
export function clearProfile(name: string): void {
  const existing = readUserConfigFile();
  const profiles = extractProfiles(existing);
  delete profiles[name];
  const activeProfile = existing?.activeProfile === name ? undefined : existing?.activeProfile;
  persistProfilesFile({ profiles, ...(activeProfile ? { activeProfile } : {}) });
}

/** Every stored profile plus which one is marked active on disk (no flag/env override — that's `resolveActiveProfile`, used by `loadConfig`). Powers `simpler profiles list`. */
export function listProfiles(): { profiles: Record<string, StoredConfig>; activeProfile: string | null } {
  const file = readUserConfigFile();
  const profiles = extractProfiles(file);
  const names = Object.keys(profiles);
  const activeProfile = file?.activeProfile ?? (names.length === 1 ? names[0] : null);
  return { profiles, activeProfile };
}

/** Load `./.env` (if present) without ever overriding an already-set env var. */
export function loadDotEnv(cwd: string = process.cwd()): void {
  const path = resolvePath(cwd, '.env');
  if (!existsSync(path)) return;
  try {
    // Node 22's process.loadEnvFile mirrors `node --env-file`: it does NOT
    // override variables already present in process.env (verified locally
    // against v22.14.0). If that behavior ever regresses, fall back to
    // parsing the file ourselves so real env always wins.
    process.loadEnvFile(path);
  } catch {
    // Missing/unparsable .env is not fatal — real env/flags still work.
  }
}

export type ProfileSource = 'flag' | 'env' | 'stored' | 'implicit' | 'none';

export interface ProfileResolution {
  name: string | null;
  source: ProfileSource;
  /** Every profile in the file, keyed by name (empty object if none stored). */
  profiles: Record<string, StoredConfig>;
  /** The resolved profile's credentials, or null when `name` is null or unknown. */
  config: StoredConfig | null;
  /** Set when an EXPLICITLY named profile (flag/env/stored marker) isn't in `profiles` — the caller should hard-fail rather than silently fall through. */
  notFound?: string;
  /** Set when 2+ profiles exist and none is marked active/explicit — ambiguous, the caller should hard-fail rather than guess. */
  ambiguous?: boolean;
}

/**
 * Pure: decide which credential profile is active, given the raw on-disk
 * file plus any --profile flag / SIMPLER_PROFILE env override. Precedence
 * (highest wins): flag > env > the file's stored `activeProfile` > the sole
 * profile when exactly one is stored (covers legacy flat files, which
 * `extractProfiles` already normalizes to one profile named `default`).
 *
 * Deliberately does NOT silently pick a profile when it can't be sure which
 * one is meant (an unknown explicit name, or 2+ profiles with no active
 * marker) — see `notFound`/`ambiguous`. `loadConfig` turns those into a hard
 * CliError rather than quietly resolving to "no credentials" or the wrong
 * tenant, which is the exact failure mode JUL9-001 was filed over.
 */
export function resolveActiveProfile(
  file: StoredConfigFile | null,
  opts: { flagProfile?: string; envProfile?: string } = {},
): ProfileResolution {
  const profiles = extractProfiles(file);
  const known = Object.keys(profiles);

  let name: string | null = null;
  let source: ProfileSource = 'none';

  if (opts.flagProfile) {
    name = opts.flagProfile;
    source = 'flag';
  } else if (opts.envProfile) {
    name = opts.envProfile;
    source = 'env';
  } else if (file?.activeProfile) {
    name = file.activeProfile;
    source = 'stored';
  } else if (known.length === 1) {
    name = known[0];
    source = 'implicit';
  }

  if (name === null) {
    if (known.length > 1) {
      return { name: null, source: 'none', profiles, config: null, ambiguous: true };
    }
    return { name: null, source: 'none', profiles, config: null };
  }

  const config = profiles[name];
  if (!config) {
    return { name, source, profiles, config: null, notFound: name };
  }
  return { name, source, profiles, config };
}

/**
 * Pure config resolution: given flags, env, and already-loaded project/user
 * config objects, compute the effective { apiUrl, apiKey, timeout } plus
 * which layer won for each. No filesystem or process.env access here.
 */
export function resolveConfigFromSources(sources: ConfigSources): ResolvedConfig {
  const { flags, env, projectConfig, userConfig } = sources;

  let apiUrl: string | null = null;
  let apiUrlSource: ConfigSource = 'none';
  let apiKey: string | null = null;
  let apiKeySource: ConfigSource = 'none';

  const candidates: Array<{ source: ConfigSource; url?: string; key?: string }> = [
    { source: 'flag', url: flags.apiUrl, key: flags.apiKey },
    { source: 'env:SIMPLER', url: env.SIMPLER_API_URL, key: env.SIMPLER_API_KEY },
    { source: 'env:SD_MCP', url: env.SD_MCP_URL, key: env.SD_MCP_API_KEY },
    { source: 'project-file', url: projectConfig?.apiUrl, key: projectConfig?.apiKey },
    { source: 'user-file', url: userConfig?.apiUrl, key: userConfig?.apiKey },
  ];

  for (const candidate of candidates) {
    if (apiUrl === null && candidate.url) {
      apiUrl = normalizeUrl(candidate.url);
      apiUrlSource = candidate.source;
    }
    if (apiKey === null && candidate.key) {
      apiKey = candidate.key;
      apiKeySource = candidate.source;
    }
  }

  // OAuth browser-login tokens (user file only) are the lowest-precedence
  // credential: any explicit key from flag/env/files wins over them.
  let oauth: ResolvedConfig['oauth'];
  if (apiKey === null && userConfig?.accessToken && userConfig?.refreshToken) {
    apiKey = userConfig.accessToken;
    apiKeySource = 'user-file';
    oauth = { refreshToken: userConfig.refreshToken, expiresAt: userConfig.expiresAt ?? null };
  }

  const timeout = flags.timeout ?? DEFAULT_TIMEOUT_MS;

  // Overall "source" reported for humans: prefer the apiUrl source since
  // that's what usually determines "where is this pointed at"; fall back to
  // the key source if the URL was never resolved.
  const source = apiUrlSource !== 'none' ? apiUrlSource : apiKeySource;

  return { apiUrl, apiKey, source, apiUrlSource, apiKeySource, timeout, oauth };
}

/**
 * Impure entrypoint: gathers real env/files/flags, resolves which profile is
 * active, and resolves the effective config from it. Throws a CliError
 * (usage_error, exit 2) rather than silently falling back to "no
 * credentials" when the active profile is explicitly named (flag/env/stored)
 * but unknown, or when 2+ profiles exist with none marked active — both are
 * "we genuinely don't know which tenant you mean" states, and guessing here
 * is exactly the bug JUL9-001 was filed over.
 */
export function loadConfig(flags: ConfigFlags, cwd: string = process.cwd()): ResolvedConfig {
  loadDotEnv(cwd);

  const file = readUserConfigFile();
  const profileResolution = resolveActiveProfile(file, {
    flagProfile: flags.profile,
    envProfile: process.env.SIMPLER_PROFILE,
  });

  if (profileResolution.notFound) {
    const known = Object.keys(profileResolution.profiles);
    throw new CliError(
      `No profile named "${profileResolution.notFound}"${
        known.length ? ` — known profiles: ${known.join(', ')}` : ' — no profiles are stored yet'
      }. Run \`simpler profiles list\` or \`simpler auth login --profile ${profileResolution.notFound}\`.`,
      2,
      'usage_error',
    );
  }
  if (profileResolution.ambiguous) {
    const known = Object.keys(profileResolution.profiles);
    throw new CliError(
      `Multiple profiles are stored (${known.join(', ')}) but none is marked active. Run \`simpler auth switch <profile>\` or pass --profile.`,
      2,
      'usage_error',
    );
  }

  const resolved = resolveConfigFromSources({
    flags,
    env: process.env,
    projectConfig: readProjectConfig(cwd),
    userConfig: profileResolution.config,
  });

  return {
    ...resolved,
    activeProfile: profileResolution.name,
    activeProfileSource: profileResolution.source,
    knownProfiles: Object.keys(profileResolution.profiles),
  };
}
