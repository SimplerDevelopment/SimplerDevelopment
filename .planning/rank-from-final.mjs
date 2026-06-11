#!/usr/bin/env node
// Rank files by uncovered statements directly from istanbul coverage-final.json.
// More robust than coverage-summary.json (which the blob-merge sometimes fails
// to emit). Usage: node .planning/rank-from-final.mjs [topN]
import fs from 'node:fs';

const FINAL = 'coverage/vitest/coverage-final.json';
const topN = Number(process.argv[2] || 80);
const data = JSON.parse(fs.readFileSync(FINAL, 'utf8'));

let totStmt = 0, totCov = 0;
const rows = [];
for (const [file, m] of Object.entries(data)) {
  const sMap = m.statementMap || {};
  const s = m.s || {};
  const total = Object.keys(sMap).length;
  if (total === 0) continue;
  let covered = 0;
  for (const k of Object.keys(sMap)) if ((s[k] || 0) > 0) covered++;
  totStmt += total;
  totCov += covered;
  const rel = file.replace(process.cwd() + '/', '');
  rows.push({ file: rel, total, covered, uncovered: total - covered, pct: +(100 * covered / total).toFixed(1) });
}
rows.sort((a, b) => b.uncovered - a.uncovered);

console.log('=== PROJECT TOTAL (from coverage-final.json) ===');
console.log(`statements: ${(100 * totCov / totStmt).toFixed(2)}% (${totCov}/${totStmt})`);
const need75 = Math.ceil(totStmt * 0.75) - totCov;
console.log(`Statements still needed to reach 75%: ${need75}`);

console.log(`\n=== TOP ${topN} BY UNCOVERED STATEMENTS (pct<60, uncovered>=60) ===`);
const cand = rows.filter(r => r.pct < 60 && r.uncovered >= 60).slice(0, topN);
for (const r of cand) {
  console.log(`${String(r.uncovered).padStart(5)}  ${String(r.pct).padStart(5)}%  ${String(r.total).padStart(5)}  ${r.file}`);
}
console.log(`\nCandidates: ${cand.length}. Sum uncovered (top ${topN}): ${cand.reduce((a, r) => a + r.uncovered, 0)}`);
