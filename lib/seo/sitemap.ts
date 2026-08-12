// Tolerant sitemap XML parsing. Real-world sitemaps arrive with BOMs, bad
// escaping, mixed namespaces, and truncated bodies from a crawl timeout —
// a strict parser throws on all of that and kills the whole crawl run, so
// this is regex-based extraction that degrades gracefully instead of a DOM
// parser that doesn't. No new deps: node-html-parser is available in this
// repo but its HTML parser mishandles XML self-closing/namespaced tags, so
// plain regex is the more predictable tool here.

export type SitemapParseResult = {
  urls: string[];
  childSitemaps: string[];
};

// Matches an element open tag allowing an optional namespace prefix
// (<ns:url>, <url xmlns="...">) — sitemaps in the wild use both.
function blockRegex(tag: string): RegExp {
  return new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}\\s*>`, 'gi');
}

const LOC_RE = /<(?:[\w-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?loc\s*>/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&'); // last: avoid double-decoding "&amp;lt;" etc.
}

function extractLoc(block: string): string | null {
  const m = LOC_RE.exec(block);
  if (!m) return null;
  let raw = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  if (cdata) raw = cdata[1].trim();
  const decoded = decodeEntities(raw);
  return decoded || null;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of list) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function parseSitemap(xml: string): SitemapParseResult {
  const text = (xml ?? '').replace(/^﻿/, '');

  const urls: string[] = [];
  for (const match of text.matchAll(blockRegex('url'))) {
    const loc = extractLoc(match[1]);
    if (loc) urls.push(loc);
  }

  const childSitemaps: string[] = [];
  for (const match of text.matchAll(blockRegex('sitemap'))) {
    const loc = extractLoc(match[1]);
    if (loc) childSitemaps.push(loc);
  }

  // Malformed input (unclosed <url>/<sitemap> tags, truncated download) —
  // fall back to scanning every <loc> and routing by document type so we
  // still return something instead of an empty result.
  if (urls.length === 0 && childSitemaps.length === 0) {
    const isIndex = /<(?:[\w-]+:)?sitemapindex\b/i.test(text);
    const target = isIndex ? childSitemaps : urls;
    for (const match of text.matchAll(new RegExp(LOC_RE.source, 'gi'))) {
      const raw = match[1].trim();
      const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
      const decoded = decodeEntities(cdata ? cdata[1].trim() : raw);
      if (decoded) target.push(decoded);
    }
  }

  return { urls: dedupe(urls), childSitemaps: dedupe(childSitemaps) };
}
