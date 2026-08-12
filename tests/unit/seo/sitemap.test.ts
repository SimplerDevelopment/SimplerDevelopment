// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseSitemap } from '@/lib/seo/sitemap';

describe('parseSitemap — urlset', () => {
  it('extracts loc values from a basic urlset', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc></url>
      </urlset>`;
    const r = parseSitemap(xml);
    expect(r.urls).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(r.childSitemaps).toEqual([]);
  });

  it('ignores sibling fields like lastmod/changefreq/priority', () => {
    const xml = `<urlset>
        <url>
          <loc>https://example.com/a</loc>
          <lastmod>2026-01-01</lastmod>
          <changefreq>daily</changefreq>
          <priority>0.8</priority>
        </url>
      </urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a']);
  });
});

describe('parseSitemap — sitemapindex', () => {
  it('extracts loc values from a sitemapindex as childSitemaps', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
      </sitemapindex>`;
    const r = parseSitemap(xml);
    expect(r.childSitemaps).toEqual(['https://example.com/sitemap-1.xml', 'https://example.com/sitemap-2.xml']);
    expect(r.urls).toEqual([]);
  });
});

describe('parseSitemap — namespaces and whitespace', () => {
  it('handles a namespace-prefixed root and elements', () => {
    const xml = `<ns:urlset xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <ns:url><ns:loc>https://example.com/a</ns:loc></ns:url>
      </ns:urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a']);
  });

  it('tolerates arbitrary whitespace and newlines inside tags', () => {
    const xml = `<urlset>
        <url>

          <loc>
             https://example.com/a
          </loc>

        </url>
      </urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a']);
  });
});

describe('parseSitemap — CDATA', () => {
  it('unwraps CDATA-wrapped loc content', () => {
    const xml = `<urlset><url><loc><![CDATA[https://example.com/a?x=1&y=2]]></loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a?x=1&y=2']);
  });
});

describe('parseSitemap — entity-encoded ampersands', () => {
  it('decodes &amp; in loc content', () => {
    const xml = `<urlset><url><loc>https://example.com/a?x=1&amp;y=2</loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a?x=1&y=2']);
  });

  it('decodes other common XML entities', () => {
    const xml = `<urlset><url><loc>https://example.com/a?q=1&amp;lt;test&amp;gt;</loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a?q=1&lt;test&gt;']);
  });
});

describe('parseSitemap — trimming, dedup, order', () => {
  it('trims surrounding whitespace from loc values', () => {
    const xml = `<urlset><url><loc>   https://example.com/a   </loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a']);
  });

  it('dedupes repeated URLs while preserving first-seen order', () => {
    const xml = `<urlset>
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc></url>
        <url><loc>https://example.com/a</loc></url>
      </urlset>`;
    expect(parseSitemap(xml).urls).toEqual(['https://example.com/a', 'https://example.com/b']);
  });
});

describe('parseSitemap — malformed input', () => {
  it('never throws on garbage input', () => {
    expect(() => parseSitemap('not xml at all')).not.toThrow();
    expect(() => parseSitemap('<urlset><url><loc>unterminated')).not.toThrow();
    expect(() => parseSitemap('')).not.toThrow();
  });

  it('returns empty arrays for a completely empty document', () => {
    const r = parseSitemap('');
    expect(r.urls).toEqual([]);
    expect(r.childSitemaps).toEqual([]);
  });

  it('best-effort extracts loc values from an unclosed urlset via fallback scan', () => {
    const xml = `<urlset><url><loc>https://example.com/a</loc>`; // missing closing </url></urlset>
    const r = parseSitemap(xml);
    expect(r.urls).toContain('https://example.com/a');
  });

  it('routes fallback-scanned locs to childSitemaps when the doc is a sitemapindex', () => {
    const xml = `<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc>`; // truncated
    const r = parseSitemap(xml);
    expect(r.childSitemaps).toContain('https://example.com/s1.xml');
    expect(r.urls).toEqual([]);
  });
});
