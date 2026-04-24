/**
 * Playwright + Claude Haiku staff-directory scraper for the postcaptain CRM.
 *
 * Why this exists:
 *   scripts/scrape-postcaptain-staff-directories.ts uses static fetch + JSDOM.
 *   It works on simple sites but fails on higher-ed directories that are JS-
 *   rendered or use non-standard markup — the 1,883 ≤1-contact companies in
 *   the postcaptain CRM are the residue that the static scraper could not
 *   crack.
 *
 * Approach:
 *   1. Resolve client + load companies (optionally filtered by
 *      existing-contact-count).
 *   2. Launch one Chromium browser, one context per worker.
 *   3. For each company, navigate to the homepage, then walk top directory
 *      candidates (reusing findDirectoryCandidates from the static scraper)
 *      plus GUESSED_DIRECTORY_PATHS.
 *   4. On each candidate: wait for network to settle, grab the rendered HTML,
 *      strip noise (scripts/styles/svg/nav/footer/header/forms), then ask
 *      Claude Haiku to extract a JSON array of contacts.
 *   5. Dedupe per company (by email, then by full name), skip contacts whose
 *      email is already on file, insert in chunks.
 *
 * The Haiku extractor is forgiving but not credulous — its prompt tells it to
 * reject generic blurbs ("Click here", "Our Team"), require at least a first
 * name and one of {title, email, linkedinUrl}, and return [] when unsure.
 *
 * Flags mirror the static scraper:
 *   --email <email>         Default postcaptain@simplerdevelopment.com
 *   --client-id <n>
 *   --limit <n>
 *   --concurrency <n>       Default 4 (playwright is heavier than fetch)
 *   --max-candidates <n>    Default 3
 *   --max-existing-contacts <n>
 *   --timeout <ms>          Per-page navigation timeout (default 20000)
 *   --model <id>            Default claude-haiku-4-5-20251001
 *   --dry-run | --insert    Required — one or the other
 *   --verbose
 *   --out <path>            Default scripts/output/staff-playwright-<ts>.csv
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import * as fs from 'node:fs';
import * as path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import {
  findDirectoryCandidates,
  GUESSED_DIRECTORY_PATHS,
} from '../lib/directory-scraper';

// ─── CLI ──────────────────────────────────────────────────────────────────
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
const MAX_CANDIDATES = parseInt(argVal('--max-candidates', '3')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '20000')!, 10);
const MAX_EXISTING_CONTACTS = argVal('--max-existing-contacts')
  ? parseInt(argVal('--max-existing-contacts')!, 10)
  : undefined;
const MODEL_ID = argVal('--model', 'claude-haiku-4-5-20251001')!;
const OUT_ARG = argVal('--out');

if (!DRY_RUN && !INSERT) {
  console.error('Refusing to run: pass --dry-run to preview, or --insert to actually write contacts.');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set in the environment.');
  process.exit(1);
}

// 60s per-request timeout so a hung LLM call can't freeze a worker indefinitely.
// maxRetries=2 is the SDK default — fine since the timeout ensures bounded wait.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 });

// ─── Types ────────────────────────────────────────────────────────────────
interface CompanyRow { id: number; name: string; website: string | null; domain: string | null; }
interface LlmContact {
  firstName: string;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
}
interface CompanyResult {
  companyId: number;
  companyName: string;
  homepageUrl: string;
  homepageOk: boolean;
  pickedUrls: string[];
  scraped: LlmContact[];
  inserted: number;
  skippedExisting: number;
  tokensIn: number;
  tokensOut: number;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).toString(); } catch { return null; }
}

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Strip a rendered HTML page to a compact, LLM-friendly skeleton.
 * Drops <script>/<style>/<svg>/<noscript>/<form>, and obvious chrome
 * (nav, header, footer, aside). Keeps main + body text + anchors, then
 * collapses whitespace. Aims for ~3-6KB from a 40-80KB page.
 */
