import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 140;
const LIMIT = 30;

async function importContent() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // 1. Fetch WP sitemap URLs (sorted by lastmod desc = most recent first)
  console.log('Fetching WP sitemap...');
  const sitemapRes = await fetch('https://www.thecaq.org/sitemaps/wp/sitemap.xml', {
    headers: { 'User-Agent': 'SimplerDev-Migration/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  const sitemapXml = await sitemapRes.text();

  // Parse URLs with lastmod dates
  interface SitemapEntry { url: string; lastmod: string; slug: string }
  const entries: SitemapEntry[] = [];
  const urlBlocks = sitemapXml.split('<url>').slice(1);
  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>\s*(.*?)\s*<\/loc>/);
    const modMatch = block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/);
    if (locMatch) {
      const url = locMatch[1].trim();
      const lastmod = modMatch ? modMatch[1].trim() : '2020-01-01';
      const slug = url.replace('https://www.thecaq.org/', '').replace(/\/$/, '');
      entries.push({ url, lastmod, slug });
    }
  }

  // Sort by most recent
  entries.sort((a, b) => new Date(b.lastmod).getTime() - new Date(a.lastmod).getTime());
  const recent = entries.slice(0, LIMIT);

  console.log(`Processing ${recent.length} most recent content items...\n`);

  let created = 0;
  let skipped = 0;

  for (const entry of recent) {
    // Check if already exists
    const [existing] = await db.select({ id: posts.id }).from(posts)
      .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, entry.slug)))
      .limit(1);
    if (existing) {
      console.log(`  [skip] ${entry.slug}`);
      skipped++;
      continue;
    }

    // Fetch the page content
    try {
      const res = await fetch(entry.url, {
        headers: { 'User-Agent': 'SimplerDev-Migration/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();

      // Extract metadata
      const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/\s*\|.*$/, '').trim()
        || html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
        || entry.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)?.[1] || '';
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i)?.[1] || '';

      // Extract main content - strip nav/footer/scripts
      let content = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      // Try to find the main content area
      const mainMatch = content.match(/<main[\s\S]*?<\/main>/i)
        || content.match(/<article[\s\S]*?<\/article>/i);
      if (mainMatch) content = mainMatch[0];

      // Extract text paragraphs
      const paragraphs: string[] = [];
      const paraMatches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      for (const m of paraMatches) {
        const text = m[1].replace(/<[^>]+>/g, '').trim();
        if (text.length > 30) paragraphs.push(text);
      }

      // Build blocks for the post
      const blocks: unknown[] = [
        {
          id: `${entry.slug}-heading`, type: 'heading', order: 1,
          content: title, level: 1, alignment: 'left',
          style: { padding: '20px 0 10px' },
        },
      ];

      if (metaDesc) {
        blocks.push({
          id: `${entry.slug}-excerpt`, type: 'text', order: 2,
          content: metaDesc, size: 'lg', alignment: 'left',
          style: { padding: '0 0 20px', color: '#666', fontStyle: 'italic' },
        });
      }

      // Add paragraphs as text blocks
      let order = 3;
      for (const para of paragraphs.slice(0, 15)) { // Cap at 15 paragraphs
        blocks.push({
          id: `${entry.slug}-p-${order}`, type: 'text', order: order++,
          content: para, alignment: 'left',
        });
      }

      // Add a source link at the bottom
      blocks.push({
        id: `${entry.slug}-source`, type: 'text', order: order++,
        content: `Originally published at thecaq.org`,
        size: 'sm', alignment: 'left',
        style: { padding: '20px 0', color: '#999' },
      });

      const publishDate = new Date(entry.lastmod);

      await db.insert(posts).values({
        title,
        slug: entry.slug,
        postType: 'blog',
        content: JSON.stringify({ blocks, version: '1.0' }),
        excerpt: metaDesc || paragraphs[0]?.slice(0, 200) || '',
        coverImage: ogImage || null,
        published: false,
        publishedAt: publishDate,
        websiteId: WEBSITE_ID,
        seoTitle: title,
        seoDescription: metaDesc,
        ogImage: ogImage || null,
      });

      console.log(`  [created] ${entry.slug} (${publishDate.toISOString().split('T')[0]})`);
      created++;

      // Small delay to be respectful
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`  [error] ${entry.slug}: ${(err as Error).message}`);
    }
  }

  console.log(`\n=== CONTENT IMPORT COMPLETE ===`);
  console.log(`Created: ${created}, Skipped: ${skipped}`);
  process.exit(0);
}

importContent().catch(err => { console.error(err); process.exit(1); });
