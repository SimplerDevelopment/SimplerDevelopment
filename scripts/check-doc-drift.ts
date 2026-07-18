#!/usr/bin/env bun
/**
 * Doc-drift check.
 *
 * Your nested-CLAUDE.md navigation system is load-bearing: agents route off it every session.
 * If a doc references a file that has moved or been deleted, every future agent follows a dead
 * pointer. This verifies three things about the agent-facing docs:
 *
 *   1. Existence  — file-like paths in inline-code spans still resolve.
 *   2. Moved paths — known-relocated paths (e.g. the old monolithic `lib/db/schema.ts`) are not
 *      referenced anywhere in the nav docs OR the skills. These resolve to "missing" but the more
 *      useful signal is the suggested replacement, and skills aren't covered by the existence pass.
 *   3. Line counts — god-file annotations like `path.tsx` (1504) stay within tolerance of the real
 *      file length, so the "this file is huge, spawn a subagent" hints don't silently rot.
 *
 * Heuristics (deliberately conservative to avoid false positives):
 *   - only inspects inline-code spans `like/this.ts`
 *   - only under known source roots (app, lib, components, scripts, tests, drizzle, workers, packages, .github, .claude)
 *   - only file-like refs (must have an extension); skips globs and dynamic [segments] for existence
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Navigation / pointer docs only. NOT planning docs like TESTING_PLAN.md, which
// intentionally reference files that are targets-to-write and may not exist yet.
const FIXED_DOCS = [
  'CLAUDE.md',
  '.claude/index.md',
  'tests/CI-GATES.md',
  'README.md',
  'docs/FAQ.md',
  'docs/GLOSSARY.md',
  'public/llms.txt',
];

// Paths that have been relocated. Referencing the `from` literal anywhere in the nav docs or
// skills is a bug — agents follow it into a file that no longer exists. Add an entry whenever you
// split/move a load-bearing file so the docs can't quietly reintroduce the dead pointer.
const MOVED_PATHS: { from: string; hint: string }[] = [
  {
    from: 'lib/db/schema.ts',
    hint: 'schema is split into per-domain modules under lib/db/schema/ (barrel: lib/db/schema/index.ts). Import path `@/lib/db/schema` stays valid.',
  },
  // Backtick-anchored `from` strings below: the matcher is `text.includes(from)`, so using a
  // leading backtick prevents `docs/guides/DATABASE.md` from matching `` `DATABASE.md` `` checks.
  // The backtick anchors the match to a code-span start, avoiding false negatives on new paths.
  {
    from: '`DATABASE.md',
    hint: 'moved to docs/guides/DATABASE.md',
  },
  {
    from: '`BLOCK_EDITOR_GUIDE.md',
    hint: 'moved to docs/guides/BLOCK_EDITOR_GUIDE.md',
  },
  {
    from: '`USER_MANAGEMENT.md',
    hint: 'moved to docs/guides/USER_MANAGEMENT.md',
  },
  {
    from: '`BRAIN.md',
    hint: 'moved to docs/guides/BRAIN.md',
  },
  {
    from: '`AB_TESTING_GUIDE.md',
    hint: 'moved to docs/guides/AB_TESTING_GUIDE.md',
  },
  {
    from: '`HOME_PAGE_FEATURES.md',
    hint: 'moved to docs/guides/HOME_PAGE_FEATURES.md',
  },
];

function findFiles(cmd: string): string[] {
  return execSync(cmd, { encoding: 'utf8' }).split('\n').filter(Boolean);
}

const nestedClaudeMds = () =>
  findFiles(
    `find app lib components tests .claude -name CLAUDE.md -not -path '*/node_modules/*' -not -path '.claude/worktrees/*' 2>/dev/null`
  );

// Agent-facing reference docs (project map, architecture, glossary, tool reference, etc.) —
// these are exactly the "read, cited, and acted on by autonomous coding agents" docs per
// /llms.txt, so a dead path here is as load-bearing as one in a nested CLAUDE.md.
const agentDocs = () => findFiles(`find docs/agents -name '*.md' 2>/dev/null`);

// Vault knowledge notes — Architecture notes and Domain Maps cite live repo paths that agents
// route off; scan them so the vault can't rot into dead pointers. Section indexes ("00 - *")
// and other vault sections (specs, ADRs, logs) are exempt: they reference history, not live nav.
//
// `vault/` is the maintainers' internal Obsidian knowledge base and is NOT part of this public
// release — it does not exist in this checkout. `find` below fails silently (stderr redirected)
// and `findFiles` returns an empty array in that case, so this is a harmless no-op here; it only
// does real work in a checkout that has the vault alongside it. Left as-is (not stubbed out) so
// the script still behaves correctly for anyone running it against such a checkout — set
// `VAULT_DIR` to override the vault's location if it lives somewhere other than `vault/`.
const VAULT_DIR = process.env.VAULT_DIR || 'vault';
const vaultNotes = () =>
  findFiles(
    `find '${VAULT_DIR}/02 - Architecture' '${VAULT_DIR}/03 - Domains' -name '*.md' -not -name '00 - *' 2>/dev/null`
  );

// Skills + skill docs — scanned for moved-path references only (they legitimately mention
// files-to-create, so the existence pass would false-positive on them).
const skillDocs = () =>
  findFiles(`find .claude/skills docs/skills -name '*.md' -not -path '*/node_modules/*' 2>/dev/null`);

const SOURCE_ROOT = /^(app|lib|components|scripts|tests|drizzle|workers|packages|\.github|\.claude|docs)\//;
const CODE_SPAN = /`([^`\n]+?)`/g;
// `path.ext` (1234) — a code-span source path immediately followed by a parenthesised line count.
const LINE_COUNT = /`([^`\n]+?\.\w+)`\s*\((\d{3,5})\)/g;

function lineCount(path: string): number {
  // Match `wc -l` semantics (count newlines) without shelling out per file.
  const text = readFileSync(path, 'utf8');
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

const docs = [...new Set([...FIXED_DOCS, ...nestedClaudeMds(), ...vaultNotes(), ...agentDocs()])].filter(
  existsSync
);

const missing: { doc: string; ref: string }[] = [];
const moved: { doc: string; from: string; hint: string }[] = [];
const drifted: { doc: string; ref: string; documented: number; actual: number }[] = [];
const seen = new Set<string>();

// 1. Existence — nav docs only.
for (const doc of docs) {
  const text = readFileSync(doc, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = CODE_SPAN.exec(text))) {
    let ref = m[1].trim();
    ref = ref.replace(/[:#].*$/, '').replace(/\s.*$/, ''); // drop :line, #anchor, trailing words
    if (!SOURCE_ROOT.test(ref)) continue;
    if (ref.includes('*') || ref.includes('[')) continue; // globs / dynamic route segments
    if (ref.includes('<') || ref.includes('|')) continue; // placeholders (`lib/x/<domain>.ts`) / alternation shorthand
    if (!/\.\w+$/.test(ref)) continue; // file-like only
    const key = `${doc}::${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!existsSync(ref)) missing.push({ doc, ref });
  }
}

// 2. Moved paths — nav docs + skills.
for (const doc of [...new Set([...docs, ...skillDocs()])].filter(existsSync)) {
  const text = readFileSync(doc, 'utf8');
  for (const { from, hint } of MOVED_PATHS) {
    if (text.includes(from)) moved.push({ doc, from, hint });
  }
}

// 3. Line-count annotations — nav docs only. Tolerance is generous (god files churn); this is here
// to catch egregious drift (the "1273" that is really 1504), not to chase every added line.
for (const doc of docs) {
  const text = readFileSync(doc, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = LINE_COUNT.exec(text))) {
    const ref = m[1].trim();
    const documented = Number(m[2]);
    if (!SOURCE_ROOT.test(ref) || !existsSync(ref)) continue;
    const actual = lineCount(ref);
    const tol = Math.max(75, actual * 0.1);
    if (Math.abs(documented - actual) > tol) drifted.push({ doc, ref, documented, actual });
  }
}

// 4. MCP tool-count tripwire — the platform's total tool count is a single fact that has
// drifted stale in docs before (446/450/452/473 have all shipped as copies of the real
// number). Scoped narrowly to a 3-digit number in the "total tool count" neighborhood
// (400-499) immediately followed by "tool(s)" — per-domain sub-counts (e.g. "156 tools"
// for brain_*, "39 tools" for kanban_*) are always well under 400 and never match, so this
// can't false-positive on those. The canonical count is `packages/cli/manifest.json`'s
// `tools` array length (also the exact number the MCP registry baseline test enforces). A
// trailing "+" (the approved "450+ tools" hedge phrase for prose that shouldn't need to
// track exact drift) is allowed as long as it does not overstate the real count.
//
// Scoped to FIXED_DOCS + agent docs only — NOT vault notes. The vault is single-writer
// (see CLAUDE.md) and out of bounds for this script's authors to hand-fix; keep the
// tripwire to the docs this repo's doc-drift owner actually maintains.
const TOOL_COUNT_MENTION = /\b(4\d{2})(\+)?[\s-]*(?:MCP\s+)?tools?\b/gi;
const wrongToolCounts: { doc: string; found: string }[] = [];
let manifestToolCount: number | null = null;
try {
  const manifest = JSON.parse(readFileSync('packages/cli/manifest.json', 'utf8')) as { tools: unknown[] };
  manifestToolCount = manifest.tools.length;
} catch {
  // manifest missing/unparseable — skip the tripwire rather than false-failing CI on it
}
const toolCountDocs = [...new Set([...FIXED_DOCS, ...agentDocs()])].filter(existsSync);
if (manifestToolCount !== null) {
  for (const doc of toolCountDocs) {
    const text = readFileSync(doc, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = TOOL_COUNT_MENTION.exec(text))) {
      const n = Number(m[1]);
      const hedged = m[2] === '+';
      if (n === manifestToolCount) continue; // exact canonical count
      if (hedged && n <= manifestToolCount) continue; // "450+" is a valid hedge at/below the real count
      wrongToolCounts.push({ doc, found: m[0] });
    }
  }
}

let failed = false;

if (missing.length) {
  failed = true;
  console.error(`Doc drift — ${missing.length} referenced path(s) no longer exist:`);
  for (const { doc, ref } of missing) console.error(`  ${doc}  →  ${ref}`);
}
if (moved.length) {
  failed = true;
  console.error(`\nDoc drift — ${moved.length} reference(s) to relocated path(s):`);
  for (const { doc, from, hint } of moved) console.error(`  ${doc}  →  ${from}\n      ${hint}`);
}
if (drifted.length) {
  failed = true;
  console.error(`\nDoc drift — ${drifted.length} stale line-count annotation(s):`);
  for (const { doc, ref, documented, actual } of drifted)
    console.error(`  ${doc}  →  \`${ref}\` documented ${documented}, actually ${actual}`);
}
if (wrongToolCounts.length) {
  failed = true;
  console.error(
    `\nDoc drift — ${wrongToolCounts.length} stale MCP tool-count mention(s) (canonical: ${manifestToolCount} tools, packages/cli/manifest.json):`
  );
  for (const { doc, found } of wrongToolCounts) console.error(`  ${doc}  →  "${found}"`);
}

if (failed) {
  console.error(`\nFix the reference (or the file), then re-run.`);
  process.exit(1);
}
console.log(`Doc drift OK — ${docs.length} docs scanned; references resolve, no relocated paths, line counts in tolerance, tool-count mentions match manifest.json (${manifestToolCount ?? 'n/a'} tools).`);
