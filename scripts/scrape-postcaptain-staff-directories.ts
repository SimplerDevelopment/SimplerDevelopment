/**
 * Scrape staff/faculty directory pages for every postcaptain CRM company that
 * has a website, extract structured contacts, and insert them into
 * crm_contacts (source = 'website-scrape').
 *
 *   1. Fetch the homepage
 *   2. Score directory candidate URLs from anchors + URL guesses
 *   3. Fetch the top candidates and run the extractor on each
 *   4. Dedupe per company by email or by full name
 *   5. Insert any contact whose email isn't already on file for that company
 *
 * Flags:
 *   --email <email>       Resolve client via user email (default postcaptain@…)
 *   --client-id <n>       Override clientId
 *   --limit <n>           Only first N companies
 *   --concurrency <n>     Parallel companies (default 4 — be polite)
 *   --max-candidates <n>  Try up to N directory candidates per site (default 2)
 *   --timeout <ms>        Per-request timeout (default 12000)
 *   --max-existing-contacts <n>
 *                         Only scrape companies that already have ≤ N contacts
 *                         in crm_contacts for this client (useful for back-filling
 *                         thin CSV-imported companies).
 *   --dry-run             Don't insert; print first per-company sample to stdout
 *   --insert              Required to actually write to the DB
 *   --verbose             Per-site detail logging
 *   --out <path>          CSV of all candidate contacts (default scripts/output/staff-scrape-<ts>.csv)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  findDirectoryCandidates,
  extractContacts,
  GUESSED_DIRECTORY_PATHS,
  type ScrapedContact,
} from '../lib/directory-scraper';

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return def;
  return args[i + 1];
}
const DRY_RUN = args.includes('--dry-run');
const INSERT = args.includes('--insert');
const VERBOSE = args.includes('--verbose');
const EMAIL = argVal('--email', 'postcaptain@simplerdevelopment.com')!;
const CLIENT_ID_ARG = argVal('--client-id');
const LIMIT = argVal('--limit') ? parseInt(argVal('--limit')!, 10) : undefined;
const CONCURRENCY = parseInt(argVal('--concurrency', '4')!, 10);
const MAX_CANDIDATES = parseInt(argVal('--max-candidates', '2')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '12000')!, 10);
const MAX_EXISTING_CONTACTS = argVal('--max-existing-contacts')
  ? parseInt(argVal('--max-existing-contacts')!, 10)
  : undefined;
const OUT_ARG = argVal('--out');

if (!DRY_RUN && !INSERT) {
  console.error('Refusing to run: pass --dry-run to preview, or --insert to actually write contacts.');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (compatible; PostCaptainDirectoryScraper/1.0; +https://postcaptain.com)';

interface CompanyRow { id: number; name: string; website: string | null; domain: string | null; }
interface CompanyResult {
  companyId: number;
  companyName: string;
  homepageUrl: string;
  homepageStatus: number | null;
  candidateUrls: string[];
  pickedUrl: string | null;
  pickedStatus: number | null;
  scraped: ScrapedContact[];
  inserted: number;
  skippedExisting: number;
  error: string | null;
}

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).toString(); } catch { return null; }
}

async function fetchWithTimeout(url: string, ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: c.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const body = await res.text();
    return { status: res.status, finalUrl: res.url, body };
  } finally { clearTimeout(t); }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (i: T, idx: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function run() {
  const { db } = await import('../lib/db');
  const { users, clients, crmCompanies, crmContacts } = await import('../lib/db/schema');
  const { eq, and, or, isNotNull, ne, inArray } = await import('drizzle-orm');

  // Resolve client
  let clientId: number;
  if (CLIENT_ID_ARG) {
    clientId = parseInt(CLIENT_ID_ARG, 10);
    console.log(`Using clientId ${clientId} (from --client-id)`);
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!u) { console.error(`No user ${EMAIL}`); process.exit(1); }
    const [c] = await db.select({ id: clients.id, company: clients.company }).from(clients).where(eq(clients.userId, u.id)).limit(1);
    if (!c) { console.error(`User ${u.id} has no client`); process.exit(1); }
    clientId = c.id;
    console.log(`Resolved ${EMAIL} → client ${clientId} ("${c.company ?? '—'}")`);
  }

  // Load companies with a usable URL
  const rows: CompanyRow[] = await db
    .select({ id: crmCompanies.id, name: crmCompanies.name, website: crmCompanies.website, domain: crmCompanies.domain })
    .from(crmCompanies)
    .where(and(eq(crmCompanies.clientId, clientId), or(
      and(isNotNull(crmCompanies.website), ne(crmCompanies.website, '')),
      and(isNotNull(crmCompanies.domain), ne(crmCompanies.domain, '')),
    )));
  let targets = rows
    .map((r) => { const u = normalizeUrl(r.website) ?? normalizeUrl(r.domain); return u ? { row: r, url: u } : null; })
    .filter((t): t is { row: CompanyRow; url: string } => !!t);

  // Optionally narrow to companies whose existing contact count is ≤ threshold.
  // Useful for back-filling thin records (e.g. CSV-imported companies with 1 seat).
  if (MAX_EXISTING_CONTACTS !== undefined) {
    const { sql } = await import('drizzle-orm');
    const before = targets.length;
    const countRows = await db
      .select({ companyId: crmContacts.companyId, n: sql<number>`count(*)::int` })
      .from(crmContacts)
      .where(eq(crmContacts.clientId, clientId))
      .groupBy(crmContacts.companyId);
    const countMap = new Map<number, number>();
    for (const r of countRows) if (r.companyId != null) countMap.set(r.companyId, Number(r.n));
    targets = targets.filter((t) => (countMap.get(t.row.id) ?? 0) <= MAX_EXISTING_CONTACTS);
    console.log(`Filtered by --max-existing-contacts=${MAX_EXISTING_CONTACTS}: ${before} → ${targets.length} companies`);
  }

  const pool = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`${pool.length} companies in scope (limit=${LIMIT ?? 'none'}). Scraping with concurrency=${CONCURRENCY}.`);

  // Pre-load existing emails per company so we can skip duplicates.
  const companyIds = pool.map((t) => t.row.id);
  const existingEmails = new Map<number, Set<string>>();
  for (let i = 0; i < companyIds.length; i += 1000) {
    const batch = companyIds.slice(i, i + 1000);
    const found = await db
      .select({ companyId: crmContacts.companyId, email: crmContacts.email })
      .from(crmContacts)
      .where(and(eq(crmContacts.clientId, clientId), inArray(crmContacts.companyId, batch)));
    for (const r of found) {
      if (!r.companyId || !r.email) continue;
      let s = existingEmails.get(r.companyId);
      if (!s) { s = new Set(); existingEmails.set(r.companyId, s); }
      s.add(r.email.toLowerCase());
    }
  }

  let done = 0;
  const started = Date.now();
  const results: CompanyResult[] = await mapWithConcurrency(pool, CONCURRENCY, async (t) => {
    const out: CompanyResult = {
      companyId: t.row.id, companyName: t.row.name, homepageUrl: t.url,
      homepageStatus: null, candidateUrls: [], pickedUrl: null, pickedStatus: null,
      scraped: [], inserted: 0, skippedExisting: 0, error: null,
    };
    try {
      const home = await fetchWithTimeout(t.url, TIMEOUT_MS);
      out.homepageStatus = home.status;
      if (home.status < 200 || home.status >= 400) return finish();

      // Score candidates from links
      const scored = findDirectoryCandidates(home.body, home.finalUrl, MAX_CANDIDATES * 2);
      out.candidateUrls = scored.map((s) => s.url);

      // Try linked candidates first (top MAX_CANDIDATES). If they all come up
      // empty, fall back to common URL guesses.
      const baseHost = new URL(home.finalUrl).origin;
      const guessUrls = GUESSED_DIRECTORY_PATHS.map((p) => baseHost + p)
        .filter((u) => !out.candidateUrls.includes(u));
      const linkedTry = out.candidateUrls.slice(0, MAX_CANDIDATES);

      const seenKey = new Map<string, ScrapedContact>();
      const tryUrl = async (url: string) => {
        try {
          const r = await fetchWithTimeout(url, TIMEOUT_MS);
          if (r.status < 200 || r.status >= 400) return 0;
          const found = extractContacts(r.body, r.finalUrl);
          for (const c of found) {
            const key = c.email ? `e:${c.email.toLowerCase()}` : `n:${c.firstName.toLowerCase()} ${(c.lastName ?? '').toLowerCase()}`.trim();
            if (!seenKey.has(key)) seenKey.set(key, c);
          }
          if (found.length > 0 && !out.pickedUrl) { out.pickedUrl = url; out.pickedStatus = r.status; }
          return found.length;
        } catch { return 0; }
      };

      for (const url of linkedTry) {
        await tryUrl(url);
        if (seenKey.size >= 200) break;
      }
      // Fallback: if linked candidates extracted nothing, walk the URL guess list.
      if (seenKey.size === 0) {
        for (const url of guessUrls) {
          const n = await tryUrl(url);
          if (n > 0 || seenKey.size >= 200) break;
        }
      }
      out.scraped = [...seenKey.values()];

      // Insert (or pretend)
      const existing = existingEmails.get(t.row.id) ?? new Set<string>();
      const toInsert = out.scraped.filter((c) => {
        if (!c.email) return true; // accept name-only contacts (no dedup possible)
        if (existing.has(c.email.toLowerCase())) { out.skippedExisting++; return false; }
        return true;
      });
      if (INSERT && toInsert.length > 0) {
        const rows = toInsert.map((c) => ({
          clientId,
          companyId: t.row.id,
          firstName: c.firstName.slice(0, 100),
          lastName: c.lastName ? c.lastName.slice(0, 100) : null,
          email: c.email ? c.email.slice(0, 255) : null,
          phone: c.phone ? c.phone.slice(0, 50) : null,
          linkedinUrl: c.linkedinUrl ? c.linkedinUrl.slice(0, 500) : null,
          title: c.title ? c.title.slice(0, 150) : null,
          source: 'website-scrape',
        }));
        // Chunked inserts to avoid huge bind lists
        for (let i = 0; i < rows.length; i += 200) {
          await db.insert(crmContacts).values(rows.slice(i, i + 200));
        }
        out.inserted = rows.length;
      } else {
        out.inserted = toInsert.length;
      }
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
    }
    return finish();

    function finish() {
      done++;
      if (done % 25 === 0 || done === pool.length || VERBOSE) {
        const pct = ((done / pool.length) * 100).toFixed(0);
        const tag = `[${done}/${pool.length} ${pct}%]`;
        if (VERBOSE) {
          console.log(`${tag} ${out.companyName} → ${out.scraped.length} contacts (insert=${out.inserted}, skip=${out.skippedExisting}) via ${out.pickedUrl ?? 'no candidate hit'}`);
        } else {
          console.log(`${tag} processed`);
        }
      }
      return out;
    }
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nScrape finished in ${elapsed}s.`);

  // CSV of all contacts
  const outDir = path.join('scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = OUT_ARG ?? path.join(outDir, `staff-scrape-client${clientId}-${ts}.csv`);
  const lines = ['company_id,company_name,picked_url,first_name,last_name,email,phone,title,linkedin,source'];
  for (const r of results) {
    if (r.scraped.length === 0) continue;
    for (const c of r.scraped) {
      lines.push([
        r.companyId, csvEscape(r.companyName), csvEscape(r.pickedUrl),
        csvEscape(c.firstName), csvEscape(c.lastName), csvEscape(c.email),
        csvEscape(c.phone), csvEscape(c.title), csvEscape(c.linkedinUrl),
        csvEscape(c.source),
      ].join(','));
    }
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length - 1} contact rows to ${outPath}`);

  // Summary
  const reachable = results.filter((r) => r.homepageStatus && r.homepageStatus >= 200 && r.homepageStatus < 400).length;
  const withCandidates = results.filter((r) => r.candidateUrls.length > 0).length;
  const withScraped = results.filter((r) => r.scraped.length > 0).length;
  const totalContacts = results.reduce((a, r) => a + r.scraped.length, 0);
  const totalInserted = results.reduce((a, r) => a + r.inserted, 0);
  const totalSkipped = results.reduce((a, r) => a + r.skippedExisting, 0);

  console.log('\n── Summary ──');
  console.log(`Companies processed:           ${results.length}`);
  console.log(`Homepages reachable:           ${reachable}`);
  console.log(`Companies w/ directory link:   ${withCandidates}`);
  console.log(`Companies w/ extracted people: ${withScraped}`);
  console.log(`Total contacts extracted:      ${totalContacts}`);
  console.log(`${INSERT ? 'Inserted into CRM' : 'Would insert'}:           ${totalInserted}`);
  console.log(`Skipped (email already in CRM):${totalSkipped}`);

  if (DRY_RUN) {
    console.log('\n── Sample (first 8 companies w/ contacts) ──');
    for (const r of results.filter((x) => x.scraped.length > 0).slice(0, 8)) {
      console.log(`\n[${r.companyId}] ${r.companyName} — ${r.pickedUrl}`);
      for (const c of r.scraped.slice(0, 5)) {
        console.log(`  ${c.firstName} ${c.lastName ?? ''}${c.title ? ' · ' + c.title : ''}${c.email ? ' · ' + c.email : ''}${c.phone ? ' · ' + c.phone : ''}${c.linkedinUrl ? ' · ' + c.linkedinUrl : ''}  [${c.source}]`);
      }
      if (r.scraped.length > 5) console.log(`  …and ${r.scraped.length - 5} more`);
    }
  }

  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
