/**
 * Cardiff migration — Generic content extractor
 *
 * For each URL in scripts/migrations/cardiff/inventory.json, fetch the HTML,
 * strip chrome, and extract a structured representation:
 *   { url, title, metaDescription, ogImage, hero: {title}, sections: [{level, text}], cta: {...} }
 *
 * Writes one JSON per page to scripts/migrations/cardiff/extracted/pages/<slug>.json
 *
 * Run:  npx tsx scripts/migrations/cardiff/extract-pages.ts <inventory-file>
 *       npx tsx scripts/migrations/cardiff/extract-pages.ts inventory-marketing.json
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PageRecord {
  url: string;
  slug: string;
  navLabel?: string;
  /** Determines block-grade output. 'rich' = hero+sections+cta; 'simple' = h1+paragraphs only */
  template?: 'rich' | 'simple';
}

interface ExtractedPage {
  url: string;
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  ogImage: string;
  canonical: string;
  blocks: Array<{ type: 'h2' | 'h3' | 'h4' | 'p' | 'ul' | 'ol' | 'li' | 'blockquote'; text: string; items?: string[] }>;
  images: string[];
  links: Array<{ href: string; text: string }>;
  template: 'rich' | 'simple';
}

const PAGES_DIR = 'scripts/migrations/cardiff/extracted/pages';

function stripChrome(html: string): string {
  // remove scripts, styles, nav, footer, header containers
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

function cleanText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractMeta(html: string, prop: string, attr: 'property' | 'name' = 'property'): string {
  const re = new RegExp(`<meta[^>]+${attr}=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  return html.match(re)?.[1] ?? '';
}

function extractFirstMatch(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? cleanText(m[1]) : '';
}

async function extractPage(record: PageRecord): Promise<ExtractedPage | null> {
  let resp;
  try {
    resp = await fetch(record.url, { headers: { 'user-agent': 'Mozilla/5.0 (SimplerDevelopment migration bot)' } });
  } catch (e: any) {
    console.warn(`  ⚠️  fetch error: ${e.message}`);
    return null;
  }
  if (!resp.ok) {
    console.warn(`  ⚠️  HTTP ${resp.status}`);
    return null;
  }
  const rawHtml = await resp.text();
  const html = stripChrome(rawHtml);

  const title = extractFirstMatch(rawHtml, /<title[^>]*>([^<]+)<\/title>/i);
  const metaDescription = extractMeta(rawHtml, 'description', 'name') || extractMeta(rawHtml, 'og:description');
  const ogImage = extractMeta(rawHtml, 'og:image');
  const canonical = rawHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? '';

  // Heuristic: main content is typically inside <main>, <article>, or after </nav>...before <footer>
  let mainHtml = html;
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch) mainHtml = mainMatch[1];
  else if (articleMatch) mainHtml = articleMatch[1];
  else {
    // Strip nav at top and footer at bottom
    mainHtml = mainHtml.replace(/[\s\S]*?<\/nav>/i, '');
    mainHtml = mainHtml.replace(/<footer[\s\S]*$/i, '');
  }

  // First H1 = the hero/page title
  const h1 = extractFirstMatch(mainHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

  // Detect nav-menu ULs by content signatures
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

  // Walk through content tags in order
  const blocks: ExtractedPage['blocks'] = [];
  // Each match: <h2|h3|h4|p|blockquote>text</tag>  OR a complete <ul|ol>
  const re = /<(h2|h3|h4|p|blockquote|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mainHtml)) !== null) {
    const tag = m[1].toLowerCase() as 'h2' | 'h3' | 'h4' | 'p' | 'blockquote' | 'ul' | 'ol';
    const inner = m[2];
    if (tag === 'ul' || tag === 'ol') {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map(li => cleanText(li[1])).filter(t => t.length > 1 && t.length < 320);
      if (items.length === 0) continue;
      if (looksLikeNavList(items)) continue;
      const avgLen = items.reduce((a, b) => a + b.length, 0) / items.length;
      if (items.length > 10 && avgLen < 25) continue;
      blocks.push({ type: tag, text: '', items });
    } else {
      const text = cleanText(inner);
      // Skip tiny boilerplate strings
      if (text.length < 5) continue;
      if (text.length > 1400) continue; // probably entire layout — skip
      // Skip nav/footer leftovers
      const lower = text.toLowerCase().trim();
      if (lower.startsWith('sign in') || lower.startsWith('newsroom') || lower === 'menu') continue;
      // Skip headings that exactly match a nav label
      if ((tag === 'h2' || tag === 'h3' || tag === 'h4') && NAV_LABELS.has(lower)) continue;
      // Skip "We are here to help your industry…" boilerplate appearing across pages
      if (/^we are here to help your industry/i.test(text)) continue;
      if (/^need to make payroll/i.test(text)) continue;
      if (/^cardiff'?s got you covered/i.test(text)) continue;
      blocks.push({ type: tag, text });
    }
  }

  // De-duplicate consecutive identical blocks (common WP artifact)
  const deduped: typeof blocks = [];
  for (const b of blocks) {
    const last = deduped[deduped.length - 1];
    if (last && last.type === b.type && last.text === b.text) continue;
    deduped.push(b);
  }

  // Images
  const images = [...mainHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map(im => im[1])
    .filter(src => src.includes('cardiff') || src.includes('cdn'))
    .filter(src => !src.includes('Logo') && !src.includes('seal'));

  // Links
  const links = [...mainHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(a => ({ href: a[1], text: cleanText(a[2]) }))
    .filter(l => l.text.length > 1 && l.text.length < 100 && l.href.startsWith('http'));

  return {
    url: record.url,
    slug: record.slug,
    title: title || h1 || record.slug,
    h1: h1 || record.navLabel || record.slug,
    metaDescription,
    ogImage,
    canonical,
    blocks: deduped,
    images: [...new Set(images)].slice(0, 12),
    links: links.slice(0, 30),
    template: record.template ?? 'rich',
  };
}

async function main() {
  const inventoryFile = process.argv[2];
  if (!inventoryFile) {
    console.error('Usage: extract-pages.ts <inventory-file.json>');
    process.exit(1);
  }
  const inventoryPath = join('scripts/migrations/cardiff', inventoryFile);
  const inv: PageRecord[] = JSON.parse(readFileSync(inventoryPath, 'utf-8'));

  mkdirSync(PAGES_DIR, { recursive: true });

  let i = 0;
  for (const rec of inv) {
    i++;
    const outFile = join(PAGES_DIR, `${rec.slug}.json`);
    if (existsSync(outFile)) {
      console.log(`[${i}/${inv.length}] ⏩ skip cached: ${rec.slug}`);
      continue;
    }
    console.log(`[${i}/${inv.length}] fetching: ${rec.url}`);
    const data = await extractPage(rec);
    if (!data) {
      console.warn(`  ⚠️  no data for ${rec.url}`);
      continue;
    }
    writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`  ✅ ${data.blocks.length} blocks, ${data.images.length} images → ${rec.slug}.json`);
    // Gentle pacing
    await new Promise(r => setTimeout(r, 250));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
