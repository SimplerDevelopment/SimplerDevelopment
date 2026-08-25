/**
 * Site Discovery Script Template
 *
 * Usage: npx tsx scripts/migrations/<site-slug>/discover.ts <url>
 *
 * Fetches sitemap, catalogs all pages, and outputs a migration plan.
 * Copy this into your migration directory and customize as needed.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE_URL = process.argv[2];
if (!SOURCE_URL) {
  console.error('Usage: npx tsx discover.ts <source-url>');
  process.exit(1);
}

const baseUrl = new URL(SOURCE_URL).origin;

interface PageEntry {
  url: string;
  slug: string;
  category: 'home' | 'marketing' | 'blog' | 'product' | 'other';
  lastmod?: string;
  priority?: string;
}

async function fetchSitemap(): Promise<string[]> {
  const urls: string[] = [];

  // Try sitemap.xml first
  for (const sitemapPath of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.xml.gz']) {
    try {
      const res = await fetch(`${baseUrl}${sitemapPath}`, {
        headers: { 'User-Agent': 'SimplerDev-Migration/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const text = await res.text();

      // Extract URLs from sitemap XML
      const locMatches = text.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
      for (const match of locMatches) {
        const url = match[1].trim();
        // If this is a sitemap index, it contains other sitemaps
        if (url.endsWith('.xml') || url.endsWith('.xml.gz')) {
          try {
            const subRes = await fetch(url, {
              headers: { 'User-Agent': 'SimplerDev-Migration/1.0' },
              signal: AbortSignal.timeout(10000),
            });
            const subText = await subRes.text();
            const subMatches = subText.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
            for (const subMatch of subMatches) {
              const subUrl = subMatch[1].trim();
              if (!subUrl.endsWith('.xml')) urls.push(subUrl);
            }
          } catch { /* skip failed sub-sitemaps */ }
        } else {
          urls.push(url);
        }
      }

      if (urls.length > 0) break;
    } catch { continue; }
  }

  // Fallback: crawl home page navigation
  if (urls.length === 0) {
    console.log('No sitemap found, crawling home page links...');
    try {
      const res = await fetch(baseUrl, {
        headers: { 'User-Agent': 'SimplerDev-Migration/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const linkMatches = html.matchAll(/href=["'](\/[^"'#?]*?)["']/gi);
      const seen = new Set<string>();
      for (const match of linkMatches) {
        const href = match[1];
        if (!seen.has(href) && !href.match(/\.(css|js|png|jpg|svg|ico|woff|pdf)$/i)) {
          seen.add(href);
          urls.push(`${baseUrl}${href}`);
        }
      }
      urls.unshift(baseUrl); // Ensure home page is first
    } catch (err) {
      console.error('Failed to crawl home page:', err);
    }
  }

  return [...new Set(urls)]; // Deduplicate
}

function categorizeUrl(url: string): PageEntry['category'] {
  const pathname = new URL(url).pathname.toLowerCase();

  if (pathname === '/' || pathname === '') return 'home';

  if (pathname.match(/^\/(blog|news|articles|journal|insights|posts)\//)) return 'blog';
  if (pathname.match(/^\/(blog|news|articles|journal|insights|posts)$/)) return 'marketing';

  if (pathname.match(/^\/(shop|products?|store|catalog)\//)) return 'product';
  if (pathname.match(/^\/(shop|products?|store|catalog)$/)) return 'marketing';

  // Top-level pages are marketing
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return 'marketing';

  return 'other';
}

async function main() {
  console.log(`\nDiscovering site: ${baseUrl}\n`);

  const urls = await fetchSitemap();
  console.log(`Found ${urls.length} URLs\n`);

  const pages: PageEntry[] = urls.map(url => {
    const pathname = new URL(url).pathname;
    return {
      url,
      slug: pathname === '/' ? 'home' : pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-'),
      category: categorizeUrl(url),
    };
  });

  // Group by category
  const grouped: Record<string, PageEntry[]> = {};
  for (const page of pages) {
    if (!grouped[page.category]) grouped[page.category] = [];
    grouped[page.category].push(page);
  }

  // Print summary
  console.log('=== MIGRATION PLAN ===\n');
  for (const [category, categoryPages] of Object.entries(grouped)) {
    console.log(`${category.toUpperCase()} (${categoryPages.length} pages):`);
    for (const p of categoryPages.slice(0, 10)) {
      console.log(`  ${p.slug} — ${p.url}`);
    }
    if (categoryPages.length > 10) {
      console.log(`  ... and ${categoryPages.length - 10} more`);
    }
    console.log();
  }

  console.log('PHASE 1: Home page (1 page)');
  console.log(`PHASE 2: Marketing pages (${(grouped.marketing || []).length} pages)`);
  console.log(`PHASE 3: Blog posts (${(grouped.blog || []).length} items)`);
  console.log(`PHASE 3: Products (${(grouped.product || []).length} items)`);
  console.log(`PHASE 3: Other content (${(grouped.other || []).length} items)`);

  // Save to JSON for use by import scripts
  const outDir = path.dirname(new URL(import.meta.url).pathname);
  const outPath = path.join(outDir, 'discovery.json');
  fs.writeFileSync(outPath, JSON.stringify({ baseUrl, pages, grouped }, null, 2));
  console.log(`\nSaved discovery data to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
