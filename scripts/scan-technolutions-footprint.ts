/**
 * Scan the websites in a client's CRM for Technolutions / Slate footprints.
 *
 * Primary indicator: a <script> tag whose src path ends in `/ping` (optionally
 * followed by a query string). Slate's tracking beacon is served from a
 * customer-branded CNAME (e.g. go.<school>.edu/ping, connect.<school>.edu/ping),
 * so the host varies but the `/ping` path is consistent.
 *
 * Secondary indicators (recorded for corroboration, not required):
 *   - literal "technolutions" or "technolutions.net" anywhere in the HTML
 *   - apply.<host>, go.<host>, slate.<host> subdomain references
 *
 * Flags:
 *   --email <email>    Resolve clientId via the user's email (default: postcaptain@simplerdevelopment.com)
 *   --client-id <n>    Override: scan this clientId directly, skipping email lookup
 *   --limit <n>        Only process the first N companies (useful for sanity checks)
 *   --concurrency <n>  Parallel fetches (default 5)
 *   --timeout <ms>     Per-request timeout (default 10000)
 *   --dry-run          List companies that would be scanned, no HTTP
 *   --out <path>       CSV output path (default scripts/output/technolutions-footprint-<ts>.csv)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const DRY_RUN = args.includes('--dry-run');
const EMAIL = argVal('--email', 'postcaptain@simplerdevelopment.com')!;
const CLIENT_ID_ARG = argVal('--client-id');
const LIMIT = argVal('--limit') ? parseInt(argVal('--limit')!, 10) : undefined;
const CONCURRENCY = parseInt(argVal('--concurrency', '5')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '10000')!, 10);
const OUT_ARG = argVal('--out');

// ── Indicator regexes ───────────────────────────────────────────────────────
// Any <script ... src="...://host/path/ping[?query]"...> — the /ping must be
// the final path segment. Case-insensitive host, permissive attribute order.
const PING_SCRIPT_RE =
  /<script\b[^>]*\bsrc\s*=\s*["']([^"']*\/ping(?:\?[^"']*)?)["'][^>]*>/gi;
const TECHNOLUTIONS_RE = /technolutions(?:\.net)?/gi;
const APPLY_SUBDOMAIN_RE = /https?:\/\/(apply|go|slate)\.([a-z0-9.-]+)/gi;

// ── Types ───────────────────────────────────────────────────────────────────
interface CompanyRow {
  id: number;
  name: string;
  website: string | null;
  domain: string | null;
}
interface ScanResult {
  companyId: number;
  companyName: string;
  url: string;
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
  pingMatches: string[];
  technolutionsMatches: string[];
  subdomainMatches: string[];
  hasPing: boolean;
  hasTechnolutions: boolean;
}

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    // Keep the path/query if provided (some websites link to a specific landing page)
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<{ status: number; finalUrl: string; body: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; PostCaptainFootprintBot/1.0; +https://postcaptain.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const body = await res.text();
    return { status: res.status, finalUrl: res.url, body };
  } finally {
    clearTimeout(timer);
  }
}

function scanHtml(html: string): Pick<ScanResult, 'pingMatches' | 'technolutionsMatches' | 'subdomainMatches' | 'hasPing' | 'hasTechnolutions'> {
  const pingSet = new Set<string>();
  const technoSet = new Set<string>();
  const subSet = new Set<string>();

  for (const m of html.matchAll(PING_SCRIPT_RE)) pingSet.add(m[1]);
  for (const m of html.matchAll(TECHNOLUTIONS_RE)) technoSet.add(m[0].toLowerCase());
  for (const m of html.matchAll(APPLY_SUBDOMAIN_RE)) subSet.add(`${m[1]}.${m[2]}`.toLowerCase());

  return {
    pingMatches: [...pingSet],
    technolutionsMatches: [...technoSet],
    subdomainMatches: [...subSet],
    hasPing: pingSet.size > 0,
    hasTechnolutions: technoSet.size > 0,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
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

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function run() {
  const { db } = await import('../lib/db');
  const { users, clients, crmCompanies } = await import('../lib/db/schema');
  const { eq, and, or, isNotNull, ne } = await import('drizzle-orm');

  // ── Resolve clientId ──────────────────────────────────────────────────────
  let clientId: number;
  if (CLIENT_ID_ARG) {
    clientId = parseInt(CLIENT_ID_ARG, 10);
    console.log(`Using clientId ${clientId} (from --client-id flag)`);
  } else {
    const [u] = await db
      .select({ userId: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, EMAIL))
      .limit(1);
    if (!u) {
      console.error(`No user found with email "${EMAIL}".`);
      process.exit(1);
    }
    const [c] = await db
      .select({ id: clients.id, company: clients.company })
      .from(clients)
      .where(eq(clients.userId, u.userId))
      .limit(1);
    if (!c) {
      console.error(`User ${u.userId} (${u.email}) has no matching client row.`);
      process.exit(1);
    }
    clientId = c.id;
    console.log(`Resolved ${EMAIL} → user ${u.userId} → client ${clientId} ("${c.company ?? '—'}")`);
  }

  // ── Load companies with website or domain ────────────────────────────────
  const rows: CompanyRow[] = await db
    .select({
      id: crmCompanies.id,
      name: crmCompanies.name,
      website: crmCompanies.website,
      domain: crmCompanies.domain,
    })
    .from(crmCompanies)
    .where(
      and(
        eq(crmCompanies.clientId, clientId),
        or(
          and(isNotNull(crmCompanies.website), ne(crmCompanies.website, '')),
          and(isNotNull(crmCompanies.domain), ne(crmCompanies.domain, ''))
        )
      )
    );

  console.log(`Loaded ${rows.length} companies with website or domain for client ${clientId}.`);

  // Build (companyRow, url) targets — prefer website, fall back to domain
  const targets = rows
    .map((r) => {
      const url = normalizeUrl(r.website) ?? normalizeUrl(r.domain);
      return url ? { row: r, url } : null;
    })
    .filter((t): t is { row: CompanyRow; url: string } => !!t);

  console.log(`${targets.length} companies have a usable URL; ${rows.length - targets.length} skipped (unparseable).`);

  const pool = LIMIT ? targets.slice(0, LIMIT) : targets;
  if (LIMIT) console.log(`Limiting to first ${pool.length} companies (--limit ${LIMIT}).`);

  if (DRY_RUN) {
    console.log('\n── Dry run — companies that would be scanned ──');
    for (const t of pool.slice(0, 25)) console.log(`  [${t.row.id}] ${t.row.name} → ${t.url}`);
    if (pool.length > 25) console.log(`  ... ${pool.length - 25} more`);
    process.exit(0);
  }

  // ── Scan ──────────────────────────────────────────────────────────────────
  console.log(`Scanning ${pool.length} sites with concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms...`);
  const started = Date.now();
  let done = 0;
  const results: ScanResult[] = await mapWithConcurrency(pool, CONCURRENCY, async (t) => {
    const base: ScanResult = {
      companyId: t.row.id,
      companyName: t.row.name,
      url: t.url,
      httpStatus: null,
      finalUrl: null,
      error: null,
      pingMatches: [],
      technolutionsMatches: [],
      subdomainMatches: [],
      hasPing: false,
      hasTechnolutions: false,
    };
    try {
      const r = await fetchWithTimeout(t.url, TIMEOUT_MS);
      base.httpStatus = r.status;
      base.finalUrl = r.finalUrl;
      if (r.status >= 200 && r.status < 400) {
        Object.assign(base, scanHtml(r.body));
      }
    } catch (err: unknown) {
      base.error = err instanceof Error ? err.message : String(err);
    }
    done++;
    if (done % 10 === 0 || done === pool.length) {
      const pct = ((done / pool.length) * 100).toFixed(0);
      console.log(`  [${done}/${pool.length} ${pct}%] scanned`);
    }
    return base;
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Scan finished in ${elapsed}s.`);

  // ── Write CSV ─────────────────────────────────────────────────────────────
  const outDir = path.join('scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = OUT_ARG ?? path.join(outDir, `technolutions-footprint-client${clientId}-${ts}.csv`);

  const header = [
    'company_id',
    'company_name',
    'scanned_url',
    'final_url',
    'http_status',
    'error',
    'has_ping_script',
    'has_technolutions_literal',
    'ping_urls',
    'technolutions_matches',
    'apply_go_slate_subdomains',
  ];
  const lines: string[] = [header.join(',')];
  for (const r of results) {
    lines.push(
      [
        r.companyId,
        csvEscape(r.companyName),
        csvEscape(r.url),
        csvEscape(r.finalUrl),
        r.httpStatus ?? '',
        csvEscape(r.error),
        r.hasPing,
        r.hasTechnolutions,
        csvEscape(r.pingMatches.join(' | ')),
        csvEscape(r.technolutionsMatches.join(' | ')),
        csvEscape(r.subdomainMatches.join(' | ')),
      ].join(',')
    );
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${results.length} rows to ${outPath}`);

  // ── Console summary ───────────────────────────────────────────────────────
  const confirmed = results.filter((r) => r.hasPing);
  const suspected = results.filter((r) => !r.hasPing && r.hasTechnolutions);
  const errored = results.filter((r) => r.error);
  const ok = results.filter((r) => r.httpStatus && r.httpStatus >= 200 && r.httpStatus < 400);

  console.log('\n── Summary ──');
  console.log(`Reachable sites:                       ${ok.length}/${results.length}`);
  console.log(`Errored:                               ${errored.length}`);
  console.log(`Confirmed Slate (/ping script found):  ${confirmed.length}`);
  console.log(`Suspected (technolutions literal only):${suspected.length}`);

  if (confirmed.length > 0) {
    console.log('\n── Confirmed Slate/Technolutions hits ──');
    for (const r of confirmed.slice(0, 50)) {
      console.log(`  [${r.companyId}] ${r.companyName}`);
      console.log(`    url: ${r.finalUrl ?? r.url}`);
      for (const p of r.pingMatches.slice(0, 3)) console.log(`    ping: ${p}`);
    }
    if (confirmed.length > 50) console.log(`  ... ${confirmed.length - 50} more (see CSV)`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
