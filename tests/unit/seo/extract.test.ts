// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractPage, type ExtractInput } from '@/lib/seo/extract';
import { urlHash } from '@/lib/seo/url';

function makeInput(overrides: Partial<ExtractInput> = {}): ExtractInput {
  return {
    html: '<!DOCTYPE html><html><head><title>Default</title></head><body><h1>Hi</h1></body></html>',
    url: 'https://example.com/page',
    baseUrl: 'https://example.com',
    httpStatus: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    redirectChain: [],
    responseTimeMs: 120,
    responseBytes: 2048,
    depth: 1,
    discoveredFrom: 'link',
    robotsBlocked: false,
    ...overrides,
  };
}

describe('extractPage', () => {
  it('extracts every field on a full happy-path page', () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>  Best Widgets Online  </title>
  <meta name="description" content="Buy the best widgets online today.">
  <link rel="canonical" href="https://example.com/page">
  <meta property="og:title" content="Best Widgets">
  <meta property="og:description" content="Widgets for everyone">
  <meta property="og:image" content="https://example.com/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="alternate" hreflang="es" href="https://example.com/es/page">
  <link rel="alternate" hreflang="fr" href="https://example.com/fr/page">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Widget"}</script>
</head>
<body>
  <h1>Best Widgets</h1>
  <h2>Section One</h2>
  <h2>Section Two</h2>
  <p>Some visible paragraph text.</p>
  <a href="/about">About Us</a>
  <a href="https://external.example.org/partner">Partner Site</a>
  <img src="/hero.png" alt="Hero image">
  <img src="/icon.png" alt="">
  <iframe src="https://example.com/embed"></iframe>
</body>
</html>`;

    const { page, links } = extractPage(
      makeInput({ html, url: 'https://example.com/page' })
    );

    expect(page.url).toBe('https://example.com/page');
    expect(page.urlHash).toBe(urlHash('https://example.com/page'));
    expect(page.httpStatus).toBe(200);
    expect(page.finalUrl).toBeNull();
    expect(page.redirectChain).toEqual([]);
    expect(page.contentType).toBe('text/html; charset=utf-8');
    expect(page.responseTimeMs).toBe(120);
    expect(page.responseBytes).toBe(2048);
    expect(page.depth).toBe(1);
    expect(page.discoveredFrom).toBe('link');

    expect(page.title).toBe('Best Widgets Online');
    expect(page.metaDescription).toBe('Buy the best widgets online today.');
    expect(page.h1).toBe('Best Widgets');
    expect(page.h1Count).toBe(1);
    expect(page.lang).toBe('en');

    expect(page.canonicalUrl).toBe('https://example.com/page');
    expect(page.indexable).toBe(true);
    expect(page.indexabilityReason).toBeNull();

    expect(page.wordCount).toBeGreaterThan(0);
    expect(page.contentHash).toMatch(/^[0-9a-f]{64}$/);

    expect(page.internalLinksCount).toBe(1);
    expect(page.externalLinksCount).toBe(1);
    expect(page.nofollowLinksCount).toBe(0);
    expect(links).toHaveLength(2);
    expect(links).toContainEqual({
      href: 'https://example.com/about',
      anchorText: 'About Us',
      nofollow: false,
      isInternal: true,
    });
    expect(links).toContainEqual({
      href: 'https://external.example.org/partner',
      anchorText: 'Partner Site',
      nofollow: false,
      isInternal: false,
    });

    expect(page.imagesCount).toBe(2);
    expect(page.imagesMissingAlt).toBe(1);

    expect(page.meta.h2).toEqual(['Section One', 'Section Two']);
    expect(page.meta.ogTitle).toBe('Best Widgets');
    expect(page.meta.ogDescription).toBe('Widgets for everyone');
    expect(page.meta.ogImage).toBe('https://example.com/og.png');
    expect(page.meta.twitterCard).toBe('summary_large_image');
    expect(page.meta.jsonLdTypes).toEqual(['Product']);
    expect(page.meta.jsonLdParseErrors).toBe(0);
    expect(page.meta.hreflang).toEqual([
      { lang: 'es', href: 'https://example.com/es/page' },
      { lang: 'fr', href: 'https://example.com/fr/page' },
    ]);
    expect(page.meta.iframeCount).toBe(1);
    expect(page.meta.canonicalCount).toBe(1);
    expect(page.meta.metaRefresh).toBe(false);
    expect(page.meta.insecureResourceCount).toBe(0);
  });

  it('flags noindex-meta from <meta name="robots">, taking precedence over a plain 200', () => {
    const html =
      '<!DOCTYPE html><html><head><title>Noindex Page</title>' +
      '<meta name="robots" content="noindex, follow"></head><body><h1>Hi</h1></body></html>';

    const { page } = extractPage(makeInput({ html }));

    expect(page.indexable).toBe(false);
    expect(page.indexabilityReason).toBe('noindex-meta');
    expect(page.meta.robotsMeta).toBe('noindex, follow');
  });

  it('flags noindex-meta from the x-robots-tag header when no meta tag is present', () => {
    const html =
      '<!DOCTYPE html><html><head><title>Header Noindex</title></head><body><h1>Hi</h1></body></html>';

    const { page } = extractPage(
      makeInput({
        html,
        headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' },
      })
    );

    expect(page.indexable).toBe(false);
    expect(page.indexabilityReason).toBe('noindex-meta');
    expect(page.meta.robotsMeta).toBeNull();
    expect(page.meta.headers).toEqual({ 'x-robots-tag': 'noindex', 'content-type': 'text/html' });
  });

  it('resolves canonical-elsewhere and reports the resolved canonical URL', () => {
    const html =
      '<!DOCTYPE html><html><head><title>Dupe</title>' +
      '<link rel="canonical" href="/canonical-target"></head><body><h1>Hi</h1></body></html>';

    const { page } = extractPage(makeInput({ html, url: 'https://example.com/dupe-page' }));

    expect(page.canonicalUrl).toBe('https://example.com/canonical-target');
    expect(page.indexable).toBe(false);
    expect(page.indexabilityReason).toBe('canonical-elsewhere');
  });

  it('resolves relative links and splits internal vs. external (including a www variant)', () => {
    const html = `<!DOCTYPE html><html><body>
      <a href="/relative-path">Relative</a>
      <a href="https://example.com/absolute-internal">Absolute Internal</a>
      <a href="https://other-domain.com/ext">External</a>
      <a href="https://www.example.com/www-variant">WWW Variant</a>
    </body></html>`;

    const { page, links } = extractPage(makeInput({ html, url: 'https://example.com/start' }));

    expect(links).toHaveLength(4);
    expect(links.map((l) => l.href)).toEqual([
      'https://example.com/relative-path',
      'https://example.com/absolute-internal',
      'https://other-domain.com/ext',
      'https://www.example.com/www-variant',
    ]);
    expect(page.internalLinksCount).toBe(3);
    expect(page.externalLinksCount).toBe(1);
  });

  it('detects rel=nofollow on individual links and totals nofollowLinksCount', () => {
    const html = `<!DOCTYPE html><html><body>
      <a href="/a" rel="nofollow">A</a>
      <a href="/b" rel="noopener nofollow">B</a>
      <a href="/c">C</a>
    </body></html>`;

    const { page, links } = extractPage(makeInput({ html }));

    expect(page.nofollowLinksCount).toBe(2);
    expect(links.find((l) => l.href.endsWith('/a'))?.nofollow).toBe(true);
    expect(links.find((l) => l.href.endsWith('/b'))?.nofollow).toBe(true);
    expect(links.find((l) => l.href.endsWith('/c'))?.nofollow).toBe(false);
  });

  it('counts images missing alt text (absent, empty, or whitespace-only)', () => {
    const html = `<!DOCTYPE html><html><body>
      <img src="1.png" alt="Cat">
      <img src="2.png" alt="">
      <img src="3.png">
      <img src="4.png" alt="   ">
    </body></html>`;

    const { page } = extractPage(makeInput({ html }));

    expect(page.imagesCount).toBe(4);
    expect(page.imagesMissingAlt).toBe(3);
  });

  it('collects JSON-LD @type values including @graph, tolerating a malformed block', () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Article","BlogPosting"]}]}</script>
      <script type="application/ld+json">{ this is not valid json }</script>
    </head><body><h1>Hi</h1></body></html>`;

    const { page } = extractPage(makeInput({ html }));

    expect(new Set(page.meta.jsonLdTypes)).toEqual(
      new Set(['Organization', 'WebPage', 'Article', 'BlogPosting'])
    );
    expect(page.meta.jsonLdParseErrors).toBe(1);
  });

  it('counts insecure http:// subresources only when the page itself is https', () => {
    const html = `<!DOCTYPE html><html><body>
      <img src="http://insecure.example.com/pic.png">
      <script src="http://insecure.example.com/script.js"></script>
      <link rel="stylesheet" href="http://insecure.example.com/style.css">
      <img src="https://secure.example.com/pic2.png">
    </body></html>`;

    const httpsResult = extractPage(makeInput({ html, url: 'https://example.com/secure-page' }));
    expect(httpsResult.page.meta.insecureResourceCount).toBe(3);

    const httpResult = extractPage(
      makeInput({ html, url: 'http://example.com/insecure-page', baseUrl: 'http://example.com' })
    );
    expect(httpResult.page.meta.insecureResourceCount).toBe(0);
  });

  it('returns a minimal PageExtract for a non-HTML response', () => {
    const { page, links } = extractPage(
      makeInput({
        html: '%PDF-1.4 binary garbage',
        headers: { 'content-type': 'application/pdf' },
      })
    );

    expect(page.title).toBeNull();
    expect(page.metaDescription).toBeNull();
    expect(page.h1).toBeNull();
    expect(page.h1Count).toBe(0);
    expect(page.wordCount).toBe(0);
    expect(page.contentHash).toBeNull();
    expect(page.imagesCount).toBe(0);
    expect(page.internalLinksCount).toBe(0);
    expect(page.meta).toEqual({});
    expect(links).toEqual([]);
    // A 200 PDF with no signals is still indexable — the precedence chain
    // just has nothing to disqualify it on.
    expect(page.indexable).toBe(true);
    expect(page.indexabilityReason).toBeNull();
  });

  it('treats an empty html body as non-HTML even with an html content-type', () => {
    const { page } = extractPage(makeInput({ html: '   ', headers: { 'content-type': 'text/html' } }));

    expect(page.title).toBeNull();
    expect(page.wordCount).toBe(0);
    expect(page.meta).toEqual({});
  });

  it('flags a 3xx response as non-indexable ("redirect") and records finalUrl from the chain', () => {
    const { page } = extractPage(
      makeInput({
        httpStatus: 301,
        url: 'https://example.com/redirect-source',
        redirectChain: ['https://example.com/redirect-source', 'https://example.com/final-destination'],
      })
    );

    expect(page.indexable).toBe(false);
    expect(page.indexabilityReason).toBe('redirect');
    expect(page.finalUrl).toBe('https://example.com/final-destination');
  });

  it('leaves finalUrl null when the redirect chain is empty', () => {
    const { page } = extractPage(makeInput({ httpStatus: 302, redirectChain: [] }));

    expect(page.indexabilityReason).toBe('redirect');
    expect(page.finalUrl).toBeNull();
  });

  it('prioritizes error-status over every later precedence check', () => {
    const html =
      '<!DOCTYPE html><html><head><title>Broken</title>' +
      '<meta name="robots" content="noindex"></head><body><h1>Hi</h1></body></html>';

    const { page } = extractPage(makeInput({ html, httpStatus: 404 }));

    expect(page.indexable).toBe(false);
    expect(page.indexabilityReason).toBe('error-status');
  });
});
