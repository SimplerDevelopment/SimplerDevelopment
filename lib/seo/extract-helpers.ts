// Small DOM/string helpers used by extract.ts. Split out so the
// orchestration there reads as a flat list of field assignments instead of
// interleaving parsing logic with the PageExtract shape.

import type { HTMLElement } from 'node-html-parser';
import { normalizeUrl, isInternalUrl } from './url';
import type { ExtractedLink } from './types';

// node-html-parser's getAttribute() returns `string | undefined`; the rest
// of this module (and the DB columns downstream) works in `string | null`.
export function attr(el: HTMLElement | null | undefined, name: string): string | null {
  return el?.getAttribute(name) ?? null;
}

export function trimmedTextOrNull(el: HTMLElement | null | undefined): string | null {
  if (!el) return null;
  return el.text.trim();
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// JSON-LD nests types inside @graph arrays and allows @type to be a string
// or a string[]; some sites also emit a top-level array of documents instead
// of one object. Walk tolerant of all three shapes.
export function collectJsonLdTypes(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdTypes(item, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  const type = obj['@type'];
  if (typeof type === 'string') out.add(type);
  else if (Array.isArray(type)) {
    for (const t of type) if (typeof t === 'string') out.add(t);
  }
  if ('@graph' in obj) collectJsonLdTypes(obj['@graph'], out);
}

function hasNofollow(rel: string | null): boolean {
  if (!rel) return false;
  return rel.toLowerCase().split(/\s+/).includes('nofollow');
}

// Every <a href>, resolved + normalized against the page URL. Hrefs that
// don't resolve to a crawlable http(s) URL (mailto:, javascript:, malformed)
// are dropped rather than producing a broken link row.
export function extractLinks(
  root: HTMLElement,
  pageUrl: string,
  baseUrl: string,
  ignoreQueryParams: boolean | undefined
): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href) continue;
    const resolved = normalizeUrl(href, pageUrl, { ignoreQueryParams });
    if (!resolved) continue;
    const text = a.text.trim().slice(0, 512);
    links.push({
      href: resolved,
      anchorText: text.length > 0 ? text : null,
      nofollow: hasNofollow(attr(a, 'rel')),
      isInternal: isInternalUrl(resolved, baseUrl),
    });
  }
  return links;
}

// http:// subresources referenced from an https page — a mixed-content
// signal. Only meaningful (and only counted) when the page itself is https.
export function countInsecureResources(root: HTMLElement, pageUrl: string): number {
  if (!pageUrl.toLowerCase().startsWith('https://')) return 0;
  const targets: Array<[string, string]> = [
    ['img[src]', 'src'],
    ['script[src]', 'src'],
    ['link[href]', 'href'],
  ];
  let count = 0;
  for (const [selector, attrName] of targets) {
    for (const el of root.querySelectorAll(selector)) {
      const v = el.getAttribute(attrName);
      if (v && v.toLowerCase().startsWith('http://')) count++;
    }
  }
  return count;
}

// Only these headers matter to the rules engine — persisting the full
// response header set would bloat every page row for no benefit.
const PERSISTED_HEADERS = ['x-robots-tag', 'strict-transport-security', 'content-type'] as const;

export function pickHeaderSubset(headers: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const key of PERSISTED_HEADERS) {
    const v = headers[key];
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Indexability precedence, first match wins. Shared by both the HTML and
// non-HTML extraction paths — every check but noindex-meta's DOM half is
// available without a parsed body, and noindex-meta also has a header half.
export function computeIndexability(input: {
  httpStatus: number;
  robotsBlocked: boolean;
  robotsMetaContent: string | null;
  xRobotsTagHeader: string | undefined;
  canonicalUrl: string | null;
  url: string;
}): { indexable: boolean; indexabilityReason: string | null } {
  const { httpStatus, robotsBlocked, robotsMetaContent, xRobotsTagHeader, canonicalUrl, url } = input;
  if (httpStatus >= 400) return { indexable: false, indexabilityReason: 'error-status' };
  if (robotsBlocked) return { indexable: false, indexabilityReason: 'robots-blocked' };
  const noindex =
    (robotsMetaContent?.toLowerCase().includes('noindex') ?? false) ||
    (xRobotsTagHeader?.toLowerCase().includes('noindex') ?? false);
  if (noindex) return { indexable: false, indexabilityReason: 'noindex-meta' };
  if (canonicalUrl && canonicalUrl !== url) return { indexable: false, indexabilityReason: 'canonical-elsewhere' };
  if (httpStatus >= 300 && httpStatus < 400) return { indexable: false, indexabilityReason: 'redirect' };
  return { indexable: true, indexabilityReason: null };
}
