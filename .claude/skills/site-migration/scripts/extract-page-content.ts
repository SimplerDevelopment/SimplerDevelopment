/**
 * Page Content Extraction Template
 *
 * Extracts structured content from a URL for block conversion.
 * Copy into your migration directory and customize for the specific site.
 */

interface ExtractedSection {
  type: 'hero' | 'heading' | 'text' | 'image' | 'stats' | 'cards' | 'testimonial' | 'cta' | 'list';
  content: Record<string, unknown>;
}

interface ExtractedPage {
  url: string;
  title: string;
  metaDescription: string;
  ogImage: string;
  sections: ExtractedSection[];
}

export async function extractPage(url: string): Promise<ExtractedPage> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SimplerDev-Migration/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();

  // Extract metadata
  const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || '';
  const metaDescription = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)?.[1] || '';
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i)?.[1] || '';

  // Strip non-content elements
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Find main content area
  const mainMatch = cleaned.match(/<main[\s\S]*?<\/main>/i)
    || cleaned.match(/<article[\s\S]*?<\/article>/i)
    || cleaned.match(/<div[^>]*(?:class|id)=["'][^"']*(?:content|main|page|wrapper)[^"']*["'][\s\S]*?<\/div>/i);

  const contentHtml = mainMatch ? mainMatch[0] : cleaned;

  // Extract sections by analyzing the HTML structure
  const sections: ExtractedSection[] = [];

  // Extract headings and their following content
  const headingMatches = contentHtml.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const match of headingMatches) {
    const level = parseInt(match[1][1]);
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    if (text) {
      sections.push({
        type: level === 1 ? 'hero' : 'heading',
        content: { text, level },
      });
    }
  }

  // Extract paragraphs
  const paraMatches = contentHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const match of paraMatches) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text && text.length > 20) {
      sections.push({ type: 'text', content: { text } });
    }
  }

  // Extract images
  const imgMatches = contentHtml.matchAll(/<img[^>]*src=["'](.*?)["'][^>]*(?:alt=["'](.*?)["'])?/gi);
  for (const match of imgMatches) {
    const src = match[1];
    const alt = match[2] || '';
    if (src && !src.includes('data:image') && !src.includes('pixel') && !src.includes('tracking')) {
      const absoluteSrc = src.startsWith('http') ? src : new URL(src, url).href;
      sections.push({ type: 'image', content: { src: absoluteSrc, alt } });
    }
  }

  return { url, title, metaDescription, ogImage, sections };
}

// CLI usage
if (process.argv[2]) {
  extractPage(process.argv[2]).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