function stripHtmlForLlm(html: string): string {
  let s = html;
  // Kill entire tag blocks including content
  const killPairs = ['script', 'style', 'svg', 'noscript', 'form', 'nav', 'header', 'footer', 'aside', 'iframe'];
  for (const tag of killPairs) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    s = s.replace(re, ' ');
    // Also kill self-closing variants like <nav ... />
    s = s.replace(new RegExp(`<${tag}\\b[^>]*\\/>`, 'gi'), ' ');
  }
  // HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Common chrome by class/id hint (best-effort — we don't parse)
  // Collapse tag attrs to minimum: keep href/title/alt/mailto/tel; drop the rest.
  s = s.replace(/<([a-zA-Z][a-zA-Z0-9]*)\s+([^>]*?)>/g, (_m, tag: string, attrs: string) => {
    // Preserve mailto/tel/http links
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    const titleMatch = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i);
    const altMatch = attrs.match(/\balt\s*=\s*["']([^"']+)["']/i);
    const parts: string[] = [];
    if (hrefMatch) parts.push(`href="${hrefMatch[1]}"`);
    if (titleMatch) parts.push(`title="${titleMatch[1]}"`);
    if (altMatch) parts.push(`alt="${altMatch[1]}"`);
    return parts.length > 0 ? `<${tag} ${parts.join(' ')}>` : `<${tag}>`;
  });
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Hard cap — never send more than ~60KB to the LLM
  if (s.length > 60_000) s = s.slice(0, 60_000);
  return s;
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

// ─── LLM extraction ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You extract staff/faculty contacts from a university or company website HTML fragment.

