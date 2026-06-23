#!/usr/bin/env node
// Reads one or more coverage-final.json files and emits a coverage-summary.json
// shape (per-file totals + grand total) in the istanbul json-summary format.
//
// Usage:
//   node scripts/parse-coverage.mjs <out.json> <coverage-final.json> [more...]
//
// Multiple inputs are merged: per-file maps from later files overwrite earlier
// for the same path. (We assume the underlying source did not change between
// the runs, which is the case for unit + integration here.)
import fs from 'node:fs';
import path from 'node:path';

const [, , outPath, ...inputs] = process.argv;
if (!outPath || inputs.length === 0) {
  console.error('Usage: parse-coverage.mjs <out.json> <coverage-final.json> [more...]');
  process.exit(1);
}

function pct(covered, total) {
  if (!total) return total === 0 ? 100 : 0;
  return +((covered / total) * 100).toFixed(2);
}

function emptyTotals() {
  return {
    lines:      { total: 0, covered: 0, skipped: 0, pct: 0 },
    statements: { total: 0, covered: 0, skipped: 0, pct: 0 },
    functions:  { total: 0, covered: 0, skipped: 0, pct: 0 },
    branches:   { total: 0, covered: 0, skipped: 0, pct: 0 },
  };
}

function fileSummary(file) {
  const summary = emptyTotals();
  // statements
  const sTotal = Object.keys(file.s || {}).length;
  const sCovered = Object.values(file.s || {}).filter(v => v > 0).length;
  summary.statements.total = sTotal;
  summary.statements.covered = sCovered;
  summary.statements.pct = pct(sCovered, sTotal);
  // functions
  const fTotal = Object.keys(file.f || {}).length;
  const fCovered = Object.values(file.f || {}).filter(v => v > 0).length;
  summary.functions.total = fTotal;
  summary.functions.covered = fCovered;
  summary.functions.pct = pct(fCovered, fTotal);
  // branches: f.b is { id: [hitsForBranch0, hitsForBranch1, ...] }
  let bTotal = 0, bCovered = 0;
  for (const arr of Object.values(file.b || {})) {
    if (!Array.isArray(arr)) continue;
    for (const v of arr) {
      bTotal++;
      if (v > 0) bCovered++;
    }
  }
  summary.branches.total = bTotal;
  summary.branches.covered = bCovered;
  summary.branches.pct = pct(bCovered, bTotal);
  // lines: derive from statementMap line numbers + s execution counts
  // count distinct lines that have any statement; covered = lines with any covered statement
  const lineHits = new Map();
  for (const [sid, info] of Object.entries(file.statementMap || {})) {
    const ln = info?.start?.line;
    if (typeof ln !== 'number') continue;
    const hit = (file.s?.[sid] ?? 0) > 0;
    const prev = lineHits.get(ln);
    lineHits.set(ln, prev || hit);
  }
  let lTotal = 0, lCovered = 0;
  for (const hit of lineHits.values()) {
    lTotal++;
    if (hit) lCovered++;
  }
  summary.lines.total = lTotal;
  summary.lines.covered = lCovered;
  summary.lines.pct = pct(lCovered, lTotal);
  return summary;
}

function mergeFile(a, b) {
  // Merge two per-file v8 coverage objects. Take max of each counter.
  // (Both runs share the same source, so statementMap/fnMap/branchMap match.)
  const out = JSON.parse(JSON.stringify(a));
  for (const key of ['s', 'f']) {
    for (const id of Object.keys(b[key] || {})) {
      out[key][id] = Math.max(out[key]?.[id] ?? 0, b[key][id] ?? 0);
    }
  }
  // branches
  for (const id of Object.keys(b.b || {})) {
    const aArr = out.b?.[id] || [];
    const bArr = b.b[id] || [];
    const merged = [];
    const len = Math.max(aArr.length, bArr.length);
    for (let i = 0; i < len; i++) {
      merged.push(Math.max(aArr[i] ?? 0, bArr[i] ?? 0));
    }
    out.b[id] = merged;
  }
  return out;
}

const merged = {};
for (const f of inputs) {
  if (!fs.existsSync(f)) {
    console.warn(`SKIP missing: ${f}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [p, v] of Object.entries(data)) {
    if (merged[p]) merged[p] = mergeFile(merged[p], v);
    else merged[p] = v;
  }
}

// Build summary
const summary = { total: emptyTotals() };
for (const [p, v] of Object.entries(merged)) {
  const s = fileSummary(v);
  summary[p] = s;
  // accumulate totals
  for (const key of ['lines', 'statements', 'functions', 'branches']) {
    summary.total[key].total   += s[key].total;
    summary.total[key].covered += s[key].covered;
  }
}
for (const key of ['lines', 'statements', 'functions', 'branches']) {
  summary.total[key].pct = pct(summary.total[key].covered, summary.total[key].total);
}

fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`wrote ${outPath} with ${Object.keys(summary).length - 1} files`);
console.log('Total:');
console.log(`  Lines:      ${summary.total.lines.covered}/${summary.total.lines.total} = ${summary.total.lines.pct}%`);
console.log(`  Statements: ${summary.total.statements.covered}/${summary.total.statements.total} = ${summary.total.statements.pct}%`);
console.log(`  Functions:  ${summary.total.functions.covered}/${summary.total.functions.total} = ${summary.total.functions.pct}%`);
console.log(`  Branches:   ${summary.total.branches.covered}/${summary.total.branches.total} = ${summary.total.branches.pct}%`);
