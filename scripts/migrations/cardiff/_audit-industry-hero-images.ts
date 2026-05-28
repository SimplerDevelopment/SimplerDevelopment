import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq, and, like } from 'drizzle-orm';

interface Block {
  id?: string;
  type?: string;
  blocks?: Block[];
  html?: string;
  values?: Record<string, unknown>;
  style?: { backgroundImage?: string; customCSS?: string; [k: string]: unknown };
  src?: string;
  url?: string;
}

function findFirstImageUrl(node: Block): string | null {
  if (!node) return null;
  // Direct image-ish props
  if (typeof node.src === 'string' && node.src) return node.src;
  if (typeof node.url === 'string' && /\.(jpe?g|png|webp|svg|avif)(\?|$)/i.test(node.url)) return node.url;
  if (node.style) {
    const bi = node.style.backgroundImage;
    if (typeof bi === 'string') {
      if (bi.includes('url(')) return bi;
      // Bare URL — BlockStyleWrapper wraps these in url(...) at render time.
      if (/^https?:\/\/.+\.(jpe?g|png|webp|svg|avif)(\?|$)/i.test(bi)) return bi;
    }
    const css = node.style.customCSS;
    if (typeof css === 'string' && css.includes('url(')) return css;
  }
  if (node.html && node.html.includes('url(')) {
    const m = node.html.match(/url\(['"]?([^'")]+)['"]?\)/i);
    if (m) return m[1];
  }
  if (node.html && /<img[^>]*src=["']([^"']+)/i.test(node.html)) {
    const m = node.html.match(/<img[^>]*src=["']([^"']+)/i);
    if (m) return m[1];
  }
  if (node.values) {
    for (const v of Object.values(node.values)) {
      if (typeof v === 'string' && /\.(jpe?g|png|webp|svg|avif)/i.test(v)) return v;
    }
  }
  // Recurse into children
  if (Array.isArray(node.blocks)) {
    for (const c of node.blocks) {
      const r = findFirstImageUrl(c);
      if (r) return r;
    }
  }
  return null;
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db
    .select({ id: posts.id, slug: posts.slug, content: posts.content, title: posts.title })
    .from(posts)
    .where(and(eq(posts.websiteId, site.id), like(posts.slug, 'industries-%')));

  // Also check agriculture, equipment-leasing, equipment-financing, line-of-credit, sba-loans, working-capital,
  // merchant-cash-advance, short-term-working-capital-loans, business-cards, business-invoice-financing,
  // revenue-based-business-loans, business-loans, working-capital-loans — they all have heroes too.
  const extra = await db
    .select({ id: posts.id, slug: posts.slug, content: posts.content, title: posts.title })
    .from(posts)
    .where(and(
      eq(posts.websiteId, site.id),
    ));
  const extraOfInterest = extra.filter(r => {
    const s = r.slug || '';
    return [
      'agriculture', 'equipment-leasing', 'equipment-financing', 'line-of-credit',
      'sba-loans', 'working-capital', 'merchant-cash-advance', 'short-term-working-capital-loans',
      'business-cards', 'business-invoice-financing', 'revenue-based-business-loans',
      'business-loans', 'working-capital-loans',
    ].includes(s);
  });

  const all = [...rows, ...extraOfInterest];

  console.log('Hero image audit:');
  console.log('================');
  const missing: { id: number; slug: string; title: string }[] = [];
  for (const r of all.sort((a, b) => (a.slug || '').localeCompare(b.slug || ''))) {
    if (!r.content) { console.log(`  ${r.slug}: NO CONTENT`); continue; }
    let parsed: { blocks?: Block[] };
    try { parsed = JSON.parse(r.content); } catch { console.log(`  ${r.slug}: bad json`); continue; }
    const blocks = parsed.blocks || [];
    const hero = blocks.find(b => b.id?.startsWith('hero')) || blocks[0];
    if (!hero) { console.log(`  ${r.slug}: NO HERO BLOCK`); continue; }
    const img = findFirstImageUrl(hero);
    if (img) {
      console.log(`  ✓ ${r.slug.padEnd(40)} hero=${hero.id || '(no id)'.padEnd(30)} img=${img.slice(0, 80)}`);
    } else {
      console.log(`  ✗ ${r.slug.padEnd(40)} hero=${hero.id || '(no id)'.padEnd(30)} (no image)`);
      missing.push({ id: r.id, slug: r.slug || '', title: r.title || '' });
    }
  }
  console.log(`\nMissing hero images: ${missing.length}`);
  for (const m of missing) console.log(`  ${m.id}  /${m.slug}  ${m.title}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
