#!/usr/bin/env node
// Print coverage for specific files (substring match) from coverage-final.json.
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('coverage/vitest/coverage-final.json', 'utf8'));
const needles = process.argv.slice(2);
let totStmt = 0, totCov = 0, fileCount = 0;
for (const [file, m] of Object.entries(data)) {
  const sMap = m.statementMap || {}; const s = m.s || {};
  const total = Object.keys(sMap).length; if (!total) continue;
  fileCount++;
  let cov = 0; for (const k of Object.keys(sMap)) if ((s[k]||0)>0) cov++;
  totStmt += total; totCov += cov;
  if (needles.some(n => file.includes(n))) {
    console.log(`${(100*cov/total).toFixed(1).padStart(5)}%  ${cov}/${total}  ${file.replace(process.cwd()+'/','')}`);
  }
}
console.log(`\nfiles in report: ${fileCount} | total ${(100*totCov/totStmt).toFixed(2)}% (${totCov}/${totStmt})`);
