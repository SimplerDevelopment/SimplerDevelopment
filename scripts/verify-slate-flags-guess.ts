/**
 * Fourth-pass verification for `tech__slate=maybe` rows.
 *
 * Some schools host Slate on a branded subdomain that they never link to from
 * the marketing homepage (e.g. connect.<school>.edu, enroll.<school>.edu).
 * The previous passes only saw subdomains explicitly linked in HTML, so those
 * sites stayed "maybe".
 *
 * This pass guesses the most common Slate-hosted subdomain prefixes and
 * directly hits `<sub>.<root>/ping`. Slate's /ping endpoint serves the
 * tracking-beacon JS — the body reliably contains "technolutions" when the
 * host is a real Slate instance, and DNS just NXDOMAINs fast otherwise.
 *
 * Candidate prefixes (informed by hosts surfaced in the prior pass):
 *   apply, connect, enroll, admissions, go, slate, future, gradapply,
 *   applynow, my
 *
 * The CSV is rewritten in place; a `.guessbak` snapshot is left alongside.
 *
 * Usage:
 *   npx tsx scripts/verify-slate-flags-guess.ts <csv-path> [--concurrency 10] [--timeout 6000]
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
  console.error('Usage: tsx scripts/verify-slate-flags-guess.ts <csv-path>');
  process.exit(1);
}
const CONCURRENCY = parseInt(argVal('--concurrency', '10')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '6000')!, 10);

const SLATE_PREFIXES = [
  'apply',
  'connect',
  'enroll',
  'admissions',
  'go',
  'slate',
  'future',
  'gradapply',
  'applynow',
  'my',
];

// ── CSV helpers ────────────────────────────────────────────────────────────
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
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
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
        'User-Agent': 'Mozilla/5.0 (compatible; PostCaptainTechScan/1.0; +https://postcaptain.com)',
        Accept: '*/*',
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

const TECHNOLUTIONS_RE = /technolutions/i;

// Strip a leading `www.` and return the host. Schools sometimes have multi-
// part subdomains (e.g. `home.college.example.org`); for guessing purposes
// we just use the host minus a leading `www.`. The candidate becomes
// `<prefix>.<that>`. This handles `www.school.edu` → `school.edu` correctly.
function rootForGuess(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

async function run() {
  const text = fs.readFileSync(CSV_PATH!, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) { console.error('CSV has no data rows.'); process.exit(1); }
  const header = rows[0];
  const data = rows.slice(1).filter((r) => r.length === header.length);

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

  const targets: { rowIdx: number; host: string; companyId: string; name: string }[] = [];
  data.forEach((r, i) => {
    if (r[I_SLATE] === 'maybe') {
      const host = rootForGuess(r[I_FINAL] || r[I_SCANNED]);
      if (host) targets.push({ rowIdx: i, host, companyId: r[I_ID], name: r[I_NAME] });
    }
  });
  console.log(`${targets.length} rows are "maybe". Guessing Slate-hosted subdomains…`);
  console.log(`Candidates per site: ${SLATE_PREFIXES.map((p) => `${p}.<host>/ping`).join(', ')}`);

  let done = 0, promoted = 0, stayedMaybe = 0, errored = 0;

  await mapWithConcurrency(targets, CONCURRENCY, async (t) => {
    const candidates = SLATE_PREFIXES.map((p) => `https://${p}.${t.host}/ping`);
    let confirmed = false;
    let evidence: string | null = null;

    // Fire all candidates in parallel; any one hit is enough.
    const settled = await Promise.allSettled(
      candidates.map(async (url) => {
        try {
          const r = await fetchWithTimeout(url, TIMEOUT_MS);
          // /ping returns JS — only the body matters. Accept any status.
          if (TECHNOLUTIONS_RE.test(r.body)) return url;
        } catch { /* DNS/network failure is expected for non-existent hosts */ }
        return null;
      }),
    );
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) { confirmed = true; evidence = s.value; break; }
    }

    const row = data[t.rowIdx];
    if (confirmed) {
      row[I_SLATE] = 'true';
      const list = (row[I_DETECTED] ? row[I_DETECTED].split('|') : []).filter((x) => x !== 'slate?');
      if (!list.includes('slate')) list.push('slate');
      row[I_DETECTED] = list.sort().join('|');
      promoted++;
    } else {
      stayedMaybe++;
    }
    done++;
    if (done % 25 === 0 || done === targets.length) {
      const last = evidence ? ` (last hit: ${t.name} via ${evidence})` : '';
      console.log(
        `  [${done}/${targets.length}] promoted=${promoted} stayed_maybe=${stayedMaybe} errored=${errored}${last}`,
      );
    }
  });

  const bak = CSV_PATH! + '.guessbak';
  fs.copyFileSync(CSV_PATH!, bak);
  fs.writeFileSync(CSV_PATH!, serializeCsv([header, ...data]));
  console.log(`\nBackup written: ${bak}`);
  console.log(`Updated:        ${CSV_PATH}`);

  let nTrue = 0, nMaybe = 0;
  for (const r of data) {
    if (r[I_SLATE] === 'true') nTrue++;
    else if (r[I_SLATE] === 'maybe') nMaybe++;
  }
  console.log(`\n── Summary ──`);
  console.log(`Maybe rows checked: ${targets.length}`);
  console.log(`Promoted to true:   ${promoted}`);
  console.log(`Still maybe:        ${stayedMaybe}`);
  console.log(`\nFinal column totals → tech__slate=true: ${nTrue}, maybe: ${nMaybe}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
