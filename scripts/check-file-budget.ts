#!/usr/bin/env bun
/**
 * File-size budget / god-file ratchet.
 *
 *   - Files pinned in `.file-budget.baseline.json` MUST NOT grow past their recorded size
 *     (god files may shrink — never grow).
 *   - New files (not in the baseline) MUST stay under NEW_FILE_CAP lines.
 *
 * Sizes are measured in CODE lines — comments and blanks are free, so a god file
 * can always be explained, just never extended. See `loc()` below.
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

/**
 * Tracked files only — `git ls-files`, never `find`.
 *
 * The ratchet governs what is IN the repo. A working tree routinely carries
 * stray untracked `.ts` files: leftovers from a branch switch, another agent's
 * worktree spilling in, a half-finished spike. Scanning the filesystem made
 * those count, so files nobody had touched could fail an unrelated commit —
 * and the error told you to split a file that git has never heard of.
 *
 * On 2026-08-06 a stale checkout dropped ~1,200 files from a June branch into
 * this tree. Eleven of them were untracked god files. They blocked a one-file
 * commit with an error naming only those eleven, which reads exactly like "you
 * made these huge" and not at all like "your tree has junk in it".
 */
function listFiles(): string[] {
  const out = execSync(`git ls-files -- ${ROOTS.join(' ')}`, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return out.split('\n').filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}
/**
 * Count CODE lines. Blank lines and comment-only lines are free.
 *
 * This ratchet exists to stop god files accreting more *logic*. Since
 * 2026-08-05 the code is also the source of truth for how the system works
 * (see `vault/04 - Decisions/ADR code-is-the-source-of-truth.md`), so a god
 * file has to stay free to grow *explanation* while still being blocked from
 * growing *behaviour*.
 *
 * Counting raw lines made those two rules fight, and the comment lost: adding
 * a 10-line comment to ProductDesigner.tsx (1836 lines, pinned) failed the
 * commit and the only offered remedies were "split the file" or "re-baseline".
 * Neither is the right answer to writing a comment.
 *
 * A line counts as a comment only when the *line itself* starts with `//`,
 * `/*` or `*` after trimming — so a URL inside a string literal is still code.
 */
const loc = (f: string): number => {
  try {
    let inBlock = false;
    let n = 0;
    for (const raw of readFileSync(f, 'utf8').split('\n')) {
      const line = raw.trim();
      if (inBlock) {
        if (line.includes('*/')) inBlock = false;
        continue;
      }
      if (!line || line.startsWith('//') || line.startsWith('*')) continue;
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) inBlock = true;
        continue;
      }
      n++;
    }
    return n;
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
