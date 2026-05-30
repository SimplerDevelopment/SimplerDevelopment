#!/usr/bin/env bun
/**
 * Doc-drift check.
 *
 * Your nested-CLAUDE.md navigation system is load-bearing: agents route off it every session.
 * If a doc references a file that has moved or been deleted, every future agent follows a dead
 * pointer. This verifies that file-like paths referenced in the agent docs still resolve.
 *
 * Heuristics (deliberately conservative to avoid false positives):
 *   - only inspects inline-code spans `like/this.ts`
 *   - only under known source roots (app, lib, components, scripts, tests, drizzle, workers, packages, .github, .claude)
 *   - only file-like refs (must have an extension); skips globs and dynamic [segments]
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Navigation / pointer docs only. NOT planning docs like TESTING_PLAN.md, which
// intentionally reference files that are targets-to-write and may not exist yet.
const FIXED_DOCS = ['CLAUDE.md', '.claude/index.md', 'tests/CI-GATES.md'];

function nestedClaudeMds(): string[] {
  const out = execSync(
    `find app lib components tests .claude -name CLAUDE.md -not -path '*/node_modules/*' 2>/dev/null`,
    { encoding: 'utf8' },
  );
  return out.split('\n').filter(Boolean);
}

const SOURCE_ROOT = /^(app|lib|components|scripts|tests|drizzle|workers|packages|\.github|\.claude)\//;
const CODE_SPAN = /`([^`\n]+?)`/g;

const docs = [...new Set([...FIXED_DOCS, ...nestedClaudeMds()])].filter(existsSync);
const missing: { doc: string; ref: string }[] = [];
const seen = new Set<string>();

for (const doc of docs) {
  const text = readFileSync(doc, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = CODE_SPAN.exec(text))) {
    let ref = m[1].trim();
    ref = ref.replace(/[:#].*$/, '').replace(/\s.*$/, ''); // drop :line, #anchor, trailing words
    if (!SOURCE_ROOT.test(ref)) continue;
    if (ref.includes('*') || ref.includes('[')) continue; // globs / dynamic route segments
    if (!/\.\w+$/.test(ref)) continue; // file-like only
    const key = `${doc}::${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!existsSync(ref)) missing.push({ doc, ref });
  }
}

if (missing.length) {
  console.error(`Doc drift — ${missing.length} referenced path(s) no longer exist:`);
  for (const { doc, ref } of missing) console.error(`  ${doc}  →  ${ref}`);
  console.error(`\nFix the reference (or the file), then re-run.`);
  process.exit(1);
}
console.log(`Doc drift OK — ${docs.length} docs scanned, all file references resolve.`);
