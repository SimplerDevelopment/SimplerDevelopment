import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return undefined;
  const a = args[i];
  if (a.includes('=')) return a.split('=')[1];
  return args[i + 1];
}
function hasFlag(name: string): boolean {
  return args.some(a => a === `--${name}` || a.startsWith(`--${name}=`));
}
const LIMIT = flagValue('limit') ? parseInt(flagValue('limit')!, 10) : undefined;
const FORCE = hasFlag('force');
const DRY_RUN = hasFlag('dry-run');
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PC_USER_EMAIL = 'postcaptain@simplerdevelopment.com';
const USER_AGENT =
  'Mozilla/5.0 (compatible; SimplerDevLogoScraper/1.0; +https://simplerdevelopment.com)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number; maxBytes?: number } = {}
): Promise<{ ok: boolean; status: number; finalUrl: string; body?: ArrayBuffer; contentType?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        ...(init.headers ?? {}),
      },
    });
    const finalUrl = res.url || url;
    const ct = res.headers.get('content-type') ?? undefined;
    if (!res.ok) {
      return { ok: false, status: res.status, finalUrl, contentType: ct };
    }
    // Cap body size to avoid huge downloads
    const reader = res.body?.getReader();
    if (!reader) {
      const buf = await res.arrayBuffer();
      return { ok: true, status: res.status, finalUrl, body: buf, contentType: ct };
    }
    const max = init.maxBytes ?? MAX_IMAGE_BYTES;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > max) {
          try { reader.cancel(); } catch {}
          return { ok: false, status: 413, finalUrl, contentType: ct };
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    return { ok: true, status: res.status, finalUrl, body: merged.buffer, contentType: ct };
  } catch {
    return { ok: false, status: 0, finalUrl: url };
  } finally {
    clearTimeout(t);
  }
}

function normalizeWebsite(raw: string): string | null {
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

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function parseSizes(sizes: string | null | undefined): number {
  if (!sizes) return 0;
  // e.g. "180x180" or "192x192 144x144"
  let max = 0;
  for (const part of sizes.split(/\s+/)) {
    const m = part.match(/(\d+)x(\d+)/i);
    if (m) {
      const n = Math.max(parseInt(m[1], 10), parseInt(m[2], 10));
      if (n > max) max = n;
    } else if (/^any$/i.test(part)) {
      max = Math.max(max, 1024);
    }
  }
  return max;
}

interface CandidateLogo {
  url: string;
  source: string;
  priority: number; // lower = better
  size?: number;
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? null;
}

function extractCandidates(html: string, finalUrl: string): CandidateLogo[] {
  const candidates: CandidateLogo[] = [];

  // Extract <head> (case-insensitive, optional)
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : html;

  // 1) <link rel="apple-touch-icon[ -precomposed]" ...>
  const linkRe = /<link\b[^>]*>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(headHtml)) !== null) {
    const tag = lm[0];
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href) continue;
    const abs = resolveUrl(finalUrl, href);
    if (!abs) continue;
    const sizes = parseSizes(attr(tag, 'sizes'));
    if (rel.includes('apple-touch-icon')) {
      candidates.push({ url: abs, source: 'apple-touch-icon', priority: 1, size: sizes });
    } else if (rel.includes('shortcut') || rel === 'icon' || rel.includes('icon')) {
      // Skip mask-icon (SVG mask, often single-color)
      if (rel.includes('mask-icon')) continue;
      candidates.push({ url: abs, source: 'icon', priority: 3, size: sizes });
    }
  }

  // 2) <meta property="og:image" content="...">
  const metaRe = /<meta\b[^>]*>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = metaRe.exec(headHtml)) !== null) {
    const tag = mm[0];
    const property = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    if (property === 'og:image' || property === 'og:image:url' || property === 'twitter:image') {
      const content = attr(tag, 'content');
      if (!content) continue;
      const abs = resolveUrl(finalUrl, content);
      if (!abs) continue;
      candidates.push({ url: abs, source: property, priority: 2 });
    }
  }

  // 4) First <img> inside <header> or <nav>
  const headerNavRe = /<(header|nav)[^>]*>([\s\S]*?)<\/\1>/gi;
  let hn: RegExpExecArray | null;
  while ((hn = headerNavRe.exec(html)) !== null) {
    const inner = hn[2];
    const imgM = inner.match(/<img\b[^>]*>/i);
    if (imgM) {
      const src = attr(imgM[0], 'src') ?? attr(imgM[0], 'data-src');
      if (src) {
        const abs = resolveUrl(finalUrl, src);
        if (abs) {
          candidates.push({ url: abs, source: `${hn[1].toLowerCase()}-img`, priority: 4 });
          break;
        }
      }
    }
  }

  return candidates;
}

function pickBest(candidates: CandidateLogo[], rootHost: string): CandidateLogo[] {
  // Sort by priority asc, then size desc
  const sorted = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.size ?? 0) - (a.size ?? 0);
  });
  // Always append favicon.ico fallback
  sorted.push({
    url: `https://${rootHost}/favicon.ico`,
    source: 'favicon.ico',
    priority: 5,
  });
  return sorted;
}

function extFromMimeOrUrl(mime: string | undefined, url: string): string {
  if (mime) {
    const m = mime.split(';')[0].trim().toLowerCase();
    if (m === 'image/png') return 'png';
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    if (m === 'image/gif') return 'gif';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/svg+xml') return 'svg';
    if (m === 'image/x-icon' || m === 'image/vnd.microsoft.icon') return 'ico';
    if (m === 'image/avif') return 'avif';
  }
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})(?:$|\?|#)/);
    if (m) return m[1];
  } catch {}
  return 'img';
}

