// Per-page SEO extraction: given a fetched page's HTML + response metadata,
// produce the PageExtract row and its outbound link list. Pure and
// synchronous — no I/O, no DB — so the crawler calls it once per fetch and
// the rules engine never has to re-parse HTML.

import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import { normalizeUrl, urlHash } from './url';
import type { ExtractResult, PageExtract } from './types';
import {
  attr,
  trimmedTextOrNull,
  collapseWhitespace,
  collectJsonLdTypes,
  extractLinks,
  countInsecureResources,
  pickHeaderSubset,
  computeIndexability,
} from './extract-helpers';

export type ExtractInput = {
  html: string;
  url: string; // final normalized URL of the page
  baseUrl: string; // normalized origin of the audited site
  httpStatus: number;
  headers: Record<string, string>; // lowercase keys
  redirectChain: string[];
  responseTimeMs: number;
  responseBytes: number;
  depth: number;
  discoveredFrom: 'seed' | 'link' | 'sitemap' | 'redirect';
  robotsBlocked: boolean;
  ignoreQueryParams?: boolean;
};

// node-html-parser options shared with the site's other HTML-parsing call
// site (lib/html-asset-import.ts) — block script/style/pre content as raw
// text so JSON-LD/CSS bodies containing `<`/`>`-looking strings don't
// confuse the tag parser.
const PARSE_OPTIONS = {
  voidTag: { closingSlash: true },
  blockTextElements: { script: true, style: true, pre: true },
} as const;

export function extractPage(input: ExtractInput): ExtractResult {
  const { url, baseUrl, httpStatus, headers, redirectChain, ignoreQueryParams } = input;
  const contentType = headers['content-type'] ?? null;
  const isHtml = !!contentType && contentType.toLowerCase().includes('html') && input.html.trim().length > 0;

  // redirectChain's last hop is where the crawler actually landed; `url` is
  // this row's own address, which for a redirect hop's own row is the
  // address that *returned* the redirect, not the destination.
  const chainLast = redirectChain.length > 0 ? redirectChain[redirectChain.length - 1] : null;
  const finalUrl = chainLast && chainLast !== url ? chainLast : null;

  if (!isHtml) {
    const { indexable, indexabilityReason } = computeIndexability({
      httpStatus,
      robotsBlocked: input.robotsBlocked,
      robotsMetaContent: null,
      xRobotsTagHeader: headers['x-robots-tag'],
      canonicalUrl: null,
      url,
    });
    const page: PageExtract = {
      url,
      urlHash: urlHash(url),
      httpStatus,
      finalUrl,
      redirectChain,
      contentType,
      responseTimeMs: input.responseTimeMs,
      responseBytes: input.responseBytes,
      depth: input.depth,
      discoveredFrom: input.discoveredFrom,
      indexable,
      indexabilityReason,
      canonicalUrl: null,
      title: null,
      metaDescription: null,
      h1: null,
      h1Count: 0,
      wordCount: 0,
      lang: null,
      contentHash: null,
      internalLinksCount: 0,
      externalLinksCount: 0,
      nofollowLinksCount: 0,
      imagesCount: 0,
      imagesMissingAlt: 0,
      meta: {},
    };
    return { page, links: [] };
  }

  const root = parse(input.html, PARSE_OPTIONS);

  const title = trimmedTextOrNull(root.querySelector('title'));
  const metaDescription = attr(root.querySelector('meta[name="description"]'), 'content');
  const h1 = trimmedTextOrNull(root.querySelector('h1'));
  const h1Count = root.querySelectorAll('h1').length;
  const lang = attr(root.querySelector('html'), 'lang');

  const canonicalEls = root.querySelectorAll('link[rel="canonical"]');
  const canonicalCount = canonicalEls.length;
  const rawCanonicalHref = canonicalEls[0] ? attr(canonicalEls[0], 'href') : null;
  const canonicalUrl = rawCanonicalHref ? normalizeUrl(rawCanonicalHref, url, { ignoreQueryParams }) : null;

  const robotsMetaContent = attr(root.querySelector('meta[name="robots"]'), 'content');

  const links = extractLinks(root, url, baseUrl, ignoreQueryParams);
  const internalLinksCount = links.filter((l) => l.isInternal).length;
  const externalLinksCount = links.filter((l) => !l.isInternal).length;
  const nofollowLinksCount = links.filter((l) => l.nofollow).length;

  const imgs = root.querySelectorAll('img');
  const imagesCount = imgs.length;
  const imagesMissingAlt = imgs.filter((img) => {
    const alt = img.getAttribute('alt');
    return alt === undefined || alt.trim().length === 0;
  }).length;

  const h2 = root.querySelectorAll('h2').slice(0, 5).map((el) => el.text.trim());
  const ogTitle = attr(root.querySelector('meta[property="og:title"]'), 'content');
  const ogDescription = attr(root.querySelector('meta[property="og:description"]'), 'content');
  const ogImage = attr(root.querySelector('meta[property="og:image"]'), 'content');
  const twitterCard = attr(root.querySelector('meta[name="twitter:card"]'), 'content');

  const jsonLdTypes = new Set<string>();
  let jsonLdParseErrors = 0;
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      collectJsonLdTypes(JSON.parse(script.rawText), jsonLdTypes);
    } catch {
      jsonLdParseErrors++;
    }
  }

  const hreflang = root
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .map((el) => ({ lang: attr(el, 'hreflang') ?? '', href: attr(el, 'href') ?? '' }))
    .filter((h) => h.lang && h.href);

  const iframeCount = root.querySelectorAll('iframe').length;
  const metaRefresh = root
    .querySelectorAll('meta[http-equiv]')
    .some((el) => (attr(el, 'http-equiv') ?? '').toLowerCase() === 'refresh');
  const insecureResourceCount = countInsecureResources(root, url);

  // Visible-text pass last — strips script/style/noscript in place, which
  // would otherwise fold their content into the word count / content hash.
  for (const el of root.querySelectorAll('script, style, noscript')) el.remove();
  const bodyEl = root.querySelector('body') ?? root;
  const visibleText = collapseWhitespace(bodyEl.text);
  const wordCount = visibleText.length > 0 ? visibleText.split(' ').filter(Boolean).length : 0;
  const contentHash = createHash('sha256').update(visibleText).digest('hex');

  const { indexable, indexabilityReason } = computeIndexability({
    httpStatus,
    robotsBlocked: input.robotsBlocked,
    robotsMetaContent,
    xRobotsTagHeader: headers['x-robots-tag'],
    canonicalUrl,
    url,
  });

  const page: PageExtract = {
    url,
    urlHash: urlHash(url),
    httpStatus,
    finalUrl,
    redirectChain,
    contentType,
    responseTimeMs: input.responseTimeMs,
    responseBytes: input.responseBytes,
    depth: input.depth,
    discoveredFrom: input.discoveredFrom,
    indexable,
    indexabilityReason,
    canonicalUrl,
    title,
    metaDescription,
    h1,
    h1Count,
    wordCount,
    lang,
    contentHash,
    internalLinksCount,
    externalLinksCount,
    nofollowLinksCount,
    imagesCount,
    imagesMissingAlt,
    meta: {
      h2,
      ogTitle,
      ogDescription,
      ogImage,
      twitterCard,
      jsonLdTypes: [...jsonLdTypes],
      hreflang,
      robotsMeta: robotsMetaContent,
      iframeCount,
      headers: pickHeaderSubset(headers),
      canonicalCount,
      metaRefresh,
      insecureResourceCount,
      jsonLdParseErrors,
    },
  };

  return { page, links };
}
