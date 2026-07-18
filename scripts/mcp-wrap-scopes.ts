/**
 * One-shot transform: wrap every `server.registerTool(...)` call in server.ts
 * with the `scopedTool(scope, ...)` helper, deriving the scope from the first
 * `requireScope(ctx, '...')` call in the same handler body.
 *
 * Safe to re-run — existing `scopedTool(...)` calls are skipped.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * Each entry describes a file to transform and the gate-variable → scope map
 * that lets us recover the scope string when it isn't spelled inline.
 */
const TARGETS: Array<{ file: string; gateMap?: Record<string, string> }> = [
  { file: 'lib/mcp/server.ts' },
  { file: 'lib/storefront/mcp-sdk-adapter.ts' },
  {
    file: 'lib/branding/mcp-sdk-adapter.ts',
    gateMap: { gate: 'branding:read', writeGate: 'branding:write' },
  },
];

// CLI: tsx mcp-wrap-scopes.ts <relative/path/to/file.ts>
// If no arg, transforms every file in TARGETS.
const argFile = process.argv[2];
const filesToProcess = argFile
  ? TARGETS.filter((t) => t.file === argFile || argFile.endsWith(t.file))
  : TARGETS;
if (filesToProcess.length === 0) {
  console.error(`Unknown file: ${argFile}. Add it to TARGETS or check spelling.`);
  process.exit(1);
}

// Find every top-level `server.registerTool(` occurrence. For each, scan
// forward for the balanced closing `)`; within that block, locate the first
// scope hint and rewrite the opener to short-circuit on missing scope.
function findMatching(src: string, openIdx: number): number {
  // openIdx points at '('; return index of matching ')' OR -1 on error.
  let depth = 0;
  let inStr: '"' | "'" | '`' | null = null;
  let inLine = false;
  let inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLine) { if (ch === '\n') inLine = false; continue; }
    if (inBlock) { if (ch === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '/' && next === '/') { inLine = true; continue; }
    if (ch === '/' && next === '*') { inBlock = true; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function transform(filePath: string, gateMap: Record<string, string>) {
const src = fs.readFileSync(filePath, 'utf-8');
const needle = 'server.registerTool(';
let out = '';
let cursor = 0;
let wrapped = 0;
let skipped = 0;

while (cursor < src.length) {
  const idx = src.indexOf(needle, cursor);
  if (idx === -1) {
    out += src.slice(cursor);
    break;
  }
  out += src.slice(cursor, idx);

  const openParen = idx + needle.length - 1;
  const close = findMatching(src, openParen);
  if (close === -1) {
    console.error(`Unbalanced parens at offset ${idx}`);
    process.exit(1);
  }
  const block = src.slice(idx, close + 1);

  // Extract the scope from the handler body in this order of preference:
  //   (1) requireScope(ctx, 'X')           — server.ts idiom
  //   (2) hasScope(ctx.scopes, 'X')        — storefront inline idiom
  //   (3) gate-variable invocation, resolved via the target's gateMap
  //       (approvals.ts / branding adapter — `const blocked = writeGate();`)
  let scope: string | null = null;
  const m1 = block.match(/requireScope\(ctx,\s*'([^']+)'\)/);
  if (m1) scope = m1[1];
  if (!scope) {
    const m2 = block.match(/hasScope\(ctx\.scopes,\s*'([^']+)'\)/);
    if (m2) scope = m2[1];
  }
  if (!scope) {
    for (const [varName, mapped] of Object.entries(gateMap)) {
      const re = new RegExp(`\\b${varName}\\(\\)`);
      if (re.test(block)) { scope = mapped; break; }
    }
  }
  if (!scope) {
    // Tools without a scope check (rare) — leave alone.
    out += block;
    skipped++;
    cursor = close + 1;
    continue;
  }

  // Skip if this registerTool call is already guarded (rerun-safety).
  const back = out.slice(Math.max(0, out.length - 120));
  if (/hasScope\(ctx\.scopes, '[^']+'\)\s*&&\s*$/.test(back)) {
    out += block;
    skipped++;
    cursor = close + 1;
    continue;
  }

  // Inline-guard: prepend `hasScope(ctx.scopes, 'SCOPE') && ` to the call.
  // This preserves registerTool's generic type inference for the handler args
  // (which a wrapper function would lose).
  const newOpener = `hasScope(ctx.scopes, '${scope}') && server.registerTool(`;
  const rewritten = newOpener + block.slice(needle.length);
  out += rewritten;
  wrapped++;
  cursor = close + 1;
}

fs.writeFileSync(filePath, out);
console.log(`[${path.relative(process.cwd(), filePath)}] wrapped ${wrapped}, skipped ${skipped}`);
}

for (const target of filesToProcess) {
  const filePath = path.resolve(__dirname, '..', target.file);
  transform(filePath, target.gateMap ?? {});
}
