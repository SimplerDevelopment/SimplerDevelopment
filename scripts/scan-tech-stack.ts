/**
 * One-time "Built With" report for companies in a client's CRM.
 *
 * Fetches each company's homepage once and fingerprints the response (HTML +
 * headers) against a panel of technologies relevant to higher-ed marketing:
 *
 *   - Higher-ed CRMs:   Slate (Technolutions), Element451, EnrollmentRX,
 *                       TargetX, Liaison/SlideRoom, Salesforce Education Cloud
 *   - CMS:              WordPress, Drupal, Squarespace, Wix, Webflow, Shopify,
 *                       Ghost, Modern Campus / OmniUpdate, Finalsite, Cascade,
 *                       HubSpot CMS
 *   - Frameworks:       Next.js, Gatsby, Nuxt, React, Vue, Angular
 *   - Marketing/Email:  HubSpot, Marketo, Pardot, Mailchimp, Mailgun
 *   - Analytics:        GA4 / Universal Analytics, Google Tag Manager,
 *                       Meta Pixel, Hotjar, Segment
 *   - Chat:             Intercom, Drift, Zendesk, Tawk
 *   - Hosting / CDN:    Cloudflare, Vercel, Netlify, Akamai, CloudFront, Fastly
 *
 * Output: a wide CSV (one row per company, one boolean column per tech) plus
 * an aggregate summary CSV (tech → company count) and a console digest.
 *
 * Flags:
 *   --email <email>     Resolve clientId via user email (default: postcaptain@simplerdevelopment.com)
 *   --client-id <n>     Override: scan this clientId directly
 *   --limit <n>         Only process the first N companies
 *   --concurrency <n>   Parallel fetches (default 8)
 *   --timeout <ms>      Per-request timeout (default 12000)
 *   --probe-wp          On sites that look empty / SPA, also probe /wp-json/ to
 *                       confirm WordPress (extra request per ambiguous site)
 *   --dry-run           List companies that would be scanned, no HTTP
 *   --out <path>        CSV output path (default scripts/output/tech-stack-<ts>.csv)
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
const PROBE_WP = args.includes('--probe-wp');
const EMAIL = argVal('--email', 'postcaptain@simplerdevelopment.com')!;
const CLIENT_ID_ARG = argVal('--client-id');
const LIMIT = argVal('--limit') ? parseInt(argVal('--limit')!, 10) : undefined;
const CONCURRENCY = parseInt(argVal('--concurrency', '8')!, 10);
const TIMEOUT_MS = parseInt(argVal('--timeout', '12000')!, 10);
const OUT_ARG = argVal('--out');

// ── Fingerprint definitions ────────────────────────────────────────────────
type HeaderRule = { name: string; re: RegExp };
interface TechFingerprint {
  id: string;
  name: string;
  category:
    | 'higher-ed-crm'
    | 'cms'
    | 'framework'
    | 'marketing'
    | 'analytics'
    | 'chat'
    | 'hosting';
  html?: RegExp[];
  headers?: HeaderRule[];
}

const TECH: TechFingerprint[] = [
  // ── Higher-ed CRMs ───────────────────────────────────────────────────────
  {
    id: 'slate',
    name: 'Slate (Technolutions)',
    category: 'higher-ed-crm',
    html: [
      /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\/ping(?:\?[^"']*)?["']/i,
      /technolutions(?:\.net)?/i,
      /https?:\/\/(apply|go|slate)\.[a-z0-9.-]+/i,
    ],
  },
  {
    id: 'element451',
    name: 'Element451',
    category: 'higher-ed-crm',
    html: [/element451/i, /app\.element451\.com/i],
  },
  {
    id: 'enrollmentrx',
    name: 'EnrollmentRx',
    category: 'higher-ed-crm',
    html: [/enrollmentrx/i],
  },
  {
    id: 'targetx',
    name: 'TargetX',
    category: 'higher-ed-crm',
    html: [/targetx\.com/i, /targetx-/i],
  },
  {
    id: 'liaison',
    name: 'Liaison / SlideRoom',
    category: 'higher-ed-crm',
    html: [/liaisonedu\.com/i, /slideroom\.com/i, /slate\.io/i],
  },
  {
    id: 'sf-edu',
    name: 'Salesforce Education Cloud',
    category: 'higher-ed-crm',
    html: [
      /force\.com/i,
      /salesforce\.com\/services/i,
      /education-cloud/i,
    ],
  },

  // ── CMS ──────────────────────────────────────────────────────────────────
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'cms',
    html: [
      /\/wp-content\//i,
      /\/wp-includes\//i,
      /\/wp-json\b/i,
      /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["'][^"']*WordPress/i,
      /wp-emoji-release\.min\.js/i,
    ],
    headers: [
      { name: 'x-pingback', re: /xmlrpc\.php/i },
      { name: 'link', re: /wp-json/i },
    ],
  },
  {
    id: 'drupal',
    name: 'Drupal',
    category: 'cms',
    html: [
      /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["'][^"']*Drupal/i,
      /\/sites\/default\/files\//i,
      /\/core\/misc\//i,
      /Drupal\.settings/i,
    ],
    headers: [
      { name: 'x-drupal-cache', re: /./ },
      { name: 'x-generator', re: /Drupal/i },
    ],
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    category: 'cms',
    html: [
      /static1\.squarespace\.com/i,
      /Squarespace\.SQUARESPACE_CONTEXT/i,
      /squarespace-cdn\.com/i,
    ],
    headers: [{ name: 'server', re: /Squarespace/i }],
  },
  {
    id: 'wix',
    name: 'Wix',
    category: 'cms',
    html: [/static\.wixstatic\.com/i, /_wixCIDX/i, /wix-image/i],
    headers: [{ name: 'x-wix-request-id', re: /./ }],
  },
  {
    id: 'webflow',
    name: 'Webflow',
    category: 'cms',
    html: [
      /webflow\.com/i,
      /\bdata-wf-(?:page|site)\b/i,
      /\bw-nav\b|\bw-richtext\b/i,
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'cms',
    html: [/cdn\.shopify\.com/i, /Shopify\.shop/i, /shopify-section/i],
    headers: [{ name: 'x-shopify-stage', re: /./ }, { name: 'x-shopid', re: /./ }],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    category: 'cms',
    html: [
      /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["'][^"']*Ghost/i,
      /ghost-portal/i,
    ],
  },
  {
    id: 'omniupdate',
    name: 'Modern Campus (OmniUpdate)',
    category: 'cms',
    html: [/omniupdate/i, /\/_resources\//i, /moderncampus\.com/i],
  },
  {
    id: 'finalsite',
    name: 'Finalsite',
    category: 'cms',
    html: [/finalsite\.com/i, /fs-content/i, /\bfsBoardElement\b/i],
  },
  {
    id: 'cascade',
    name: 'Hannon Hill Cascade',
    category: 'cms',
    html: [/cascadecms/i, /cascadeserver/i],
  },
  {
    id: 'hubspot-cms',
    name: 'HubSpot CMS',
    category: 'cms',
    html: [/hs-sites\.com/i, /\/hubfs\//i, /cdn2\.hubspot\.net/i],
  },

  // ── Frameworks ───────────────────────────────────────────────────────────
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'framework',
    html: [/__NEXT_DATA__/i, /\/_next\/static\//i],
  },
  {
    id: 'gatsby',
    name: 'Gatsby',
    category: 'framework',
    html: [/___gatsby/i, /gatsby-image/i, /\/page-data\//i],
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'framework',
    html: [/__NUXT__/i, /\/_nuxt\//i],
  },
  {
    id: 'react',
    name: 'React',
    category: 'framework',
    html: [/data-reactroot/i, /react-dom/i, /\b_reactRoot\$/i],
  },
  {
    id: 'vue',
    name: 'Vue',
    category: 'framework',
    html: [/\bdata-v-[a-f0-9]{8}\b/i, /vue\.runtime/i],
  },
  {
    id: 'angular',
    name: 'Angular',
    category: 'framework',
    html: [/\bng-version\s*=/i, /angular\.min\.js/i],
  },

  // ── Marketing / Email ────────────────────────────────────────────────────
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'marketing',
    html: [/js\.hs-scripts\.com/i, /js\.hsforms\.net/i, /_hsq\s*=/i],
  },
  {
    id: 'marketo',
    name: 'Marketo',
    category: 'marketing',
    html: [/munchkin\.marketo\.net/i, /MktoForms2/i],
  },
  {
    id: 'pardot',
    name: 'Salesforce Pardot',
    category: 'marketing',
    html: [/pi\.pardot\.com/i, /pardot/i],
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'marketing',
    html: [/list-manage\.com/i, /mc\.us\d+\.list-manage/i, /mailchimp/i],
  },
  {
    id: 'mailgun',
    name: 'Mailgun',
    category: 'marketing',
    html: [/mailgun\.org/i, /mailgun\.net/i],
  },

  // ── Analytics ────────────────────────────────────────────────────────────
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    category: 'analytics',
    html: [/googletagmanager\.com\/gtm\.js/i, /\bGTM-[A-Z0-9]+/],
  },
  {
    id: 'ga',
    name: 'Google Analytics',
    category: 'analytics',
    html: [
      /www\.google-analytics\.com/i,
      /googletagmanager\.com\/gtag\/js/i,
      /\bgtag\(\s*['"]config['"]/i,
      /\bUA-\d{4,}-\d/,
      /\bG-[A-Z0-9]{6,}/,
    ],
  },
  {
    id: 'meta-pixel',
    name: 'Meta Pixel',
    category: 'analytics',
    html: [/connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i, /\bfbq\(\s*['"]init['"]/i],
  },
  {
    id: 'hotjar',
    name: 'Hotjar',
    category: 'analytics',
    html: [/static\.hotjar\.com/i, /\bhjid\b/i],
  },
  {
    id: 'segment',
    name: 'Segment',
    category: 'analytics',
    html: [/cdn\.segment\.com/i, /analytics\.load\(/i],
  },

  // ── Chat ─────────────────────────────────────────────────────────────────
  {
    id: 'intercom',
    name: 'Intercom',
    category: 'chat',
    html: [/widget\.intercom\.io/i, /intercomSettings/i],
  },
  {
    id: 'drift',
    name: 'Drift',
    category: 'chat',
    html: [/js\.driftt\.com/i, /\bdrift\.com/i],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    category: 'chat',
    html: [/static\.zdassets\.com/i, /zopim\.com/i, /zendesk\.com/i],
  },
  {
    id: 'tawk',
    name: 'Tawk.to',
    category: 'chat',
    html: [/embed\.tawk\.to/i],
  },

  // ── Hosting / CDN (mostly headers) ───────────────────────────────────────
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    category: 'hosting',
    headers: [{ name: 'cf-ray', re: /./ }, { name: 'server', re: /cloudflare/i }],
    html: [/\/cdn-cgi\//i],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'hosting',
    headers: [
      { name: 'x-vercel-id', re: /./ },
      { name: 'server', re: /Vercel/i },
    ],
  },
  {
    id: 'netlify',
    name: 'Netlify',
    category: 'hosting',
    headers: [
      { name: 'x-nf-request-id', re: /./ },
      { name: 'server', re: /Netlify/i },
    ],
  },
  {
    id: 'cloudfront',
    name: 'AWS CloudFront',
    category: 'hosting',
    headers: [{ name: 'x-amz-cf-id', re: /./ }, { name: 'via', re: /CloudFront/i }],
  },
  {
    id: 'akamai',
    name: 'Akamai',
    category: 'hosting',
    headers: [{ name: 'server', re: /AkamaiGHost|AkamaiNetStorage/i }, { name: 'x-akamai-transformed', re: /./ }],
  },
  {
    id: 'fastly',
    name: 'Fastly',
    category: 'hosting',
    headers: [{ name: 'x-served-by', re: /cache-/i }, { name: 'x-fastly-request-id', re: /./ }],
  },
];

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
  serverHeader: string | null;
  poweredBy: string | null;
  generator: string | null;
  htmlBytes: number;
  error: string | null;
  detected: Set<string>; // tech ids
  wpProbe: { tried: boolean; confirmed: boolean };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<{
  status: number;
  finalUrl: string;
  body: string;
  headers: Headers;
}> {
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
    return { status: res.status, finalUrl: res.url, body, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

function extractGeneratorMeta(html: string): string | null {
  const m = html.match(
    /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/i,
  );
  return m ? m[1] : null;
}

function detect(html: string, headers: Headers): Set<string> {
  const hits = new Set<string>();
  for (const t of TECH) {
    let matched = false;
    if (t.html) {
      for (const re of t.html) {
        if (re.test(html)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched && t.headers) {
      for (const h of t.headers) {
        const v = headers.get(h.name);
        if (v && h.re.test(v)) {
          matched = true;
          break;
        }
      }
    }
    if (matched) hits.add(t.id);
  }
  return hits;
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
          and(isNotNull(crmCompanies.domain), ne(crmCompanies.domain, '')),
        ),
      ),
    );

  console.log(`Loaded ${rows.length} companies with website or domain for client ${clientId}.`);

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
  console.log(
    `Scanning ${pool.length} sites with concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms${PROBE_WP ? ', wp-probe ON' : ''}...`,
  );
  const started = Date.now();
  let done = 0;

  const results: ScanResult[] = await mapWithConcurrency(pool, CONCURRENCY, async (t) => {
    const base: ScanResult = {
      companyId: t.row.id,
      companyName: t.row.name,
      url: t.url,
      httpStatus: null,
      finalUrl: null,
      serverHeader: null,
      poweredBy: null,
      generator: null,
      htmlBytes: 0,
      error: null,
      detected: new Set<string>(),
      wpProbe: { tried: false, confirmed: false },
    };
    try {
      const r = await fetchWithTimeout(t.url, TIMEOUT_MS);
      base.httpStatus = r.status;
      base.finalUrl = r.finalUrl;
      base.serverHeader = r.headers.get('server');
      base.poweredBy = r.headers.get('x-powered-by');
      base.htmlBytes = r.body.length;
      base.generator = extractGeneratorMeta(r.body);

      if (r.status >= 200 && r.status < 400) {
        base.detected = detect(r.body, r.headers);

        // Optional WordPress confirmation probe for SPAs / thin homepages
        if (PROBE_WP && !base.detected.has('wordpress') && r.body.length < 8000) {
          try {
            const probeUrl = new URL('/wp-json/', r.finalUrl).toString();
            const p = await fetchWithTimeout(probeUrl, Math.min(TIMEOUT_MS, 6000));
            base.wpProbe.tried = true;
            const ct = p.headers.get('content-type') ?? '';
            if (
              p.status >= 200 &&
              p.status < 300 &&
              /application\/json/i.test(ct) &&
              /\bnamespaces?\b/.test(p.body)
            ) {
              base.detected.add('wordpress');
              base.wpProbe.confirmed = true;
            }
          } catch {
            // probe failure is non-fatal
          }
        }
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

  // ── Write CSVs ────────────────────────────────────────────────────────────
  const outDir = path.join('scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const wideOut =
    OUT_ARG ?? path.join(outDir, `tech-stack-client${clientId}-${ts}.csv`);
  const summaryOut = wideOut.replace(/\.csv$/i, '') + '.summary.csv';

  const fixedCols = [
    'company_id',
    'company_name',
    'scanned_url',
    'final_url',
    'http_status',
    'server',
    'x_powered_by',
    'generator_meta',
    'html_bytes',
    'error',
    'wp_probe_tried',
    'wp_probe_confirmed',
    'detected_count',
    'detected_techs',
  ];
  const techCols = TECH.map((t) => `tech__${t.id}`);
  const header = [...fixedCols, ...techCols];
  const lines: string[] = [header.join(',')];
  for (const r of results) {
    const techVals = TECH.map((t) => (r.detected.has(t.id) ? 'true' : ''));
    lines.push(
      [
        r.companyId,
        csvEscape(r.companyName),
        csvEscape(r.url),
        csvEscape(r.finalUrl),
        r.httpStatus ?? '',
        csvEscape(r.serverHeader),
        csvEscape(r.poweredBy),
        csvEscape(r.generator),
        r.htmlBytes,
        csvEscape(r.error),
        r.wpProbe.tried,
        r.wpProbe.confirmed,
        r.detected.size,
        csvEscape([...r.detected].sort().join('|')),
        ...techVals,
      ].join(','),
    );
  }
  fs.writeFileSync(wideOut, lines.join('\n') + '\n');
  console.log(`Wrote ${results.length} rows to ${wideOut}`);

  // Summary CSV: tech → count
  const counts = new Map<string, number>();
  for (const t of TECH) counts.set(t.id, 0);
  for (const r of results) for (const id of r.detected) counts.set(id, (counts.get(id) ?? 0) + 1);
  const sumLines = ['category,tech_id,tech_name,company_count,share_pct'];
  const denom = Math.max(
    1,
    results.filter((r) => r.httpStatus && r.httpStatus >= 200 && r.httpStatus < 400).length,
  );
  for (const t of TECH) {
    const n = counts.get(t.id) ?? 0;
    sumLines.push(
      [
        t.category,
        t.id,
        csvEscape(t.name),
        n,
        ((n / denom) * 100).toFixed(1),
      ].join(','),
    );
  }
  fs.writeFileSync(summaryOut, sumLines.join('\n') + '\n');
  console.log(`Wrote summary to ${summaryOut}`);

  // ── Console digest ────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.httpStatus && r.httpStatus >= 200 && r.httpStatus < 400);
  const errored = results.filter((r) => r.error);
  console.log('\n── Summary ──');
  console.log(`Reachable sites:                ${ok.length}/${results.length}`);
  console.log(`Errored:                        ${errored.length}`);
  console.log(`Avg techs detected per site:    ${(
    results.reduce((a, r) => a + r.detected.size, 0) / Math.max(1, ok.length)
  ).toFixed(1)}`);

  const byCat = new Map<string, TechFingerprint[]>();
  for (const t of TECH) {
    if (!byCat.has(t.category)) byCat.set(t.category, []);
    byCat.get(t.category)!.push(t);
  }
  for (const [cat, techs] of byCat) {
    console.log(`\n── ${cat} ──`);
    const sorted = [...techs].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
    for (const t of sorted) {
      const n = counts.get(t.id) ?? 0;
      if (n === 0) continue;
      const pct = ((n / denom) * 100).toFixed(1);
      console.log(`  ${t.name.padEnd(34)} ${String(n).padStart(4)}  (${pct}%)`);
    }
  }

  // Notable: WordPress + Slate cohort highlights
  const wpHits = results.filter((r) => r.detected.has('wordpress'));
  const slateHits = results.filter((r) => r.detected.has('slate'));
  console.log('\n── Highlights ──');
  console.log(`WordPress sites: ${wpHits.length}`);
  console.log(`Slate sites:     ${slateHits.length}`);
  if (slateHits.length > 0) {
    console.log('\nSlate (sample):');
    for (const r of slateHits.slice(0, 15)) {
      console.log(`  [${r.companyId}] ${r.companyName} — ${r.finalUrl ?? r.url}`);
    }
    if (slateHits.length > 15) console.log(`  ... ${slateHits.length - 15} more (see CSV)`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
