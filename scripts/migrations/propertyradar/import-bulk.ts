/**
 * Bulk-import a PropertyRadar collection as templated content posts.
 *   npx tsx scripts/migrations/propertyradar/import-bulk.ts --type blog|plays|lists|coverage [--limit N]
 *
 * - blog: postType 'blog', slug = bare item slug, body = bodyHtml. URL /blog/<slug>.
 * - plays/lists/coverage: postType 'play'|'list'|'coverage', slug = full URL path
 *   (e.g. 'plays/real-estate-investors/preforeclosures'), body = headings+paragraphs.
 * Each post is self-contained (compact hero + body + CTA). The global sites layout
 * supplies nav + footer, so NO footer block is added. Idempotent (upsert by slug).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import * as fs from 'fs';
import * as path from 'path';
import { T, makePage, WEBSITE_ID } from './_shared';

const DATA_DIR = path.join(__dirname, 'data');
type Arg = { type: string; limit: number };
function parseArgs(): Arg {
  const a = process.argv.slice(2);
  const type = a[a.indexOf('--type') + 1];
  const li = a.indexOf('--limit');
  const limit = li >= 0 ? parseInt(a[li + 1], 10) : 99999;
  if (!['blog', 'plays', 'lists', 'coverage'].includes(type)) { console.error('--type must be blog|plays|lists|coverage'); process.exit(1); }
  return { type, limit };
}

const POSTTYPE: Record<string, string> = { blog: 'blog', plays: 'play', lists: 'list', coverage: 'coverage' };
const OVERLINE: Record<string, string> = { blog: 'PROPERTYRADAR BLOG', plays: 'LEAD GEN PLAY', lists: 'PROPERTY LIST', coverage: 'DATA COVERAGE' };

function pathFromUrl(url: string): string {
  try { return new URL(url).pathname.replace(/^\/+|\/+$/g, ''); } catch { return ''; }
}
function escapeLoopBraces(html: string): string {
  // html-render treats {{ }} as field placeholders; neutralize any in source body.
  return (html || '').replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
}

interface BlogItem { url: string; slug: string; title: string; date?: string; author?: string; categories?: string[]; tags?: string[]; featuredImage?: string; excerpt?: string; metaDescription?: string; seoTitle?: string; bodyHtml?: string; bodyText?: string; }
interface CollItem { url: string; slug: string; title: string; seoTitle?: string; metaDescription?: string; ogImage?: string; headings?: Array<{ level: number; text: string }>; paragraphs?: string[]; sections?: Array<{ heading?: string; level?: number; paragraphs?: string[]; bullets?: string[] }>; ctas?: Array<{ text: string; href: string }>; }

function buildBlog(item: BlogItem) {
  const p = makePage();
  p.add(p.hero({
    title: item.title || 'Untitled',
    subtitle: (item.categories && item.categories[0]) ? item.categories[0].toUpperCase() : OVERLINE.blog,
    description: item.excerpt || item.metaDescription || '',
    ctaText: 'Try it Free', ctaLink: '/register',
    secondaryCtaText: 'Back to blog', secondaryCtaLink: '/blog',
    dark: false, minHeight: '46vh',
  }));
  const body: unknown[] = [];
  if (item.featuredImage) body.push(p.image('cover', item.featuredImage, item.title || 'Featured image', { style: { borderRadius: '16px', marginBottom: '32px' } }));
  const html = (item.bodyHtml && item.bodyHtml.trim().length > 40) ? escapeLoopBraces(item.bodyHtml)
    : `<p>${(item.bodyText || item.excerpt || '').replace(/</g, '&lt;')}</p>`;
  body.push(p.htmlRender('body', html, 'contained'));
  p.add(p.section('sec-body', T.WHITE, 72, body, {}, {}));
  // narrow the body column
  (p.blocks[p.blocks.length - 1] as { maxWidth?: string }).maxWidth = '820px';
  p.add(p.ctaBlock({ title: 'Ready to find motivated property owners?', description: 'Put PropertyRadar’s data and marketing tools to work for your business.', primaryButtonText: 'Try it Free', primaryButtonUrl: '/register', secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing' }));
  return p.blocks;
}

function buildCollection(item: CollItem, type: string) {
  const p = makePage();
  const firstPara = (item.paragraphs && item.paragraphs[0]) || item.metaDescription || '';
  p.add(p.hero({
    title: item.title || 'Untitled',
    subtitle: OVERLINE[type],
    description: (item.metaDescription || firstPara || '').slice(0, 260),
    ctaText: 'Try it Free', ctaLink: '/register',
    secondaryCtaText: type === 'coverage' ? 'See all coverage' : (type === 'lists' ? 'Browse all lists' : 'Browse all plays'),
    secondaryCtaLink: `/${type}`,
    dark: false, minHeight: '50vh',
  }));
  // Body: render sections (heading + paragraphs + bullets) if present, else flat paragraphs.
  const children: unknown[] = [];
  let n = 0;
  const secs = (item.sections && item.sections.length) ? item.sections : [{ paragraphs: item.paragraphs || [] }];
  for (const s of secs) {
    if (s.heading && s.level && s.level <= 3) children.push(p.heading(`h${n}`, s.heading, 3, T.NAVY, 'left'));
    for (const para of (s.paragraphs || [])) {
      if (para && para.trim().length > 1) children.push(p.text(`p${n++}`, para, T.INK, 'left'));
    }
    if (s.bullets && s.bullets.length) {
      const lis = s.bullets.map((b) => `<li style="margin-bottom:8px">${b.replace(/</g, '&lt;')}</li>`).join('');
      children.push(p.htmlRender(`b${n++}`, `<ul style="padding-left:1.2em;color:${T.INK}">${lis}</ul>`, 'contained'));
    }
  }
  if (children.length === 0) children.push(p.text('empty', item.title || '', T.INK, 'left'));
  p.add(p.section('sec-body', T.WHITE, 80, children));
  (p.blocks[p.blocks.length - 1] as { maxWidth?: string }).maxWidth = '860px';
  p.add(p.ctaBlock({ title: 'Start finding motivated owners today', description: 'Join thousands of pros who grow their business with PropertyRadar.', primaryButtonText: 'Try it Free', primaryButtonUrl: '/register', secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing' }));
  return p.blocks;
}

async function run() {
  const { type, limit } = parseArgs();
  const file = path.join(DATA_DIR, `${type === 'blog' ? 'blog' : type}.json`);
  if (!fs.existsSync(file)) { console.error(`Missing data file: ${file}. Run extraction first.`); process.exit(1); }
  const items: Array<BlogItem & CollItem> = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { posts } = await import('../../../lib/db/schema');

  const postType = POSTTYPE[type];
  let created = 0, updated = 0, skipped = 0;
  const slugSeen = new Set<string>();

  for (const item of items.slice(0, limit)) {
    let slug: string;
    if (type === 'blog') slug = (item.slug || pathFromUrl(item.url).replace(/^blog\//, '')).trim();
    else slug = pathFromUrl(item.url);
    if (!slug || !item.title) { skipped++; continue; }
    if (slugSeen.has(slug)) { skipped++; continue; }
    slugSeen.add(slug);

    const blocks = type === 'blog' ? buildBlog(item) : buildCollection(item, type);
    const clean = (blocks as Array<{ type?: string }>).filter((b) => b && b.type !== 'site-footer');
    const values = {
      title: item.title, slug, postType, content: JSON.stringify({ blocks: clean, version: '1.0' }),
      published: false, websiteId: WEBSITE_ID,
      seoTitle: item.seoTitle || item.title,
      seoDescription: (item.metaDescription || item.excerpt || '').slice(0, 320),
      ogImage: item.featuredImage || item.ogImage || 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
      coverImage: item.featuredImage || null,
    };
    const existing = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, slug))).limit(1);
    if (existing.length > 0) {
      await db.update(posts).set({ ...values, updatedAt: new Date() }).where(eq(posts.id, existing[0].id));
      updated++;
    } else {
      await db.insert(posts).values(values);
      created++;
    }
    if ((created + updated) % 25 === 0) console.log(`  ...${created + updated} processed`);
  }
  console.log(`[import-bulk ${type}] created=${created} updated=${updated} skipped=${skipped} (postType=${postType})`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
