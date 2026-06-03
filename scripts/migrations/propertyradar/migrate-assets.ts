/**
 * Re-host external PropertyRadar CDN images onto our own S3 and rewrite every
 * reference (branding logos/og + all post content + coverImage/ogImage) so the
 * site no longer hot-links propertyradar.com. Idempotent — a persisted URL map
 * (data/.asset-map.json) lets re-runs skip already-uploaded assets.
 *
 *   PR_WEBSITE_ID=<id> [PR_DATABASE_URL=<prod>] ALLOW_PROD=1 \
 *   npx tsx scripts/migrations/propertyradar/migrate-assets.ts
 *
 * S3 creds come from .env (S3_*). Prod + local share bucket bundled-rack-...,
 * so re-hosted assets resolve from prod too.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const isProd = PROD_INDICATORS.some((p) => DATABASE_URL.includes(p));
if (isProd && process.env.ALLOW_PROD !== '1') { console.error('REFUSING: prod host without ALLOW_PROD=1'); process.exit(1); }

const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);
const MAP_FILE = path.join(__dirname, 'data', '.asset-map.json');
const URL_RE = /https?:\/\/[^"'\s)]*propertyradar\.com\/[^"'\s)]*\.(?:png|jpe?g|webp|svg|gif)(?:\?[^"'\s)]*)?/gi;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif' };

function baseName(u: string): string {
  try { const p = new URL(u).pathname; return decodeURIComponent(p.split('/').filter(Boolean).pop() || 'image'); } catch { return 'image'; }
}
function extOf(u: string): string { const m = baseName(u).match(/\.([a-z0-9]+)$/i); return (m ? m[1] : 'png').toLowerCase(); }

async function run() {
  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { posts, media, brandingProfiles, clientWebsites, clients, siteBranding } = await import('../../../lib/db/schema');
  const { uploadToS3 } = await import('../../../lib/s3/upload');

  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, WEBSITE_ID)).limit(1);
  if (!site) { console.error(`No website ${WEBSITE_ID}`); process.exit(1); }
  const clientId = site.clientId;
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  const uploaderId = client?.userId ?? null;
  console.log(`[assets] website=${WEBSITE_ID} client=${clientId} uploader=${uploaderId} host=${DATABASE_URL.match(/@([^/:]+)/)?.[1]}`);

  // ── gather candidate URLs ──────────────────────────────────────────────────
  const found = new Set<string>();
  const scan = (s?: string | null) => { if (!s) return; const m = s.match(URL_RE); if (m) m.forEach((u) => found.add(u)); };

  const brandRows = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, clientId));
  const siteBrandRows = await db.select().from(siteBranding).where(eq(siteBranding.websiteId, WEBSITE_ID));
  const BRAND_FIELDS = ['logoUrl', 'logoRectUrl', 'logoSquareUrl', 'logoIconUrl', 'faviconUrl', 'ogImageUrl'] as const;
  for (const r of [...brandRows, ...siteBrandRows]) for (const f of BRAND_FIELDS) scan((r as Record<string, unknown>)[f] as string | undefined);

  const allPosts = await db.select().from(posts).where(eq(posts.websiteId, WEBSITE_ID));
  for (const p of allPosts) { scan(p.content); scan(p.coverImage); scan(p.ogImage); }

  const urls = [...found];
  console.log(`[assets] found ${urls.length} unique propertyradar image URLs`);

  // ── download + upload (skip already-mapped) ────────────────────────────────
  const map: Record<string, string> = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) : {};
  let uploaded = 0, failed = 0;
  for (const url of urls) {
    if (map[url]) continue;
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SD-AssetMigrator' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const ext = extOf(url);
      const mime = resp.headers.get('content-type')?.split(';')[0] || MIME[ext] || 'application/octet-stream';
      const res = await uploadToS3(buf, baseName(url), mime);
      await db.insert(media).values({
        filename: baseName(url), storedFilename: res.storedFilename, mimeType: res.mimeType,
        fileSize: res.fileSize, url: res.url, uploadedBy: uploaderId, clientId, websiteId: WEBSITE_ID,
        alt: 'PropertyRadar', caption: null,
      });
      map[url] = res.url; uploaded++;
      if (uploaded % 10 === 0) { fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2)); console.log(`  ...${uploaded} uploaded`); }
    } catch (e) {
      failed++; console.warn(`  [skip] ${url.slice(0, 80)} — ${(e as Error).message}`);
    }
  }
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
  console.log(`[assets] uploaded=${uploaded} failed=${failed} mapped=${Object.keys(map).length}`);

  // ── rewrite references ─────────────────────────────────────────────────────
  const replaceAll = (s: string) => { let out = s; for (const [oldU, newU] of Object.entries(map)) { if (out.includes(oldU)) out = out.split(oldU).join(newU); } return out; };

  let postsUpdated = 0;
  for (const p of allPosts) {
    const newContent = p.content ? replaceAll(p.content) : p.content;
    const newCover = p.coverImage && map[p.coverImage] ? map[p.coverImage] : p.coverImage;
    const newOg = p.ogImage && map[p.ogImage] ? map[p.ogImage] : p.ogImage;
    if (newContent !== p.content || newCover !== p.coverImage || newOg !== p.ogImage) {
      await db.update(posts).set({ content: newContent, coverImage: newCover, ogImage: newOg, updatedAt: new Date() }).where(eq(posts.id, p.id));
      postsUpdated++;
    }
  }
  let brandUpdated = 0;
  for (const r of brandRows) {
    const patch: Record<string, string> = {};
    for (const f of BRAND_FIELDS) { const v = (r as Record<string, unknown>)[f] as string | undefined; if (v && map[v]) patch[f] = map[v]; }
    if (Object.keys(patch).length) { await db.update(brandingProfiles).set(patch).where(eq(brandingProfiles.id, r.id)); brandUpdated++; }
  }
  for (const r of siteBrandRows) {
    const patch: Record<string, string> = {};
    for (const f of BRAND_FIELDS) { const v = (r as Record<string, unknown>)[f] as string | undefined; if (v && map[v]) patch[f] = map[v]; }
    if (Object.keys(patch).length) { await db.update(siteBranding).set(patch).where(eq(siteBranding.id, r.id)); brandUpdated++; }
  }
  console.log(`[assets] rewrote ${postsUpdated} posts, ${brandUpdated} branding rows. Done.`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
