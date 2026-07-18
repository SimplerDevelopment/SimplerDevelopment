// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';

describe('cleanEmbedHtml', () => {
  describe('full document input (with <body>)', () => {
    it('prepends a DOCTYPE and extracts body innerHTML', () => {
      const input = `<!DOCTYPE html><html><head><title>t</title></head><body><div id="x">hi</div></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out.startsWith('<!DOCTYPE html>\n')).toBe(true);
      expect(out).toContain('<div id="x">hi</div>');
      // <title> is not on the allowed-head list, so it should NOT be carried over.
      expect(out).not.toContain('<title>');
      // <html>/<body> wrappers are stripped.
      expect(out).not.toContain('<body');
      expect(out).not.toContain('<html');
    });

    it('strips <nav> and <header> from the body', () => {
      const input = `<html><body><nav>navlinks</nav><header>topbar</header><main>keep me</main></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('<main>keep me</main>');
      expect(out).not.toContain('navlinks');
      expect(out).not.toContain('topbar');
      expect(out).not.toContain('<nav');
      expect(out).not.toContain('<header');
    });

    it('also strips <nav>/<header> when they appear inside the head selector scope (defensive)', () => {
      // nav inside body, plus a header sibling — both must go.
      const input = `<html><body><header><h1>site</h1></header><p>body text</p><nav><a>x</a></nav></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('<p>body text</p>');
      expect(out).not.toContain('<header');
      expect(out).not.toContain('<nav');
      expect(out).not.toContain('site');
    });

    it('preserves <style> tags from the head', () => {
      const input = `<html><head><style>.a{color:red}</style></head><body><p>x</p></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('<style>.a{color:red}</style>');
      expect(out).toContain('<p>x</p>');
    });

    it('preserves <script> tags from the head', () => {
      const input = `<html><head><script>window.X=1;</script></head><body><p>y</p></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('<script>window.X=1;</script>');
      expect(out).toContain('<p>y</p>');
    });

    it('preserves stylesheet, preconnect, preload, and dns-prefetch links from the head', () => {
      const input = `
        <html>
          <head>
            <link rel="stylesheet" href="/a.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preload" href="/b.js" as="script">
            <link rel="dns-prefetch" href="//c.example">
            <link rel="icon" href="/favicon.ico">
            <link rel="canonical" href="https://x.test/">
            <meta name="description" content="nope">
          </head>
          <body><p>z</p></body>
        </html>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('rel="stylesheet"');
      expect(out).toContain('rel="preconnect"');
      expect(out).toContain('rel="preload"');
      expect(out).toContain('rel="dns-prefetch"');
      // icon/canonical/meta are intentionally excluded.
      expect(out).not.toContain('rel="icon"');
      expect(out).not.toContain('rel="canonical"');
      expect(out).not.toContain('<meta');
      expect(out).toContain('<p>z</p>');
    });

    it('handles a body without any <head> element', () => {
      const input = `<html><body><p>only body</p></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out.startsWith('<!DOCTYPE html>\n')).toBe(true);
      expect(out).toContain('<p>only body</p>');
    });

    it('handles an empty body', () => {
      const input = `<html><head><style>.x{}</style></head><body></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out.startsWith('<!DOCTYPE html>\n')).toBe(true);
      expect(out).toContain('<style>.x{}</style>');
    });

    it('preserves multiple head assets in source order, joined by newlines', () => {
      const input = `<html><head><style>.a{}</style><script>1</script><link rel="stylesheet" href="/c.css"></head><body><p>hi</p></body></html>`;
      const out = cleanEmbedHtml(input);
      const styleIdx = out.indexOf('<style>.a{}</style>');
      const scriptIdx = out.indexOf('<script>1</script>');
      const linkIdx = out.indexOf('rel="stylesheet"');
      expect(styleIdx).toBeGreaterThan(-1);
      expect(scriptIdx).toBeGreaterThan(-1);
      expect(linkIdx).toBeGreaterThan(-1);
      expect(styleIdx).toBeLessThan(scriptIdx);
      expect(scriptIdx).toBeLessThan(linkIdx);
    });
  });

  describe('fragment input (no <body>)', () => {
    it('adds a DOCTYPE when the fragment has none', () => {
      const input = `<div>hello</div>`;
      const out = cleanEmbedHtml(input);
      expect(out.startsWith('<!DOCTYPE html>\n')).toBe(true);
      expect(out).toContain('<div>hello</div>');
    });

    it('preserves an existing DOCTYPE without doubling it', () => {
      const input = `<!DOCTYPE html>\n<div>already</div>`;
      const out = cleanEmbedHtml(input);
      // Exactly one DOCTYPE.
      const matches = out.match(/<!DOCTYPE/gi) || [];
      expect(matches.length).toBe(1);
      expect(out).toContain('<div>already</div>');
    });

    it('trims leading whitespace before deciding about the DOCTYPE', () => {
      const input = `   \n  <!DOCTYPE html>\n<section>s</section>`;
      const out = cleanEmbedHtml(input);
      const matches = out.match(/<!DOCTYPE/gi) || [];
      expect(matches.length).toBe(1);
      expect(out).toContain('<section>s</section>');
    });

    it('treats DOCTYPE case-insensitively', () => {
      const input = `<!doctype HTML>\n<p>p</p>`;
      const out = cleanEmbedHtml(input);
      const matches = out.match(/<!DOCTYPE/gi) || [];
      expect(matches.length).toBe(1);
    });

    it('strips <nav>/<header> from fragment inputs too', () => {
      const input = `<nav>n</nav><header>h</header><article>keep</article>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('<article>keep</article>');
      expect(out).not.toContain('<nav');
      expect(out).not.toContain('<header');
    });

    it('handles an empty string by returning a bare DOCTYPE', () => {
      const out = cleanEmbedHtml('');
      expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    });

    it('handles whitespace-only input', () => {
      const out = cleanEmbedHtml('   \n\t  ');
      // After trimStart, the fragment has no DOCTYPE, so one is prepended.
      expect(out.startsWith('<!DOCTYPE html>\n')).toBe(true);
    });

    it('returns a string for malformed/unclosed tag input without throwing', () => {
      const input = `<div><span>oops`;
      const out = cleanEmbedHtml(input);
      expect(typeof out).toBe('string');
      expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(out).toContain('oops');
    });
  });

  describe('block-text elements', () => {
    it('keeps <script> contents intact (treated as block text, not parsed as HTML)', () => {
      const input = `<html><head><script>if (a < b && c > d) { f(); }</script></head><body><p>ok</p></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('if (a < b && c > d) { f(); }');
    });

    it('keeps <style> contents intact', () => {
      const input = `<html><head><style>a > b { content: "<x>"; }</style></head><body><p>ok</p></body></html>`;
      const out = cleanEmbedHtml(input);
      expect(out).toContain('a > b { content: "<x>"; }');
    });
  });

  it('always returns a string', () => {
    expect(typeof cleanEmbedHtml('<html><body>x</body></html>')).toBe('string');
    expect(typeof cleanEmbedHtml('<div>x</div>')).toBe('string');
    expect(typeof cleanEmbedHtml('')).toBe('string');
  });
});
