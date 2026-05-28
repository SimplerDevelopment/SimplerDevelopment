/**
 * Cardiff migration — Blog/news/reports article extractor
 *
 * Cardiff is a Divi-themed WordPress site. Article body is split across
 * many small <p>/<h*> elements scattered through Divi's nested module
 * structure. This extractor:
 *   1. Finds the global <h1>
 *   2. Finds the publication date (Divi uses spans like "Jul 22, 2025")
 *   3. Extracts every <p> with >120 chars + every <h2>/<h3> after the H1
 *      and before the footer/related-posts section
 *   4. Deduplicates and filters out CTA/nav boilerplate
 *
 * Writes to scripts/migrations/cardiff/extracted/articles/<slug>.json
 *
 * Run:
 *   npx tsx scripts/migrations/cardiff/extract-blog.ts inventory-blog.json
 *   npx tsx scripts/migrations/cardiff/extract-blog.ts inventory-news.json
 *   npx tsx scripts/migrations/cardiff/extract-blog.ts inventory-reports.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ARTICLES_DIR = 'scripts/migrations/cardiff/extracted/articles';

interface PageRecord { url: string; slug: string; }

interface ExtractedArticle {
  url: string;
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  ogImage: string;
  publishedDate: string;
  category: string;
  excerpt: string;
  blocks: Array<{ type: 'h2' | 'h3' | 'h4' | 'p' | 'ul'; text: string; items?: string[] }>;
  coverImage: string;
}

const BOILERPLATE_RE = /^(we are here to help|need to make payroll|cardiff'?s got you covered|apply now|industries|resources|why cardiff|small business loan products|small business loans by industry|company|copyright ©|all rights reserved|california lender license|sign in|contact us|menu|newsroom|cookie|privacy policy|legal notices|mobile terms|view all articles|related articles|recent posts|share this:|tags?:)$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
}
const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const stripChrome = (h: string) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, '')
   .replace(/<style[\s\S]*?<\/style>/gi, '')
   .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
   .replace(/<!--[\s\S]*?-->/g, '');

function meta(html: string, prop: string, attr: 'property' | 'name' = 'property'): string {
  const re = new RegExp(`<meta[^>]+${attr}=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  return html.match(re)?.[1] ?? '';
}

async function extractArticle(rec: PageRecord): Promise<ExtractedArticle | null> {
  let resp;
  try {
    resp = await fetch(rec.url, { headers: { 'user-agent': 'Mozilla/5.0 (SimplerDevelopment migration bot)' } });
  } catch (e: any) {
    console.warn(`  ⚠️  fetch error: ${e.message}`);
    return null;
  }
  if (!resp.ok) {
    console.warn(`  ⚠️  HTTP ${resp.status}`);
    return null;
  }
  const raw = await resp.text();
  const html = stripChrome(raw);

  const title = (raw.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim();
  const metaDescription = meta(raw, 'description', 'name') || meta(raw, 'og:description');
  const ogImage = meta(raw, 'og:image');

  // H1 → article title
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? clean(h1Match[1]) : '';

  // Date: Divi uses span/p containing pattern like "May 19, 2026" or "Jul 22, 2025"
  const dateMatch = html.match(/>([A-Z][a-z]{2,9} \d{1,2}, \d{4})</);
  const publishedDate = dateMatch ? dateMatch[1] : '';

  // Category: usually appears between H1 and date as a small caps tag
  const catMatch = html.match(/<a[^>]+rel=["']category[^"']*["'][^>]*>([^<]+)<\/a>/i);
  const category = catMatch ? clean(catMatch[1]) : '';

  // Anchor to H1: extract content only AFTER the H1 and BEFORE known
  // terminators (Related Posts / Recent Posts / Footer / sidebar widgets).
  let body = html;
  const h1Idx = body.search(/<h1[^>]*>/i);
  if (h1Idx > 0) body = body.slice(h1Idx);
  // Cut at first appearance of related/recent/sidebar markers
  for (const stopRe of [
    /<h[1-4][^>]*>\s*Recent Posts\b/i,
    /<h[1-4][^>]*>\s*Related\s+(Posts|Articles|Reads)\b/i,
    /class=["'][^"']*(et_pb_post_nav|et_pb_post_nav_arrow|footer|widget_recent_entries|related-posts)/i,
    /<footer[\s>]/i,
  ]) {
    const cutIdx = body.search(stopRe);
    if (cutIdx > 200) body = body.slice(0, cutIdx);
  }

  // Detect nav-menu UL signatures: shortish items that match known menu labels
  const NAV_LABELS = new Set([
    'business loans', 'business credit cards', 'equipment financing', 'lines of credit',
    'merchant cash advance', 'merchant cash advance (mca)', 'sba loans', 'how to qualify',
    'industries', 'auto repair', 'construction', 'contracting', 'dental practice',
    'excavation', 'hospitality', 'landscaping', 'masonry', 'medical', 'plumbing',
    'restaurants', 'restaurant', 'retail', 'trucking', 'resources', 'articles',
    'getting ready', 'getting ready to apply', 'reports', 'using your loan', 'faq',
    'about', 'newsroom', 'contact us', 'apply now', 'sign in', 'home',
  ]);
  function looksLikeNavList(items: string[]): boolean {
    if (items.length < 3) return false;
    let navHits = 0;
    for (const it of items) {
      const norm = it.toLowerCase().trim();
      if (NAV_LABELS.has(norm) || (norm.length < 30 && /^[a-z0-9 ()&-]+$/.test(norm))) navHits++;
    }
    return navHits / items.length >= 0.5;
  }

  // Extract content blocks from the body region only
  const blocks: ExtractedArticle['blocks'] = [];
  const seen = new Set<string>();
  const re = /<(h2|h3|h4|p|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tag = m[1].toLowerCase() as 'h2' | 'h3' | 'h4' | 'p' | 'ul' | 'ol';
    const inner = m[2];

    if (tag === 'ul' || tag === 'ol') {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map(li => clean(li[1])).filter(t => t.length > 1 && t.length < 360);
      if (items.length === 0) continue;
      if (looksLikeNavList(items)) continue; // drop nav menus
      // Drop "Table of Contents"-style lists too — usually single-word items
      const avgLen = items.reduce((a, b) => a + b.length, 0) / items.length;
      if (items.length > 8 && avgLen < 25) continue;
      const key = `ul:${items.slice(0, 3).join('|')}`;
      if (seen.has(key)) continue; seen.add(key);
      blocks.push({ type: 'ul', text: '', items });
      continue;
    }

    const text = clean(inner);
    if (text.length < 3) continue;
    if (BOILERPLATE_RE.test(text)) continue;
    if (/^[A-Z][a-z]{2,9} \d{1,2}, \d{4}$/.test(text)) continue; // dates
    if (/^\d{4}$/.test(text)) continue;
    if (tag === 'p' && text.length < 60) continue;
    if (text.length > 2000) continue;
    // Heading sanity: drop nav-style short text
    if ((tag === 'h2' || tag === 'h3' || tag === 'h4') && NAV_LABELS.has(text.toLowerCase())) continue;
    if (seen.has(`${tag}:${text}`)) continue;
    seen.add(`${tag}:${text}`);
    blocks.push({ type: tag, text });
  }

  // Cover image — favor og:image; fallback to first content image
  const coverImage = ogImage || '';

  // Excerpt
  const firstP = blocks.find(b => b.type === 'p');
  const excerpt = firstP ? firstP.text.slice(0, 220) : '';

  return {
    url: rec.url,
    slug: rec.slug,
    title: title || h1 || rec.slug,
    h1: h1 || title || rec.slug,
    metaDescription,
    ogImage,
    publishedDate,
    category,
    excerpt,
    blocks,
    coverImage,
  };
}

async function main() {
  const inventoryFile = process.argv[2];
  if (!inventoryFile) {
    console.error('Usage: extract-blog.ts <inventory-file.json>');
    process.exit(1);
  }
  const inv: PageRecord[] = JSON.parse(readFileSync(join('scripts/migrations/cardiff', inventoryFile), 'utf-8'));
  mkdirSync(ARTICLES_DIR, { recursive: true });

  let i = 0;
  for (const rec of inv) {
    i++;
    const out = join(ARTICLES_DIR, `${rec.slug}.json`);
    if (existsSync(out)) {
      console.log(`[${i}/${inv.length}] ⏩ cached ${rec.slug}`);
      continue;
    }
    console.log(`[${i}/${inv.length}] ${rec.url}`);
    const a = await extractArticle(rec);
    if (!a) { console.warn(`  ⚠️  no data`); continue; }
    writeFileSync(out, JSON.stringify(a, null, 2));
    console.log(`  ✅ "${a.h1.slice(0, 60)}" — ${a.blocks.length} blocks`);
    await new Promise(r => setTimeout(r, 220));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
