/**
 * `simpler call <tool_name> [--args json|--file f] [--flag ...]` — raw escape
 * hatch for any MCP tool by its literal name. Resolves the manifest entry so
 * it goes through the exact same coercion + destructive-gating + dispatch
 * path as a generated `<domain> <action>` command (see `runDispatch` in
 * `src/index.ts`).
 */

import { CliError } from '../client.js';
import type { Manifest, ManifestToolSpec } from '../manifest.js';
import { findByName } from '../manifest.js';

export function resolveCallTarget(manifest: Manifest, toolName: string | undefined): ManifestToolSpec {
  if (!toolName) {
    throw new CliError('`simpler call` requires a tool name, e.g. `simpler call posts_list`.', 2, 'usage_error');
  }
  const tool = findByName(manifest, toolName);
  if (!tool) {
    throw new CliError(
      `Unknown tool "${toolName}". Run \`simpler manifest\` to browse available tools.`,
      2,
      'not_found',
    );
  }
  return tool;
}
