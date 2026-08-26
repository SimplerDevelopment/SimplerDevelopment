/**
 * `simpler profiles list` and `simpler auth switch <profile>` (JUL9-001).
 *
 * The whole point of this file: switching tenants must show you, LIVE from
 * the server, which company you just switched to — never just echo back the
 * profile's local name. The incident this ticket is named for was a stored
 * key silently bound to a different tenant than its label implied; trusting
 * the label again here would just move the same bug one layer up.
 */

import type { ResolvedConfig, StoredConfig } from '../config.js';
import { listProfiles, setActiveProfile, redactKey, userConfigPath, DEFAULT_TIMEOUT_MS } from '../config.js';
import { mcpCall, CliError } from '../client.js';
import type { WhoamiClientRoster } from '../client.js';

export interface ProfileSummary {
  name: string;
  active: boolean;
  apiUrl: string | null;
  /** Redacted — never the raw key/token. */
  credential: string;
}

export interface ProfileListResult {
  configPath: string;
  active: string | null;
  profiles: ProfileSummary[];
}

/** `simpler profiles list` — what's stored, which is active. Credentials are shown redacted only; run `auth status` for the live server-resolved identity of the active one. */
export function profileList(): ProfileListResult {
  const { profiles, activeProfile } = listProfiles();
  const names = Object.keys(profiles).sort();
  return {
    configPath: userConfigPath(),
    active: activeProfile,
    profiles: names.map((name) => summarize(name, profiles[name], name === activeProfile)),
  };
}

function summarize(name: string, config: StoredConfig, active: boolean): ProfileSummary {
  return {
    name,
    active,
    apiUrl: config.apiUrl ?? null,
    credential: redactKey(config.apiKey ?? config.accessToken),
  };
}

export interface AuthSwitchResult {
  profile: string;
  apiUrl: string | null;
  /** Live-resolved from the server — this is the answer that matters, not the profile's name. Null when it couldn't be verified (see `verifyError`). */
  identity: { clientId: number; company: string } | null;
  reachable: WhoamiClientRoster[] | null;
  /** Set when the profile was activated but its identity couldn't be confirmed live (no stored credentials yet, or the server was unreachable) — the switch still happens; the caller MUST surface this loudly rather than implying the switch was verified. */
  verifyError?: string;
}

/**
 * Switch the active profile, then immediately ask the server (via `whoami`)
 * which tenant that profile's credential actually resolves to and return
 * that alongside the switch — callers print both so an operator can never
 * mistake "I named this profile W.H. Peters" for "the server agrees this key
 * is W.H. Peters." Hard-fails only when the named profile doesn't exist;
 * a failed live verification is reported, not swallowed, but doesn't block
 * the switch itself (you can still switch while offline — the doctor/status
 * commands re-verify once reachable).
 */
export async function authSwitch(
  name: string,
  opts: { verbose?: boolean; timeout?: number } = {},
): Promise<AuthSwitchResult> {
  const { profiles } = listProfiles();
  const target = profiles[name];
  if (!target) {
    const known = Object.keys(profiles);
    throw new CliError(
      `No profile named "${name}"${
        known.length ? ` — known profiles: ${known.join(', ')}` : ' — none stored yet. Run `simpler auth login --profile ' + name + '` first.'
      }`,
      2,
      'usage_error',
    );
  }

  setActiveProfile(name);

  const apiKey = target.apiKey ?? target.accessToken ?? null;
  if (!target.apiUrl || !apiKey) {
    return {
      profile: name,
      apiUrl: target.apiUrl ?? null,
      identity: null,
      reachable: null,
      verifyError: 'Profile has no stored credentials to verify against the server.',
    };
  }

  const probeConfig: ResolvedConfig = {
    apiUrl: target.apiUrl,
    apiKey,
    source: 'user-file',
    apiUrlSource: 'user-file',
    apiKeySource: 'user-file',
    timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
  };

  try {
    const { data } = await mcpCall(probeConfig, 'whoami', {}, { verbose: opts.verbose });
    const who = data as { client?: { id: number; company: string }; clients?: WhoamiClientRoster[] } | null;
    return {
      profile: name,
      apiUrl: target.apiUrl,
      identity: who?.client ? { clientId: who.client.id, company: who.client.company } : null,
      reachable: who?.clients ?? null,
    };
  } catch (err) {
    return {
      profile: name,
      apiUrl: target.apiUrl,
      identity: null,
      reachable: null,
      verifyError: err instanceof Error ? err.message : String(err),
    };
  }
}
