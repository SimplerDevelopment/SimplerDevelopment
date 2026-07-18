/**
 * `simpler mcp parity` — shipped manifest names vs live `tools/list`.
 */

import type { ResolvedConfig } from '../config.js';
import { mcpListTools } from '../client.js';
import type { Manifest } from '../manifest.js';

export interface ParityReport {
  inParity: boolean;
  missing: string[]; // live tools not in the manifest
  extra: string[]; // manifest tools no longer live
  live: number;
  manifest: number;
}

/** Pure comparison — testable without a network call. */
export function computeParity(liveNames: string[], manifestNames: string[]): ParityReport {
  const liveSet = new Set(liveNames);
  const manifestSet = new Set(manifestNames);

  const missing = liveNames.filter((name) => !manifestSet.has(name)).sort();
  const extra = manifestNames.filter((name) => !liveSet.has(name)).sort();

  return {
    inParity: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    live: liveNames.length,
    manifest: manifestNames.length,
  };
}

export async function runParity(
  config: ResolvedConfig,
  manifest: Manifest,
  opts: { verbose?: boolean } = {},
): Promise<ParityReport> {
  const liveTools = await mcpListTools(config, { verbose: opts.verbose });
  return computeParity(
    liveTools.map((t) => t.name),
    manifest.tools.map((t) => t.name),
  );
}
