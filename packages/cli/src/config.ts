/**
 * Config resolution for the `simpler` CLI.
 *
 * Precedence (highest wins): flags > SIMPLER_API_URL/SIMPLER_API_KEY env >
 * SD_MCP_URL/SD_MCP_API_KEY env (existing repo convention) > ./.simpler.json
 * (project) > ~/.simpler/config.json (user, written by `auth login`).
 *
 * The pure resolution logic (`resolveConfigFromSources`) takes an explicit
 * bag of inputs so it's unit-testable without touching the filesystem or
 * real env vars. `loadConfig()` is the impure entrypoint that gathers those
 * inputs from the real world and is what `src/index.ts` calls.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

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

function readJsonConfig(path: string): StoredConfig | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as StoredConfig;
    return null;
  } catch {
    return null;
  }
}

export function readUserConfig(): StoredConfig | null {
  return readJsonConfig(userConfigPath());
}

export function readProjectConfig(cwd: string = process.cwd()): StoredConfig | null {
  return readJsonConfig(projectConfigPath(cwd));
}

/**
 * Persist `{ apiUrl, apiKey }` to `~/.simpler/config.json` with mode 0600
 * (owner read/write only) — used by `auth login`. Creates the parent
 * directory if needed.
 */
export function writeUserConfig(config: StoredConfig): void {
  const dir = userConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const path = userConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  // writeFileSync's mode option only applies when the file is created; make
  // sure a pre-existing file is tightened too.
  chmodSync(path, 0o600);
}

/**
 * Delete the locally stored key (used by `auth logout`). Does not revoke the
 * key server-side — that's a distinct, explicit action.
 */
export function clearUserConfig(): void {
  writeUserConfig({});
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

/** Impure entrypoint: gathers real env/files/flags and resolves config. */
export function loadConfig(flags: ConfigFlags, cwd: string = process.cwd()): ResolvedConfig {
  loadDotEnv(cwd);
  return resolveConfigFromSources({
    flags,
    env: process.env,
    projectConfig: readProjectConfig(cwd),
    userConfig: readUserConfig(),
  });
}
