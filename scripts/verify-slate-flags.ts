/**
 * Re-verify the `tech__slate` column in a tech-stack CSV.
 *
 * For every row where tech__slate == "true", refetch the site and look for
 * the literal string "technolutions" (case-insensitive) in the response body.
 *   - found     → keep the value as "true"
 *   - not found → downgrade the value to "maybe"
 *
 * The input CSV is rewritten in place (a .bak copy is written alongside).
 *
 * Usage:
 *   npx tsx scripts/verify-slate-flags.ts <csv-path> [--concurrency 10] [--timeout 12000]
 */
import * as fs from 'node:fs';

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const CSV_PATH = args.find((a) => !a.startsWith('--') && a.endsWith('.csv'));
if (!CSV_PATH) {
  console.error('Usage: tsx scripts/verify-slate-flags.ts <csv-path>');
  process.exit(1);
}
const CONCURRENCY = parseInt(argVal('--concurrency', '10')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '12000')!, 10);

// ── Tiny but correct CSV parser (RFC 4180-ish) ──────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}
function serializeCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

async function fetchWithTimeout(url: string, ms: number): Promise<{ status: number; body: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; PostCaptainTechScan/1.0; +https://postcaptain.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function run() {
  const text = fs.readFileSync(CSV_PATH!, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) {
    console.error('CSV has no data rows.');
    process.exit(1);
  }
  const header = rows[0];
  const data = rows.slice(1).filter((r) => r.length === header.length);
  const skipped = rows.length - 1 - data.length;
  if (skipped > 0) console.warn(`Skipping ${skipped} malformed row(s).`);

  const colIdx = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Missing column: ${name}`);
    return i;
  };
  const I_ID = colIdx('company_id');
  const I_NAME = colIdx('company_name');
  const I_SCANNED = colIdx('scanned_url');
  const I_FINAL = colIdx('final_url');
  const I_SLATE = colIdx('tech__slate');
  const I_DETECTED = colIdx('detected_techs');

  const targets: { rowIdx: number; url: string; companyId: string; name: string }[] = [];
  data.forEach((r, i) => {
    if (r[I_SLATE] === 'true') {
      const url = r[I_FINAL] || r[I_SCANNED];
      if (url) targets.push({ rowIdx: i, url, companyId: r[I_ID], name: r[I_NAME] });
    }
  });

  console.log(`${targets.length} rows have tech__slate=true. Re-fetching to confirm…`);

  let done = 0;
  let kept = 0;
  let demoted = 0;
  let errored = 0;

  await mapWithConcurrency(targets, CONCURRENCY, async (t) => {
    let confirmed: 'true' | 'maybe' = 'maybe';
    let note: string | null = null;
    try {
      const r = await fetchWithTimeout(t.url, TIMEOUT_MS);
      if (r.status >= 200 && r.status < 400) {
        if (/technolutions/i.test(r.body)) confirmed = 'true';
      } else {
        note = `http ${r.status}`;
      }
    } catch (err) {
      errored++;
      note = err instanceof Error ? err.message : String(err);
    }
    const row = data[t.rowIdx];
    row[I_SLATE] = confirmed;
    // Keep detected_techs in sync — drop "slate" if it's now "maybe"
    if (confirmed === 'maybe') {
      const list = row[I_DETECTED] ? row[I_DETECTED].split('|') : [];
      const next = list.filter((x) => x !== 'slate');
      if (!next.includes('slate?')) next.push('slate?');
      row[I_DETECTED] = next.sort().join('|');
    }
    if (confirmed === 'true') kept++;
    else demoted++;
    done++;
    if (done % 25 === 0 || done === targets.length) {
      console.log(
        `  [${done}/${targets.length}] kept=${kept} demoted=${demoted} errored=${errored}` +
          (note ? `  (last: ${t.name} — ${note})` : ''),
      );
    }
  });

  // Write .bak then overwrite original
  const bak = CSV_PATH! + '.bak';
  fs.copyFileSync(CSV_PATH!, bak);
  fs.writeFileSync(CSV_PATH!, serializeCsv([header, ...data]));
  console.log(`\nBackup written: ${bak}`);
  console.log(`Updated:        ${CSV_PATH}`);
  console.log(`\n── Summary ──`);
  console.log(`Rows checked:   ${targets.length}`);
  console.log(`Confirmed true: ${kept}`);
  console.log(`Demoted maybe:  ${demoted}`);
  console.log(`Fetch errors:   ${errored} (counted in demoted)`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
