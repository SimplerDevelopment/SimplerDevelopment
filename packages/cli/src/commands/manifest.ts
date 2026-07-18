/**
 * `simpler manifest [domain] [action]` — tiered, token-lean discovery for
 * agents: no args -> domain counts; one arg -> a domain's commands; two args
 * -> one command's full arg schema.
 */

import { CliError } from '../client.js';
import type { Manifest } from '../manifest.js';
import { domainNames, findByCmd, summarizeDomain, summarizeManifest } from '../manifest.js';

export function runManifestCommand(
  manifest: Manifest,
  domain?: string,
  action?: string,
): unknown {
  if (!domain) {
    return summarizeManifest(manifest);
  }

  if (!domainNames(manifest).includes(domain)) {
    throw new CliError(
      `Unknown domain "${domain}". Run \`simpler manifest\` to list domains.`,
      2,
      'not_found',
    );
  }

  if (!action) {
    return { domain, commands: summarizeDomain(manifest, domain) };
  }

  const tool = findByCmd(manifest, [domain, action]);
  if (!tool) {
    throw new CliError(
      `Unknown command "${domain} ${action}". Run \`simpler manifest ${domain}\` to list its commands.`,
      2,
      'not_found',
    );
  }
  return tool;
}