Return ONLY a JSON array (no prose) of objects with these fields:
  firstName (required, non-empty string)
  lastName (string or null)
  title (string or null — e.g. "Director of Admissions", "Associate Professor")
  email (string or null — must contain '@'; otherwise null)
  phone (string or null — digits/parens/dashes OK, strip URL/mailto wrappers)
  linkedinUrl (string or null — only if it's a linkedin.com/in/ URL, else null)

Rules:
 - Only include people. Reject generic links like "Click here", "Our Team", "Contact Us", "News".
 - Each person MUST have firstName plus at least one of: lastName, title, email, or linkedinUrl. Drop otherwise.
 - Prefer individual staff cards over departmental / phone-book entries.
 - If the page clearly isn't a staff listing (e.g. a news article, search form, 404, login page), return [].
 - Return [] if you're not confident. Zero false positives > many noisy hits.
 - Never invent data. If a field isn't on the page, use null.
 - Max 200 people per page.
 - Output must be valid JSON parsable with JSON.parse. No markdown fences, no commentary.`;

async function extractWithLlm(
  url: string,
  strippedHtml: string,
  companyName: string,
): Promise<{ contacts: LlmContact[]; tokensIn: number; tokensOut: number; error: string | null }> {
  const userMessage = `Company: ${companyName}\nPage URL: ${url}\n\nHTML fragment:\n${strippedHtml}`;
  try {
    const res = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 4096,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const tokensIn = (res.usage.input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0);
    const tokensOut = res.usage.output_tokens ?? 0;

    // Parse — be forgiving of stray prose
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return { contacts: [], tokensIn, tokensOut, error: 'llm-non-json' };
      parsed = JSON.parse(match[0]);
    }
    if (!Array.isArray(parsed)) return { contacts: [], tokensIn, tokensOut, error: 'llm-not-array' };

    const contacts: LlmContact[] = [];
    for (const raw of parsed as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const fn = typeof r.firstName === 'string' ? r.firstName.trim() : '';
      if (!fn) continue;
      const ln = typeof r.lastName === 'string' && r.lastName.trim() ? r.lastName.trim() : null;
      const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null;
      let email = typeof r.email === 'string' && r.email.trim() ? r.email.trim() : null;
      if (email && !email.includes('@')) email = null;
      const phone = typeof r.phone === 'string' && r.phone.trim() ? r.phone.trim() : null;
      let linkedinUrl = typeof r.linkedinUrl === 'string' && r.linkedinUrl.trim() ? r.linkedinUrl.trim() : null;
      if (linkedinUrl && !/linkedin\.com\/in\//i.test(linkedinUrl)) linkedinUrl = null;
      // Require firstName + at least one other identifying field
      if (!ln && !title && !email && !linkedinUrl) continue;
      contacts.push({ firstName: fn, lastName: ln, title, email, phone, linkedinUrl });
    }
    return { contacts, tokensIn, tokensOut, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Abort loudly on auth / credit / rate issues — otherwise the scraper
    // silently produces 0 hits for every company while still running.
    if (/credit balance is too low|invalid_api_key|invalid x-api-key|authentication_error|permission_error|overloaded_error/i.test(msg)) {
      throw new Error(`FATAL_LLM_ERROR: ${msg}`);
    }
    return { contacts: [], tokensIn: 0, tokensOut: 0, error: msg };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function run() {
  const { db } = await import('../lib/db');
  const { users, clients, crmCompanies, crmContacts } = await import('../lib/db/schema');
  const { eq, and, or, isNotNull, ne, inArray, sql } = await import('drizzle-orm');

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

  if (MAX_EXISTING_CONTACTS !== undefined) {
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
  console.log(`${pool.length} companies in scope (limit=${LIMIT ?? 'none'}). Concurrency=${CONCURRENCY}. Model=${MODEL_ID}.`);

  // Preload existing emails per company
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

  // Launch browser once
  console.log('Launching Chromium...');
  const browser: Browser = await chromium.launch({ headless: true });
  const UA = 'Mozilla/5.0 (compatible; PostCaptainDirectoryScraper/2.0-playwright; +https://postcaptain.com)';

  async function fetchRendered(context: BrowserContext, url: string): Promise<{ ok: boolean; finalUrl: string; html: string; status: number | null }> {
    const page: Page = await context.newPage();
    let status: number | null = null;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      status = resp?.status() ?? null;
      // Give JS a brief window to hydrate, but don't wait forever
      try { await page.waitForLoadState('networkidle', { timeout: Math.min(TIMEOUT_MS, 8000) }); } catch { /* noop */ }
      const finalUrl = page.url();
      const html = await page.content();
      const ok = (status ?? 0) >= 200 && (status ?? 0) < 400;
      return { ok, finalUrl, html, status };
    } catch (err) {
      void err;
      return { ok: false, finalUrl: url, html: '', status };
    } finally {
      await page.close().catch(() => { /* noop */ });
    }
  }

  // Direct-fetch sitemap.xml (doesn't need playwright — static XML). Returns
  // a ranked list of same-origin URLs that look like staff/leadership pages.
  const SITEMAP_KEYWORD_SCORES: Array<{ re: RegExp; score: number }> = [
    { re: /\/(staff|faculty)[-_]?directory/i, score: 100 },
    { re: /\/directory(?:\b|\/|\.)/i, score: 80 },
    { re: /\/(leadership|administration)(?:\b|\/|\.)/i, score: 70 },
    { re: /\/faculty(?:\b|\/|\.)/i, score: 60 },
    { re: /\/staff(?:\b|\/|\.)/i, score: 60 },
    { re: /\/people(?:\b|\/|\.)/i, score: 55 },
    { re: /\/(our-team|team|meet-the-team)(?:\b|\/|\.)/i, score: 45 },
    { re: /\/about\/(staff|people|team|leadership|directory|faculty|administration)/i, score: 65 },
    { re: /\/academics\/faculty/i, score: 60 },
  ];
  async function discoverFromSitemap(origin: string): Promise<string[]> {
    const candidates = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
    const hits = new Map<string, number>();
    const visited = new Set<string>();
    async function pull(url: string, depth: number) {
      if (visited.has(url) || depth > 2) return;
      visited.add(url);
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, 10_000)), headers: { 'User-Agent': UA } });
        if (!res.ok) return;
        const xml = await res.text();
        // Recurse into nested sitemaps (sitemapindex)
        const nested = [...xml.matchAll(/<loc>\s*([^<]+?\.xml[^<]*)\s*<\/loc>/gi)].map((m) => m[1].trim());
        for (const n of nested) {
          try {
            const u = new URL(n, url).toString();
            if (new URL(u).origin === origin) await pull(u, depth + 1);
          } catch { /* noop */ }
        }
        // Score URL entries
        const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim()).filter((u) => !u.endsWith('.xml'));
        for (const loc of locs) {
          let u: URL;
          try { u = new URL(loc, url); } catch { continue; }
          if (u.origin !== origin) continue;
          const path = u.pathname;
          if (path.split('/').filter(Boolean).some((seg) => seg.split('-').length >= 4)) continue; // deep slug = bio/news
          if (/\/(news|blog|press|events|story|stories|articles?|posts?|tags?|category|categories|archive|\d{4}\/\d{2})\//i.test(path)) continue;
          let score = 0;
          for (const k of SITEMAP_KEYWORD_SCORES) if (k.re.test(path)) score = Math.max(score, k.score);
          if (score === 0) continue;
          const norm = u.toString().replace(/#.*$/, '');
          hits.set(norm, Math.max(hits.get(norm) ?? 0, score));
        }
      } catch { /* noop */ }
    }
    for (const path of candidates) await pull(origin + path, 0);
    return [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u]) => u);
  }

  // Each worker gets its own context so cookies don't cross-pollinate
  const contexts: BrowserContext[] = [];
  for (let i = 0; i < CONCURRENCY; i += 1) {
    contexts.push(await browser.newContext({ userAgent: UA, javaScriptEnabled: true, viewport: { width: 1280, height: 800 } }));
  }

  let done = 0;
  const started = Date.now();
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  const results: CompanyResult[] = await mapWithConcurrency(pool, CONCURRENCY, async (t, idx) => {
    const context = contexts[idx % contexts.length];
    const out: CompanyResult = {
      companyId: t.row.id, companyName: t.row.name, homepageUrl: t.url,
      homepageOk: false, pickedUrls: [], scraped: [], inserted: 0, skippedExisting: 0,
      tokensIn: 0, tokensOut: 0, error: null,
    };
    try {
      const home = await fetchRendered(context, t.url);
      out.homepageOk = home.ok;
      if (!home.ok) return finish();

      const scored = findDirectoryCandidates(home.html, home.finalUrl, MAX_CANDIDATES * 2);
      const baseHost = new URL(home.finalUrl).origin;
      const homepageUrls = scored.map((s) => s.url).slice(0, MAX_CANDIDATES);
      const sitemapUrls = await discoverFromSitemap(baseHost);
      // Merge: prefer homepage-linked, then sitemap-derived, then guessed.
      // Cap total candidates so a single company can't balloon cost/time.
      const CANDIDATE_CAP = MAX_CANDIDATES + 3;
      const candidateUrls: string[] = [];
      for (const u of [...homepageUrls, ...sitemapUrls]) {
        if (candidateUrls.length >= CANDIDATE_CAP) break;
        if (!candidateUrls.includes(u)) candidateUrls.push(u);
      }
      const guessUrls = GUESSED_DIRECTORY_PATHS.map((p) => baseHost + p).filter((u) => !candidateUrls.includes(u));

      const seen = new Map<string, LlmContact>();
      const tryUrl = async (url: string) => {
        const r = await fetchRendered(context, url);
        if (!r.ok) return 0;
        const stripped = stripHtmlForLlm(r.html);
        if (stripped.length < 200) return 0;
        const { contacts, tokensIn, tokensOut, error } = await extractWithLlm(r.finalUrl, stripped, t.row.name);
        out.tokensIn += tokensIn;
        out.tokensOut += tokensOut;
        if (error) return 0;
        let added = 0;
        for (const c of contacts) {
          const key = c.email ? `e:${c.email.toLowerCase()}` : `n:${c.firstName.toLowerCase()} ${(c.lastName ?? '').toLowerCase()}`.trim();
          if (!seen.has(key)) { seen.set(key, c); added += 1; }
        }
        if (added > 0) out.pickedUrls.push(url);
        return contacts.length;
      };

      for (const url of candidateUrls) {
        await tryUrl(url);
        if (seen.size >= 200) break;
      }
      if (seen.size === 0) {
        for (const url of guessUrls) {
          const n = await tryUrl(url);
          if (n > 0 || seen.size >= 200) break;
        }
      }
      out.scraped = [...seen.values()];

      // Insert or preview
      const existing = existingEmails.get(t.row.id) ?? new Set<string>();
      const toInsert = out.scraped.filter((c) => {
        if (!c.email) return true;
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
      totalTokensIn += out.tokensIn;
      totalTokensOut += out.tokensOut;
      if (done % 25 === 0 || done === pool.length || VERBOSE) {
        const pct = ((done / pool.length) * 100).toFixed(0);
        const tag = `[${done}/${pool.length} ${pct}%]`;
        if (VERBOSE) {
          console.log(`${tag} ${out.companyName} → ${out.scraped.length} contacts (insert=${out.inserted}, skip=${out.skippedExisting}) via ${out.pickedUrls[0] ?? 'no candidate hit'}${out.error ? ` ERR=${out.error}` : ''}`);
        } else {
          console.log(`${tag} processed (running total: ${totalTokensIn} in / ${totalTokensOut} out tokens)`);
        }
      }
      return out;
    }
  });

  // Cleanup
  for (const ctx of contexts) { await ctx.close().catch(() => { /* noop */ }); }
  await browser.close().catch(() => { /* noop */ });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nScrape finished in ${elapsed}s.`);

  // CSV
  const outDir = path.join('scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = OUT_ARG ?? path.join(outDir, `staff-playwright-client${clientId}-${ts}.csv`);
  const lines = ['company_id,company_name,picked_url,first_name,last_name,email,phone,title,linkedin'];
  for (const r of results) {
    if (r.scraped.length === 0) continue;
    for (const c of r.scraped) {
      lines.push([
        r.companyId, csvEscape(r.companyName), csvEscape(r.pickedUrls[0] ?? ''),
        csvEscape(c.firstName), csvEscape(c.lastName), csvEscape(c.email),
        csvEscape(c.phone), csvEscape(c.title), csvEscape(c.linkedinUrl),
      ].join(','));
    }
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length - 1} contact rows to ${outPath}`);

  const reachable = results.filter((r) => r.homepageOk).length;
  const withScraped = results.filter((r) => r.scraped.length > 0).length;
  const totalContacts = results.reduce((a, r) => a + r.scraped.length, 0);
  const totalInserted = results.reduce((a, r) => a + r.inserted, 0);
  const totalSkipped = results.reduce((a, r) => a + r.skippedExisting, 0);
  const errs = results.filter((r) => r.error).length;

  console.log('\n── Summary ──');
  console.log(`Companies processed:           ${results.length}`);
  console.log(`Homepages reachable:           ${reachable}`);
  console.log(`Companies w/ extracted people: ${withScraped}`);
  console.log(`Total contacts extracted:      ${totalContacts}`);
  console.log(`${INSERT ? 'Inserted into CRM' : 'Would insert'}:           ${totalInserted}`);
  console.log(`Skipped (email already in CRM):${totalSkipped}`);
  console.log(`Hard errors (per-company):     ${errs}`);
  console.log(`LLM tokens (in / out):         ${totalTokensIn} / ${totalTokensOut}`);

  if (DRY_RUN) {
    console.log('\n── Sample (first 8 companies w/ contacts) ──');
    for (const r of results.filter((x) => x.scraped.length > 0).slice(0, 8)) {
      console.log(`\n[${r.companyId}] ${r.companyName} — ${r.pickedUrls[0] ?? '—'}`);
      for (const c of r.scraped.slice(0, 5)) {
        console.log(`  ${c.firstName} ${c.lastName ?? ''}${c.title ? ' · ' + c.title : ''}${c.email ? ' · ' + c.email : ''}${c.phone ? ' · ' + c.phone : ''}${c.linkedinUrl ? ' · ' + c.linkedinUrl : ''}`);
      }
      if (r.scraped.length > 5) console.log(`  …and ${r.scraped.length - 5} more`);
    }
  }

  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
