/**
 * Pins the subset-elimination rule for Google Fonts `@import`s in block content.
 *
 * The dangerous failure here is deleting an import that supplies a weight the
 * design actually uses — real bold silently becomes synthetic bold, which no
 * review catches. So the tests are weighted toward what must be KEPT: anything
 * this cannot prove redundant has to survive untouched.
 */
import { describe, it, expect } from 'vitest';
import { dedupeFontImports } from '@/lib/blocks/dedupe-font-imports';

const wide = "@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300..900;1,300..900&family=Inter:ital,wght@0,300..800;1,300..800&display=swap');";
const narrow = "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');";

describe('dedupeFontImports — drops what is provably redundant', () => {
  it('drops a weight subset of a wider import (the real integratouch case)', () => {
    const out = dedupeFontImports(`<style>${wide}\n${narrow}</style>`);
    expect(out).toContain('300..900');   // the wider one survives
    expect(out).not.toContain('wght@300;400;500;600;700;800');
  });

  it('drops exact duplicates but keeps one', () => {
    const out = dedupeFontImports(`<style>${narrow}\n${narrow}\n${narrow}</style>`);
    expect(out.match(/@import/g)).toHaveLength(1);
  });

  it('drops a bare family already covered by a ranged import', () => {
    const bare = "@import url('https://fonts.googleapis.com/css2?family=Montserrat&display=swap');";
    const out = dedupeFontImports(`<style>${wide}\n${bare}</style>`);
    expect(out).not.toContain('family=Montserrat&display=swap');
    expect(out).toContain('300..900');
  });

  it('handles HTML-escaped ampersands in stored content', () => {
    const escaped = "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400&amp;display=swap');";
    const out = dedupeFontImports(`<style>${wide}\n${escaped}</style>`);
    expect(out).not.toContain('wght@400&amp;');
  });
});

describe('dedupeFontImports — keeps everything it cannot prove redundant', () => {
  it('keeps an import that adds a weight the other lacks', () => {
    // 200 is outside the 300..900 range — dropping this would lose ExtraLight.
    const extra = "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@200&display=swap');";
    const out = dedupeFontImports(`<style>${wide}\n${extra}</style>`);
    expect(out).toContain('wght@200');
  });

  it('keeps an import that adds italics the other lacks', () => {
    const romanOnly = "@import url('https://fonts.googleapis.com/css2?family=Lora:wght@400..700&display=swap');";
    const withItalic = "@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,400..700&display=swap');";
    const out = dedupeFontImports(`<style>${romanOnly}\n${withItalic}</style>`);
    expect(out.match(/@import/g)).toHaveLength(2);
  });

  it('keeps an import for a family nothing else requests', () => {
    const other = "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');";
    const out = dedupeFontImports(`<style>${wide}\n${other}</style>`);
    expect(out).toContain('Playfair+Display');
  });

  it('keeps both when each covers a family the other does not', () => {
    const a = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap');";
    const b = "@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400&display=swap');";
    const out = dedupeFontImports(`<style>${a}\n${b}</style>`);
    expect(out.match(/@import/g)).toHaveLength(2);
  });

  it('leaves a single import alone', () => {
    const src = `<style>${narrow}</style>`;
    expect(dedupeFontImports(src)).toBe(src);
  });

  it('is a no-op on content with no font imports', () => {
    const src = '<div class="it-hero"><h1>Hello</h1></div>';
    expect(dedupeFontImports(src)).toBe(src);
  });

  it('never drops every import for a family', () => {
    // Two specs that mutually cover each other (same coverage, different syntax)
    // must not annihilate — exactly one has to survive.
    const x = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap');";
    const y = "@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap');";
    const out = dedupeFontImports(`<style>${x}\n${y}</style>`);
    expect(out.match(/@import/g)).toHaveLength(1);
  });
});
