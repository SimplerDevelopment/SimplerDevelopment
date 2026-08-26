/**
 * `simpler auth login|status|logout` (+ profile-aware — see JUL9-001)
 *
 * login: email + password (never accepted as an argv flag) -> POST
 * /api/portal/auth/mobile-sign-in -> stores { apiUrl, apiKey } under a named
 * profile in ~/.simpler/config.json (0600; `default` when --profile is
 * omitted, matching pre-profiles behavior exactly).
 */

import type { ResolvedConfig } from '../config.js';
import { redactKey, writeProfile, clearProfile, listProfiles, userConfigPath, LEGACY_PROFILE_NAME } from '../config.js';
import { restPost, mcpCall, resolveCanonicalOrigin, CliError } from '../client.js';

export interface AuthLoginFlags {
  email?: string;
  passwordStdin?: boolean;
  /** Store under this named profile instead of `default` — see JUL9-001. */
  profile?: string;
}

/** Reads a single line of password from stdin (piped, e.g. `--password-stdin`). */
export async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8').split('\n')[0].trim();
}

/** Interactive hidden-input password prompt (no echo). */
export async function readPasswordInteractive(promptText = 'Password: '): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(promptText);

    let password = '';
    const wasRaw = stdin.isTTY ? stdin.isRaw : undefined;
    if (stdin.isTTY) stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    const onData = (char: string) => {
      const code = char.charCodeAt(0);
      if (char === '\n' || char === '\r' || code === 4) {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode?.(Boolean(wasRaw));
        stdin.pause();
        stdout.write('\n');
        resolvePromise(password);
        return;
      }
      if (code === 3) {
        // Ctrl+C
        if (stdin.isTTY) stdin.setRawMode?.(Boolean(wasRaw));
        reject(new CliError('Login cancelled', 2, 'usage_error'));
        return;
      }
      if (code === 127 || code === 8) {
        // backspace
        password = password.slice(0, -1);
        return;
      }
      password += char;
    };

    stdin.on('data', onData);
  });
}

export interface AuthLoginResult {
  apiUrl: string;
  /** Set when the given --api-url redirected to a different canonical origin. */
  redirectedFrom?: string;
  user: { email: string; name: string | null };
  client: { id: number; company: string };
  expiresAt: string;
  configPath: string;
  /** Which named profile the credential was stored under (and made active). */
  profile: string;
}

export async function authLogin(
  flags: AuthLoginFlags,
  config: Pick<ResolvedConfig, 'apiUrl' | 'timeout'>,
  opts: { verbose?: boolean; getPassword?: () => Promise<string> } = {},
): Promise<AuthLoginResult> {
  if (!flags.email) {
    throw new CliError('`simpler auth login` requires --email <address>.', 2, 'usage_error');
  }
  if (!config.apiUrl) {
    throw new CliError(
      'No API URL configured. Pass --api-url or set SIMPLER_API_URL before logging in.',
      2,
      'usage_error',
    );
  }

  const password = opts.getPassword
    ? await opts.getPassword()
    : flags.passwordStdin
      ? await readPasswordFromStdin()
      : await readPasswordInteractive();

  if (!password) {
    throw new CliError('Password is required.', 2, 'usage_error');
  }

  const canonicalUrl = await resolveCanonicalOrigin(config);
  const canonicalConfig = { ...config, apiUrl: canonicalUrl };

  const res = await restPost(
    canonicalConfig,
    '/api/portal/auth/mobile-sign-in',
    { email: flags.email, password },
    { verbose: opts.verbose },
  );

  const body = res.data as { success?: boolean; data?: any; message?: string; error?: string };
  if (res.status !== 200 || !body?.success || !body.data?.token) {
    throw new CliError(body?.message ?? `Login failed (HTTP ${res.status})`, 3, 'unauthorized', body);
  }

  const profile = flags.profile ?? LEGACY_PROFILE_NAME;
  writeProfile(profile, { apiUrl: canonicalUrl, apiKey: body.data.token }, { activate: true });

  return {
    apiUrl: canonicalUrl,
    redirectedFrom: canonicalUrl === config.apiUrl ? undefined : config.apiUrl,
    user: { email: body.data.user.email, name: body.data.user.name ?? null },
    client: { id: body.data.client.id, company: body.data.client.company },
    expiresAt: body.data.expiresAt,
    configPath: userConfigPath(),
    profile,
  };
}

export interface AuthStatusResult {
  configSource: string;
  apiUrl: string | null;
  apiKey: string;
  /** Active credential profile (JUL9-001) — null when none is configured/resolvable. */
  profile: string | null;
  /** `whoami`'s answer is the source of truth for "which tenant" — never the profile's local name. */
  whoami: unknown;
}

export async function authStatus(
  config: ResolvedConfig,
  opts: { verbose?: boolean } = {},
): Promise<AuthStatusResult> {
  const { data } = await mcpCall(config, 'whoami', {}, { verbose: opts.verbose });
  return {
    configSource: config.source,
    apiUrl: config.apiUrl,
    apiKey: redactKey(config.apiKey),
    profile: config.activeProfile ?? null,
    whoami: data,
  };
}

export interface AuthLogoutResult {
  message: string;
  configPath: string;
  /** The profile that was cleared, or null when there was nothing to clear. */
  profile: string | null;
}

/** Clears one profile's stored credentials — the active one by default, or `--profile <name>` to target another without disturbing the rest. Does NOT wipe every stored profile; that would defeat the point of having them. */
export function authLogout(opts: { profile?: string } = {}): AuthLogoutResult {
  const { profiles, activeProfile } = listProfiles();
  const target = opts.profile ?? activeProfile;

  if (!target || !profiles[target]) {
    return {
      message: target
        ? `No stored profile named "${target}" — nothing to clear.`
        : 'No profile is configured — nothing to clear.',
      configPath: userConfigPath(),
      profile: null,
    };
  }

  clearProfile(target);
  return {
    message:
      `Local credentials for profile "${target}" cleared from ~/.simpler/config.json. This does NOT revoke the ` +
      'key server-side — revoke it from the portal (Settings > API Keys) if it may have been compromised.',
    configPath: userConfigPath(),
    profile: target,
  };
}
