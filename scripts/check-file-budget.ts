#!/usr/bin/env bun
/**
 * File-size budget / god-file ratchet.
 *
 *   - Files pinned in `.file-budget.baseline.json` MUST NOT grow past their recorded size
 *     (god files may shrink — never grow).
 *   - New files (not in the baseline) MUST stay under NEW_FILE_CAP lines.
 *
 * This lets the existing 5k-line monsters stay (grandfathered) while guaranteeing they
 * only get smaller, and stops new god files from ever appearing.
 *
 * Rebuild the baseline after an intentional refactor:  bun scripts/check-file-budget.ts regen
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const NEW_FILE_CAP = 800; // new files must come in under this
const WATCH_THRESHOLD = 500; // files above this get pinned in the baseline
const BASELINE = '.file-budget.baseline.json';
const ROOTS = ['app', 'lib', 'components', 'scripts', 'workers'];

function listFiles(): string[] {
  const out = execSync(
    `find ${ROOTS.join(' ')} -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/node_modules/*' 2>/dev/null`,
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );
  return out.split('\n').filter(Boolean);
}
const loc = (f: string): number => {
  try {
    return readFileSync(f, 'utf8').split('\n').length;
  } catch {
    return 0;
  }
};

const sizes = new Map(listFiles().map((f) => [f, loc(f)] as const));

if (process.argv[2] === 'regen') {
  const baseline: Record<string, number> = {};
  for (const [f, n] of [...sizes].sort()) if (n >= WATCH_THRESHOLD) baseline[f] = n;
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Pinned ${Object.keys(baseline).length} files (>= ${WATCH_THRESHOLD} lines) in ${BASELINE}.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`Missing ${BASELINE}. Create it with: bun scripts/check-file-budget.ts regen`);
  process.exit(1);
}

const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE, 'utf8'));
const violations: string[] = [];
for (const [f, n] of sizes) {
  const cap = baseline[f];
  if (cap != null) {
    if (n > cap) violations.push(`${f}: ${n} lines (baseline ${cap} — god files may shrink, never grow)`);
  } else if (n > NEW_FILE_CAP) {
    violations.push(`${f}: ${n} lines (new files must stay under ${NEW_FILE_CAP})`);
  }
}

if (violations.length) {
  console.error(`File-size budget exceeded (${violations.length}):`);
  for (const v of violations) console.error('  ' + v);
  console.error(`\nSplit the file. If this growth was an intentional refactor, re-baseline:`);
  console.error(`  bun scripts/check-file-budget.ts regen`);
  process.exit(1);
}
console.log(
  `File-size budget OK — ${Object.keys(baseline).length} files pinned, new-file cap ${NEW_FILE_CAP}.`,
);
