/**
 * Deep re-verification for `tech__slate=maybe` rows.
 *
 * The shallow check (verify-slate-flags.ts) only inspected the marketing
 * homepage. But schools typically run Slate on a dedicated `apply.<school>.edu`
 * (or `go.` / `slate.`) subdomain — the marketing site just links over to it.
 * That's why the original loose regex caught real Slate users that the shallow
 * verifier then incorrectly demoted.
 *
 * This script re-examines each row currently marked "maybe":
 *   1. Refetch the homepage.
 *   2. Extract every unique <a href> / src URL whose host starts with
 *      apply./go./slate. and points at the same root domain (or technolutions.net).
 *   3. Fetch the root of each such subdomain (cap: 4 probes/site).
 *   4. If ANY of those responses contains "technolutions" or a /ping <script>,
 *      promote tech__slate back to "true".
 *   5. Otherwise leave it as "maybe".
 *
 * The CSV is rewritten in place; the previous .bak is left untouched and a
 * fresh .deepbak copy is written.
 *
 * Usage:
 *   npx tsx scripts/verify-slate-flags-deep.ts <csv-path> [--concurrency 12] [--timeout 12000]
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
  console.error('Usage: tsx scripts/verify-slate-flags-deep.ts <csv-path>');
  process.exit(1);
}
const CONCURRENCY = parseInt(argVal('--concurrency', '12')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '12000')!, 10);
const MAX_PROBES_PER_SITE = 4;

// ── CSV helpers (RFC 4180-ish) ──────────────────────────────────────────────
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
        Accept: 'text/html,application/xhtml+xml',
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

// Strip `www.` and return the registrable-ish suffix for matching.
function rootDomain(host: string): string {
  return host.replace(/^www\./i, '').toLowerCase();
}

// Capture the full URL (incl. path/query) so /portal/ and /register/?id=... survive.
const SUBDOMAIN_URL_RE = /https?:\/\/(?:apply|go|slate)\.[a-z0-9.\-]+(?:\/[^\s"'<>)]*)?/gi;
const TECHNOLUTIONS_RE = /technolutions/i;
const PING_SCRIPT_RE = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\/ping(?:\?[^"']*)?["']/i;

interface SlateProbe {
  url: string; // full URL (or fallback path) to fetch
  host: string;
}

/**
 * Build the probe list for a homepage. Strategy:
 *   1. Every full apply./go./slate. URL we see on the page (path preserved).
 *   2. For every unique apply./go./slate. host we see, also queue a /portal/
 *      fallback — Slate's portal landing reliably contains "technolutions"
 *      (even on its 404), and most schools' apply roots redirect away.
 */
function extractSlateProbes(html: string, baseHost: string): SlateProbe[] {
  const baseRoot = rootDomain(baseHost);
  const seen = new Set<string>();
  const probes: SlateProbe[] = [];
  const hosts = new Set<string>();

  for (const m of html.matchAll(SUBDOMAIN_URL_RE)) {
    let raw = m[0];
    let parsed: URL;
    try { parsed = new URL(raw); } catch { continue; }
    const host = parsed.hostname.toLowerCase();
    const isMatch =
      host.endsWith('.' + baseRoot) ||
      host === baseRoot ||
      host.endsWith('.technolutions.net') ||
      host.endsWith('technolutions.net');
    if (!isMatch) continue;
    hosts.add(host);
    const url = parsed.toString();
    if (!seen.has(url)) { seen.add(url); probes.push({ url, host }); }
  }
  // /portal/ fallback per unique host
  for (const host of hosts) {
    const fallback = `https://${host}/portal/`;
    if (!seen.has(fallback)) { seen.add(fallback); probes.push({ url: fallback, host }); }
  }
  return probes.slice(0, MAX_PROBES_PER_SITE);
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
  console.log(`${targets.length} rows are "maybe". Probing apply./go./slate. subdomains…`);

  let done = 0, promoted = 0, stayedMaybe = 0, noSubdomain = 0, errored = 0;

  await mapWithConcurrency(targets, CONCURRENCY, async (t) => {
    let confirmed = false;
    let probeCount = 0;
    let baseHost = '';
    let evidence: string | null = null;
    try {
      const home = await fetchWithTimeout(t.url, TIMEOUT_MS);
      try { baseHost = new URL(home.finalUrl || t.url).hostname; } catch { baseHost = ''; }
      if (home.status >= 200 && home.status < 400 && baseHost) {
        const probes = extractSlateProbes(home.body, baseHost);
        if (probes.length === 0) {
          noSubdomain++;
        } else {
          for (const p of probes) {
            probeCount++;
            try {
              const probe = await fetchWithTimeout(p.url, Math.min(TIMEOUT_MS, 10000));
              // Slate's own 4xx pages still contain "technolutions" and the /ping
              // tracking script, so don't gate on a 2xx status here.
              if (TECHNOLUTIONS_RE.test(probe.body) || PING_SCRIPT_RE.test(probe.body)) {
                confirmed = true;
                evidence = p.url;
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
      // restore detected_techs: drop slate?, ensure slate is present
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
        `  [${done}/${targets.length}] promoted=${promoted} stayed_maybe=${stayedMaybe} no_subdomain=${noSubdomain} errored=${errored}${last}`,
      );
    }
  });

  // Backup + write
  const bak = CSV_PATH! + '.deepbak';
  fs.copyFileSync(CSV_PATH!, bak);
  fs.writeFileSync(CSV_PATH!, serializeCsv([header, ...data]));
  console.log(`\nBackup written: ${bak}`);
  console.log(`Updated:        ${CSV_PATH}`);

  // Final tallies
  let nTrue = 0, nMaybe = 0;
  for (const r of data) {
    if (r[I_SLATE] === 'true') nTrue++;
    else if (r[I_SLATE] === 'maybe') nMaybe++;
  }
  console.log(`\n── Summary ──`);
  console.log(`Maybe rows checked: ${targets.length}`);
  console.log(`Promoted to true:   ${promoted}`);
  console.log(`Still maybe:        ${stayedMaybe}`);
  console.log(`No apply./go./slate. link found: ${noSubdomain}`);
  console.log(`Fetch errors on homepage: ${errored}`);
  console.log(`\nFinal column totals → tech__slate=true: ${nTrue}, maybe: ${nMaybe}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