function isImageMime(mime: string | undefined): boolean {
  if (!mime) return false;
  const m = mime.split(';')[0].trim().toLowerCase();
  return m.startsWith('image/');
}

// ─── Concurrency utility ──────────────────────────────────────────────────────
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => loop());
  await Promise.all(workers);
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { db } = await import('../lib/db');
  const { users, clients, crmCompanies } = await import('../lib/db/schema');
  const { uploadToS3 } = await import('../lib/s3/upload');
  const { eq, and, isNotNull, isNull, ne } = await import('drizzle-orm');

  // 1) Resolve client by user email
  const [user] = await db.select().from(users).where(eq(users.email, PC_USER_EMAIL)).limit(1);
  if (!user) {
    console.error(`No user found for email ${PC_USER_EMAIL}`);
    process.exit(1);
  }
  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    console.error(`No client found for user ${user.id}`);
    process.exit(1);
  }
  console.log(`Using clientId=${client.id} (${client.company ?? ''})`);

  // 2) Load companies with non-empty website
  const conditions = [
    eq(crmCompanies.clientId, client.id),
    isNotNull(crmCompanies.website),
    ne(crmCompanies.website, ''),
  ];
  if (!FORCE) {
    conditions.push(isNull(crmCompanies.logoUrl));
  }
  let companies = await db
    .select({
      id: crmCompanies.id,
      name: crmCompanies.name,
      website: crmCompanies.website,
      logoUrl: crmCompanies.logoUrl,
    })
    .from(crmCompanies)
    .where(and(...conditions));

  if (LIMIT && LIMIT > 0) companies = companies.slice(0, LIMIT);

  console.log(
    `Processing ${companies.length} companies (force=${FORCE}, dryRun=${DRY_RUN}, limit=${LIMIT ?? 'none'})`
  );

  let picked = 0;
  let downloaded = 0;
  let uploaded = 0;
  let skipped = 0;
  let errored = 0;
  let processed = 0;

  const totalCount = companies.length;

  await runWithConcurrency(companies, CONCURRENCY, async (co) => {
    processed++;
    const tag = `[${processed}/${totalCount}] #${co.id} ${co.name}`;
    try {
      const normalized = normalizeWebsite(co.website || '');
      if (!normalized) {
        skipped++;
        console.log(`${tag} SKIP (no valid website)`);
        return;
      }

      // Fetch homepage HTML
      const home = await fetchWithTimeout(normalized, { maxBytes: 5 * 1024 * 1024 });
      if (!home.ok || !home.body) {
        // Try favicon directly
        const host = (() => { try { return new URL(normalized).host; } catch { return ''; }})();
        if (!host) { errored++; console.log(`${tag} ERROR (bad URL)`); return; }
        const favCandidate: CandidateLogo = {
          url: `https://${host}/favicon.ico`,
          source: 'favicon.ico',
          priority: 5,
        };
        const result = await tryDownloadAndUpload(co.id, [favCandidate], tag);
        if (result === 'uploaded') uploaded++;
        if (result === 'downloaded-only') downloaded++;
        if (result === 'errored') errored++;
        if (result === 'skipped') skipped++;
        return;
      }

      const html = new TextDecoder('utf-8', { fatal: false }).decode(home.body);
      const candidates = extractCandidates(html, home.finalUrl);
      let rootHost = '';
      try { rootHost = new URL(home.finalUrl).host; } catch {}
      const ranked = pickBest(candidates, rootHost);
      if (ranked.length === 0) {
        skipped++;
        console.log(`${tag} SKIP (no candidates)`);
        return;
      }
      picked++;

      const result = await tryDownloadAndUpload(co.id, ranked, tag);
      if (result === 'uploaded') uploaded++;
      if (result === 'downloaded-only') downloaded++;
      if (result === 'errored') errored++;
      if (result === 'skipped') skipped++;
    } catch (e) {
      errored++;
      console.log(`${tag} ERROR ${(e as Error).message}`);
    }
  });

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({ total: totalCount, picked, downloaded, uploaded, skipped, errored }, null, 2));

  process.exit(0);

  // Inner helper closure (uses imports from outer scope)
  async function tryDownloadAndUpload(
    companyId: number,
    candidates: CandidateLogo[],
    tag: string
  ): Promise<'uploaded' | 'downloaded-only' | 'errored' | 'skipped'> {
    for (const cand of candidates) {
      const dl = await fetchWithTimeout(cand.url, { maxBytes: MAX_IMAGE_BYTES });
      if (!dl.ok || !dl.body) continue;
      if (!isImageMime(dl.contentType) && !cand.url.toLowerCase().endsWith('.ico')) {
        // For og:image we strictly require an image; but accept .ico
        if (cand.source !== 'favicon.ico') continue;
      }
      const ext = extFromMimeOrUrl(dl.contentType, cand.url);
      const buf = Buffer.from(new Uint8Array(dl.body));
      console.log(`${tag} picked ${cand.source} (${buf.length}B ${dl.contentType ?? '?'}) ${cand.url}`);

      if (DRY_RUN) {
        return 'downloaded-only';
      }

      try {
        const filename = `company-${companyId}-logo.${ext}`;
        const upload = await uploadToS3(
          buf,
          filename,
          dl.contentType?.split(';')[0].trim() || `image/${ext === 'jpg' ? 'jpeg' : ext}`
        );
        await db
          .update(crmCompanies)
          .set({ logoUrl: upload.url, updatedAt: new Date() })
          .where(eq(crmCompanies.id, companyId));
        return 'uploaded';
      } catch (e) {
        console.log(`${tag} upload-failed ${(e as Error).message}`);
        return 'errored';
      }
    }
    console.log(`${tag} SKIP (no usable candidate)`);
    return 'skipped';
  }
}

main().catch(err => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
