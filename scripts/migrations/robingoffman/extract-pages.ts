// Extract content from each Wix page via raw HTML fetch.
// Wix renders post body + title text into the SSR HTML — no playwright required for content.
// We still need the home page hero image which we already grabbed via playwright.

import * as fs from 'fs';
import * as path from 'path';

interface PortfolioItem {
  slug: string;
  title: string;
  sourcePath: string;
  description?: string;
  credits?: string[];
  tags?: string[];
  coverImage?: string;
  images: { src: string; alt?: string }[];
}

const PORTFOLIO: Array<{ slug: string; title: string; sourcePath: string; coverImage: string }> = [
  { slug: 'sip-n-glo-juicery', title: 'Sip-N-Glo Juicery', sourcePath: '/portfolio-collections/my-portfolio/sip-n-glo-juicery',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_38b9caea9d6a4347b36fa9f44db3c3d6~mv2.jpg' },
  { slug: 'designing-brand-identity-6th-edition', title: 'Designing Brand Identity 6th Edition', sourcePath: '/portfolio-collections/my-portfolio/designing-brand-identity-6th-edition',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_a909d3b898244b2b8718f08d4a0b3a75~mv2.png' },
  { slug: 'three-sticks-golf', title: 'Three Sticks Golf', sourcePath: '/portfolio-collections/my-portfolio/three-sticks-golf',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_28d80a8d329e4230a159d64d4a21dbc3~mv2.png' },
  { slug: 'aizer-health', title: 'Aizer Health', sourcePath: '/portfolio-collections/my-portfolio/aizer-health',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_3ec12c8c8dac465a949944da4033764a~mv2.png' },
  { slug: 'designing-brand-identity-5th-edition', title: 'Designing Brand Identity 5th Edition', sourcePath: '/portfolio-collections/my-portfolio/designing-brand-identity-5th-edition',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_c595024389ff4312a065d237d67349c7~mv2.jpg' },
  { slug: 'eisenhower-fellowships', title: 'Eisenhower Fellowships Impact Report', sourcePath: '/portfolio-collections/my-portfolio/project-title-6',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_544355b48d464e8f85162fcfa1335c5a~mv2.png' },
  { slug: 'metamorphosis', title: 'Metamorphosis', sourcePath: '/portfolio-collections/my-portfolio/metamorphosis',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_ec4155a99053493c8ba73fb235e8b96a~mv2.png' },
  { slug: 'mortgagecs', title: 'MortgageCS', sourcePath: '/portfolio-collections/my-portfolio/mortgagecs',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_67cd9e9965ad4731a053597f95aef40d~mv2.png' },
  { slug: 'bari-bettys-gluten-free-baking', title: "Bari & Betty's Gluten Free Baking", sourcePath: '/portfolio-collections/my-portfolio/bari-bettys-gluten-free-baking-b82880',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_face33f99dcd4d3ea1dedf246561a0b2~mv2.png' },
  { slug: 'cocktails-against-cancer', title: 'Cocktails Against Cancer', sourcePath: '/portfolio-collections/my-portfolio/cocktails-against-cancer',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_e9c4a592ee2a4cd1901fa250a8189ba7~mv2.jpg' },
  { slug: 'temple-senior-showcase', title: 'Temple University, Senior Showcase', sourcePath: '/portfolio-collections/my-portfolio/project-title-6-1',
    coverImage: 'https://static.wixstatic.com/media/1ddcb0_3b2eb86c13534f0a9598b8cf21ffff38~mv2.png' },
];

const BASE = 'https://www.robingoffman.com';

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function extractMeta(html: string, prop: string): string | undefined {
  // og: and twitter: meta
  const re = new RegExp(`<meta[^>]+(?:property|name)="(?:og:|twitter:)${prop}"[^>]+content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? decode(m[1]) : undefined;
}

function extractAllImages(html: string): { src: string; alt?: string }[] {
  // Wix images: match every wixstatic media URL, capture src and any preceding alt attribute
  const found = new Map<string, { src: string; alt?: string }>();
  // Style backgrounds
  const styleRe = /background-image:\s*url\(["']?(https:\/\/static\.wixstatic\.com\/media\/[^"')]+)["']?\)/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html))) {
    const src = stripTransform(m[1]);
    if (!found.has(src)) found.set(src, { src });
  }
  // <img> tags
  const imgRe = /<img\b([^>]*)>/gi;
  while ((m = imgRe.exec(html))) {
    const attrs = m[1];
    const srcMatch = attrs.match(/(?:^|\s)src="([^"]+)"/);
    if (!srcMatch || !srcMatch[1].includes('wixstatic.com/media/')) continue;
    const src = stripTransform(srcMatch[1]);
    const altMatch = attrs.match(/(?:^|\s)alt="([^"]*)"/);
    const alt = altMatch ? decode(altMatch[1]) : undefined;
    if (!found.has(src)) found.set(src, { src, alt });
  }
  return [...found.values()];
}

// Strip Wix CDN transform — keep base file URL.
// e.g. ".../media/abc~mv2.jpg/v1/fill/w_1080,h_1080,al_c/abc~mv2.jpg" → ".../media/abc~mv2.jpg"
function stripTransform(url: string): string {
  return url.replace(/\/v1\/[^?]+/, '').split('?')[0];
}

async function extractPage(item: { slug: string; title: string; sourcePath: string; coverImage: string }): Promise<PortfolioItem> {
  const url = BASE + item.sourcePath;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 simplerdev-migration' } });
  const html = await res.text();

  // Wix renders text in <span class="wixui-rich-text__text"> elements. Allow
  // inline tags like <br> inside spans — they get stripped/normalized below.
  // Also match the alternate <p class="font_X wixui-rich-text__text"> wrapper.
  const richSpans: string[] = [];
  const richRe = /<(?:span|p) [^>]*?wixui-rich-text__text[^>]*>((?:[^<]|<br\s*\/?>)+)<\/(?:span|p)>/g;
  let rm: RegExpExecArray | null;
  while ((rm = richRe.exec(html))) {
    const txt = decode(rm[1]).replace(/<br\s*\/?>/g, '\n').trim();
    if (txt && txt !== item.title && !richSpans.includes(txt) && !txt.startsWith('Start adding your projects')) {
      richSpans.push(txt);
    }
  }

  // Description = longest rich-text span (project body)
  const description = richSpans.length ? [...richSpans].sort((a, b) => b.length - a.length)[0] : (extractMeta(html, 'description') || '');

  // Tags = known design disciplines anywhere in the HTML
  const knownTags = ['Graphic Design', 'Photography', 'Brand Identity', 'Packaging', 'Web Design', 'Editorial', 'Illustration', 'Strategy', 'Print', 'UI Design', 'Identity Design', 'Motion'];
  const tags = knownTags.filter(t => new RegExp(`>${t}<`).test(html));

  // Credits = lines matching "Role / Name"
  const credits: string[] = [];
  for (const s of richSpans) {
    if (/\s\/\s[A-Z][a-zA-Z]/.test(s) && s !== description) {
      // multi-line credits like "Art Director / Kathy Mueller\nDesigners / Robin Goffman"
      for (const line of s.split(/\n+/)) {
        const t = line.trim();
        if (t && /\s\/\s/.test(t) && !credits.includes(t)) credits.push(t);
      }
    }
  }
  // Also append trailing credits embedded in description block (some pages)
  const descCreditMatch = description.match(/((?:[A-Z][a-zA-Z &]+\s\/\s[A-Z][A-Za-z .'\-]+\s*\n?)+)$/);
  if (descCreditMatch && credits.length === 0) {
    for (const line of descCreditMatch[1].split(/\n+/)) {
      const t = line.trim();
      if (t) credits.push(t);
    }
  }

  const images = extractAllImages(html);

  return {
    slug: item.slug,
    title: item.title,
    sourcePath: item.sourcePath,
    description,
    credits,
    tags,
    coverImage: stripTransform(item.coverImage),
    images,
  };
}

async function main() {
  const outDir = path.join(__dirname, 'data');
  fs.mkdirSync(outDir, { recursive: true });

  const results: PortfolioItem[] = [];
  for (const item of PORTFOLIO) {
    console.log(`Extracting ${item.slug} (${item.sourcePath})...`);
    try {
      const extracted = await extractPage(item);
      console.log(`  → ${extracted.images.length} images, ${extracted.credits?.length || 0} credits, tags: ${extracted.tags?.join(', ') || '(none)'}`);
      results.push(extracted);
    } catch (e) {
      console.error(`  ✗ ${(e as Error).message}`);
    }
  }

  fs.writeFileSync(path.join(outDir, 'portfolio.json'), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} portfolio items to data/portfolio.json`);

  // Aggregate all unique image URLs for download
  const allImages = new Set<string>();
  for (const r of results) {
    if (r.coverImage) allImages.add(r.coverImage);
    for (const i of r.images) allImages.add(i.src);
  }
  // Add home + about hero
  allImages.add('https://static.wixstatic.com/media/1ddcb0_dbacbfef7a794da0a7e793358441e9ab~mv2.webp'); // logo
  allImages.add('https://static.wixstatic.com/media/1ddcb0_400c280b7d40434288c3a6ceab20e756f000.jpg'); // home hero
  allImages.add('https://static.wixstatic.com/media/1ddcb0_085651c86e014155a6fd6b2b368693fe~mv2.png'); // about hero

  fs.writeFileSync(path.join(outDir, 'all-images.json'), JSON.stringify([...allImages].sort(), null, 2));
  console.log(`Wrote ${allImages.size} unique image URLs to data/all-images.json`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
