// Show vision-review scores from a JSON file. Usage: node show-scores.mjs <path>
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node show-scores.mjs <path>');
  process.exit(1);
}
const data = JSON.parse(readFileSync(path, 'utf8'));
for (const r of data) {
  if (r.parsed) {
    console.log(r.section.padEnd(12), r.parsed.score);
  } else if (r.skipped) {
    console.log(r.section.padEnd(12), '— skipped:', r.skipped);
  } else if (r.error) {
    console.log(r.section.padEnd(12), '— error');
  }
}
