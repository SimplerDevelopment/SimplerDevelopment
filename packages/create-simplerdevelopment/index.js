#!/usr/bin/env node
/**
 * Thin shim so `npm create simplerdevelopment@latest <dir>` /
 * `bunx create-simplerdevelopment <dir>` work — npm requires the literal
 * `create-*` package name. All logic lives in `@simplerdevelopment/cli`'s
 * `create` command; this just resolves that bin and forwards argv.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let cliBin;
try {
  cliBin = require.resolve('@simplerdevelopment/cli/dist/index.js');
} catch {
  console.error(
    'create-simplerdevelopment: could not resolve @simplerdevelopment/cli.\n' +
      'Try: npm create simplerdevelopment@latest <dir>  (installs it automatically).',
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliBin, 'create', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
