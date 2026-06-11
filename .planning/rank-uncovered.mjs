#!/usr/bin/env node
// Rank files by uncovered statements for the coverage-climb dispatch.
// Usage: node .planning/rank-uncovered.mjs [topN]
import fs from 'node:fs';

const SUMMARY = 'coverage/vitest/coverage-summary.json';
const topN = Number(process.argv[2] || 80);

const data = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
const total = data.total;
const rows = [];
for (const [file, m] of Object.entries(data)) {
  if (file === 'total') continue;
  const s = m.statements || {};
  const uncovered = (s.total || 0) - (s.covered || 0);
  rows.push({ file: file.replace(process.cwd() + '/', ''), uncovered, pct: s.pct ?? 0, total: s.total || 0 });
}
rows.sort((a, b) => b.uncovered - a.uncovered);

console.log('=== PROJECT TOTAL ===');
console.log(`statements: ${total.statements.pct}% (${total.statements.covered}/${total.statements.total})`);
console.log(`branches:   ${total.branches.pct}% (${total.branches.covered}/${total.branches.total})`);
console.log(`functions:  ${total.functions.pct}%`);
console.log(`lines:      ${total.lines.pct}%`);
const stmtTotal = total.statements.total;
const stmtCov = total.statements.covered;
const need75 = Math.ceil(stmtTotal * 0.75) - stmtCov;
console.log(`\nStatements still needed to reach 75%: ${need75}`);

console.log(`\n=== TOP ${topN} BY UNCOVERED STATEMENTS (pct<80, uncovered>=40) ===`);
const cand = rows.filter((r) => r.pct < 80 && r.uncovered >= 40).slice(0, topN);
for (const r of cand) {
  console.log(`${String(r.uncovered).padStart(5)}  ${String(r.pct).padStart(5)}%  ${r.total.toString().padStart(5)}  ${r.file}`);
}
console.log(`\nCandidates listed: ${cand.length}. Sum uncovered (top ${topN}): ${cand.reduce((a, r) => a + r.uncovered, 0)}`);
