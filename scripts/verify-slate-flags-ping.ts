/**
 * Third-pass verification for `tech__slate=maybe` rows.
 *
 * Slate's tracking beacon is a <script> tag whose src ends with `/ping` (e.g.
 * `<script src="//apply.school.edu/ping"></script>`). The script BODY itself
 * is served by Technolutions and reliably contains the literal "technolutions"
 * — so even on schools where the apply.<host> probe came up empty, the /ping
 * script will give a definitive yes.
 *
 * Strategy:
 *   1. Refetch the homepage for every row currently marked "maybe".
 *   2. Find every <script src="...something/ping[?...]"> tag.
 *   3. Resolve each src to an absolute URL and fetch it (cap: 4 per site).
 *   4. If the response body contains "technolutions", promote tech__slate to "true".
 *
 * The CSV is rewritten in place; a `.pingbak` snapshot is left alongside.
 *
 * Usage:
 *   npx tsx scripts/verify-slate-flags-ping.ts <csv-path> [--concurrency 12] [--timeout 12000]
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
  console.error('Usage: tsx scripts/verify-slate-flags-ping.ts <csv-path>');
  process.exit(1);
}
const CONCURRENCY = parseInt(argVal('--concurrency', '12')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '12000')!, 10);
const MAX_PROBES_PER_SITE = 4;

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

async function fetchWithTimeout(url: string, ms: number): Promise<{ status: number; body: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; PostCaptainTechScan/1.0; +https://postcaptain.com)',
        Accept: '*/*',
      },
    });
    const body = await res.text();
    return { status: res.status, body, finalUrl: res.url };
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

// <script ... src="...XXX/ping[?...]" ...> — captures the src value (g 1)
const PING_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']*\/ping(?:\?[^"']*)?)["'][^>]*>/gi;
const TECHNOLUTIONS_RE = /technolutions/i;

function extractPingUrls(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(PING_SRC_RE)) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      // URL constructor handles absolute, protocol-relative (//host/...) and relative paths
      const abs = new URL(raw, baseUrl).toString();
      out.add(abs);
    } catch { /* skip malformed */ }
    if (out.size >= MAX_PROBES_PER_SITE) break;
  }
  return [...out];
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

  const targets: { rowIdx: number; url: string; companyId: string; name: string }[] = [];
  data.forEach((r, i) => {
    if (r[I_SLATE] === 'maybe') {
      const url = r[I_FINAL] || r[I_SCANNED];
      if (url) targets.push({ rowIdx: i, url, companyId: r[I_ID], name: r[I_NAME] });
    }
  });
  console.log(`${targets.length} rows are "maybe". Looking for /ping <script> tags…`);

  let done = 0, promoted = 0, stayedMaybe = 0, noPing = 0, errored = 0;

  await mapWithConcurrency(targets, CONCURRENCY, async (t) => {
    let confirmed = false;
    let evidence: string | null = null;
    let hadPing = false;
    try {
      const home = await fetchWithTimeout(t.url, TIMEOUT_MS);
      if (home.status >= 200 && home.status < 400) {
        const pingUrls = extractPingUrls(home.body, home.finalUrl || t.url);
        if (pingUrls.length === 0) {
          noPing++;
        } else {
          hadPing = true;
          for (const pu of pingUrls) {
            try {
              const probe = await fetchWithTimeout(pu, Math.min(TIMEOUT_MS, 10000));
              // The /ping endpoint returns JavaScript; we only care that the body
              // mentions technolutions (also accept any 2xx/3xx/4xx body content).
              if (TECHNOLUTIONS_RE.test(probe.body)) {
                confirmed = true;
                evidence = pu;
                break;
              }
            } catch { /* probe failure non-fatal */ }
          }
        }
      }
    } catch (err) {
      errored++;
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
        `  [${done}/${targets.length}] promoted=${promoted} stayed_maybe=${stayedMaybe} no_ping=${noPing} errored=${errored}${last}`,
      );
    }
  });

  const bak = CSV_PATH! + '.pingbak';
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
  console.log(`Maybe rows checked:    ${targets.length}`);
  console.log(`Promoted to true:      ${promoted}`);
  console.log(`Still maybe:           ${stayedMaybe}`);
  console.log(`No /ping <script> tag: ${noPing}`);
  console.log(`Fetch errors (home):   ${errored}`);
  console.log(`\nFinal column totals → tech__slate=true: ${nTrue}, maybe: ${nMaybe}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
