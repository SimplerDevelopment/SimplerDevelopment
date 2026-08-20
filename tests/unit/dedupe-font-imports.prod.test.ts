/**
 * The transform run against the ACTUAL content shipped by integratouch, rather
 * than a hand-made fixture — the three @import rules exactly as they appear in
 * the live page's block <style> tags on 2026-08-20.
 */
import { describe, it, expect } from 'vitest';
import { dedupeFontImports } from '@/lib/blocks/dedupe-font-imports';

const REAL = `<style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300..900;1,300..900&family=Inter:ital,wght@0,300..800;1,300..800&display=swap');
.it-hero{position:relative;padding:12rem 4rem 4rem;}
</style>
<style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
</style>
<style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
</style>
<style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
</style>`;

describe('production content', () => {
  it('collapses integratouch four import rules to one', () => {
    const out = dedupeFontImports(REAL);
    expect(REAL.match(/@import/g)).toHaveLength(4);
    expect(out.match(/@import/g)).toHaveLength(1);
  });

  it('keeps the widest spec and drops only the covered subset', () => {
    const out = dedupeFontImports(REAL);
    expect(out).toContain('Montserrat:ital,wght@0,300..900');
    expect(out).toContain('Inter:ital,wght@0,300..800');
    expect(out).not.toContain('wght@300;400;500;600;700;800');
  });

  it('leaves non-font CSS in the same style blocks untouched', () => {
    expect(dedupeFontImports(REAL)).toContain('.it-hero{position:relative;padding:12rem 4rem 4rem;}');
  });
});
