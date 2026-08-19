// @vitest-environment node
/**
 * resolveHtmlRenderCorpus (ITM-031): the scan corpus for HeroPreload must be
 * POST-substitution — templated heroes author their background as
 * url('{{bgImage}}') with the real URL in `values`, so pairing a URL with its
 * mobile-variant reference (`-w828.webp` sibling in a media query) only works
 * against substituted output.
 */
import { describe, it, expect } from 'vitest';
import { resolveHtmlRenderCorpus, firstContentImageUrls } from '@/lib/blocks/page-fonts';

const FULL = '/api/media/proxy/media/abc123.webp';
const VARIANT = '/api/media/proxy/media/abc123-w828.webp';

function heroBlock() {
  return {
    id: 'h1',
    type: 'html-render',
    html: `<style>.hero{background-image:url('{{bgImage}}');}@media(max-width:600px){.hero{background-image:url('{{bgImageMobile}}');}}</style><section class="hero"></section>`,
    fields: [
      { name: 'bgImage', label: 'Bg', type: 'image' },
      { name: 'bgImageMobile', label: 'Bg mobile', type: 'image' },
    ],
    values: { bgImage: FULL, bgImageMobile: VARIANT },
  };
}

describe('resolveHtmlRenderCorpus', () => {
  it('substitutes html-render tokens so URL + variant appear literally', () => {
    const corpus = resolveHtmlRenderCorpus(JSON.stringify([heroBlock()]));
    expect(corpus).toContain(`url('${FULL}')`);
    expect(corpus).toContain(`url('${VARIANT}')`);
    expect(corpus).not.toContain('{{bgImage}}');
  });

  it('keeps document order and non-html-render blocks (literal props) scannable', () => {
    const blocks = [
      heroBlock(),
      { id: 'c1', type: 'card-grid', cards: [{ id: 'x', title: 't', image: '/api/media/proxy/media/second.webp' }] },
    ];
    const corpus = resolveHtmlRenderCorpus(JSON.stringify(blocks));
    const urls = firstContentImageUrls(corpus, 2);
    expect(urls[0]).toBe(FULL);
    expect(urls[1]).toBe('/api/media/proxy/media/second.webp');
  });

  it('recurses into container blocks (columns) for nested html-render', () => {
    const blocks = [
      {
        id: 'col1', type: 'columns',
        columns: [{ width: 50, blocks: [heroBlock()] }],
      },
    ];
    const corpus = resolveHtmlRenderCorpus(JSON.stringify(blocks));
    expect(corpus).toContain(`url('${VARIANT}')`);
  });

  it('returns non-JSON content unchanged', () => {
    expect(resolveHtmlRenderCorpus('<p>raw html</p>')).toBe('<p>raw html</p>');
  });
});
