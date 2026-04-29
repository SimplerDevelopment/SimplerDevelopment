// Compute median scores per section across multiple vision-review JSON files.
// Usage: node median-scores.mjs <path1> <path2> [<pathN>...]
import { readFileSync } from 'node:fs';

const paths = process.argv.slice(2);
if (paths.length < 1) {
  console.error('usage: node median-scores.mjs <path1> <path2> ...');
  process.exit(1);
}

const sections = ['hero', 'services', 'portals', 'audits', 'solutions', 'stats', 'team', 'cta-footer'];
const byRun = paths.map((p) => {
  const arr = JSON.parse(readFileSync(p, 'utf8'));
  const m = {};
  for (const r of arr) {
    if (r.parsed) m[r.section] = r.parsed.score;
  }
  return m;
});

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return null;
  if (n % 2 === 1) return s[(n - 1) / 2];
  return Math.round((s[n / 2 - 1] + s[n / 2]) / 2);
}

console.log('Section'.padEnd(12), ...paths.map((_, i) => `r${i + 1}`.padStart(4)), 'med'.padStart(5));
for (const section of sections) {
  const scores = byRun.map((r) => r[section]).filter((x) => typeof x === 'number');
  const med = median(scores);
  console.log(
    section.padEnd(12),
    ...byRun.map((r) => String(r[section] ?? '—').padStart(4)),
    String(med ?? '—').padStart(5),
  );
}
