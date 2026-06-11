/**
 * Recolor remaining dark "moment" sections to light, across PropertyRadar pages.
 * Brand is light-dominant; the only navy should be the global footer.
 * SAFE + idempotent: transforms only style/elementStyles OBJECTS —
 *   - backgroundColor #0A1F44 (navy) -> #ECF9FF (tint); #123563 -> #FFFFFF
 *   - color #FFFFFF/white -> #0A1F44 (navy); rgba(255,255,255,*) -> #41506B (ink)
 *   - borderColor rgba(255,255,255,*) -> #E2E8F2
 * Leaves navy TEXT (#0A1F44 color), white card BACKGROUNDS, green accents, and
 * html-render HTML strings untouched (so pastel cards / index grids are safe).
 * Run: npx tsx scripts/migrations/propertyradar/recolor-light.ts [--type page]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import { eq, and } from 'drizzle-orm';
const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);

const NAVY = '#0A1F44', NAVY2 = '#123563', TINT = '#ECF9FF', WHITE = '#FFFFFF', INK = '#41506B', LINE = '#E2E8F2';
const isNavy = (v: unknown) => typeof v === 'string' && /^#0a1f44$/i.test(v.trim());
const isNavy2 = (v: unknown) => typeof v === 'string' && /^#123563$/i.test(v.trim());
const isTranslucentWhite = (v: unknown) => typeof v === 'string' && /^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.?\d+\s*\)$/i.test(v.trim());

/** Parse a CSS color to {r,g,b} (hex / rgb / rgba). Returns null if unknown. */
function toRgb(v: string): { r: number; g: number; b: number } | null {
  const s = v.trim().toLowerCase();
  if (s === 'white') return { r: 255, g: 255, b: 255 };
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) { const h = m[1]; return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) }; }
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) { const h = m[1]; return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; }
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}
/** "Light" text = every channel high (white / near-white grays like #EDEDED). */
function isLightText(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const c = toRgb(v);
  return !!c && Math.min(c.r, c.g, c.b) >= 200;
}

let changed = 0;
/** keyHint: the elementStyles key name (e.g. 'cardTitle') — titles map to navy, body to ink. */
function fixStyle(s: Record<string, unknown>, keyHint = '') {
  if (!s || typeof s !== 'object') return;
  // backgrounds
  if (isNavy(s.backgroundColor)) { s.backgroundColor = TINT; changed++; }
  else if (isNavy2(s.backgroundColor)) { s.backgroundColor = WHITE; changed++; }
  else if (isTranslucentWhite(s.backgroundColor)) { s.backgroundColor = WHITE; changed++; }
  // light text -> navy (titles/headings/labels) or ink (body)
  if (isLightText(s.color)) {
    const wantNavy = /title|heading|name|stat|value|overline|label|lead/i.test(keyHint)
      || (typeof s.fontWeight === 'string' && parseInt(s.fontWeight, 10) >= 600);
    s.color = wantNavy ? NAVY : INK;
    changed++;
  }
  // light/translucent borders -> hairline
  if (isTranslucentWhite(s.borderColor) || isLightText(s.borderColor)) { s.borderColor = LINE; changed++; }
  // drop a dark text-shadow that only made sense on navy
  if (typeof s.customCSS === 'string' && /text-shadow:0 2px 34px rgba\(0,0,0/.test(s.customCSS)) {
    s.customCSS = s.customCSS.replace(/text-shadow:0 2px 34px rgba\(0,0,0,0\.4\);?/g, '').trim();
    if (!s.customCSS) delete s.customCSS;
    changed++;
  }
}
function walk(node: unknown) {
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (!node || typeof node !== 'object') return;
  const b = node as Record<string, unknown>;
  if (b.style) fixStyle(b.style as Record<string, unknown>);
  if (b.elementStyles && typeof b.elementStyles === 'object') {
    for (const k of Object.keys(b.elementStyles as object)) fixStyle((b.elementStyles as Record<string, Record<string, unknown>>)[k], k);
  }
  // bento-grid / variant-driven dark cards -> light (renderer derives the
  // translucent-white glass bg from variant:'dark', so flip it explicitly)
  if (b.variant === 'dark') { b.variant = 'light'; changed++; }
  if (isNavy(b.darkBg)) { b.darkBg = WHITE; changed++; }
  // recurse into known child containers
  for (const key of ['blocks', 'columns', 'tabs', 'panels', 'cards', 'services', 'items']) {
    if (Array.isArray(b[key])) walk(b[key]);
  }
}

async function run() {
  const typeArg = process.argv.includes('--type') ? process.argv[process.argv.indexOf('--type') + 1] : null;
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const where = typeArg ? and(eq(posts.websiteId, WEBSITE_ID), eq(posts.postType, typeArg)) : eq(posts.websiteId, WEBSITE_ID);
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(where);
  let touched = 0;
  for (const r of rows) {
    let parsed: { blocks?: unknown[]; version?: string };
    try { parsed = JSON.parse(r.content || '{}'); } catch { continue; }
    if (!parsed.blocks) continue;
    const before = changed;
    walk(parsed.blocks);
    if (changed > before) {
      await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, r.id));
      touched++;
    }
  }
  console.log(`[recolor-light] scanned ${rows.length} posts; updated ${touched}; ${changed} style edits`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
