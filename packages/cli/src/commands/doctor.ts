/**
 * `simpler doctor` — cheap end-to-end health check: version, config source,
 * origin, key presence, /api/health reachability, whoami, manifest load.
 */

import type { ResolvedConfig } from '../config.js';
import { redactKey } from '../config.js';
import { mcpCall, restGet } from '../client.js';
import { loadManifest } from '../manifest.js';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  success: boolean;
  checks: DoctorCheck[];
}

export function readCliVersion(pkgJson: { version?: string } | null): string {
  return pkgJson?.version ?? '0.0.0';
}

export async function runDoctor(
  config: ResolvedConfig,
  opts: { verbose?: boolean; cliVersion: string },
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  checks.push({ name: 'cliVersion', ok: true, detail: opts.cliVersion });
  checks.push({ name: 'configSource', ok: config.apiUrl !== null, detail: config.source });
  checks.push({ name: 'origin', ok: config.apiUrl !== null, detail: config.apiUrl ?? '(not configured)' });
  checks.push({ name: 'keyPresent', ok: config.apiKey !== null, detail: redactKey(config.apiKey) });
  // Which tenant a command runs against is the single most important thing
  // to see up front (JUL9-001) — this only names the LOCAL profile; `whoami`
  // below is what actually confirms the tenant with the server.
  checks.push({
    name: 'profile',
    ok: true,
    detail: config.activeProfile
      ? `${config.activeProfile} (via ${config.activeProfileSource})`
      : (config.knownProfiles?.length ? `none active — stored: ${config.knownProfiles.join(', ')}` : 'none configured'),
  });

  if (!config.apiUrl) {
    checks.push({ name: 'health', ok: false, detail: 'skipped — no API URL configured' });
    checks.push({ name: 'whoami', ok: false, detail: 'skipped — no API URL configured' });
  } else {
    try {
      const res = await restGet(config, '/api/health', { verbose: opts.verbose });
      checks.push({ name: 'health', ok: res.status >= 200 && res.status < 300, detail: `HTTP ${res.status}` });
    } catch (err) {
      checks.push({ name: 'health', ok: false, detail: err instanceof Error ? err.message : String(err) });
    }

    if (!config.apiKey) {
      checks.push({ name: 'whoami', ok: false, detail: 'skipped — no API key configured' });
    } else {
      try {
        const { data } = await mcpCall(config, 'whoami', {}, { verbose: opts.verbose });
        const summary =
          data && typeof data === 'object'
            ? JSON.stringify(data).slice(0, 200)
            : String(data);
        checks.push({ name: 'whoami', ok: true, detail: summary });
      } catch (err) {
        checks.push({ name: 'whoami', ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  try {
    const manifest = loadManifest();
    checks.push({ name: 'manifest', ok: true, detail: `${manifest.toolCount} tools loaded` });
  } catch (err) {
    checks.push({ name: 'manifest', ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  return { success: checks.every((c) => c.ok), checks };
}
