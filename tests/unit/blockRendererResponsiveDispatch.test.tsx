/**
 * Integration smoke test: when content is rendered through `BlockRenderer`
 * (the canonical dispatch component used by every public page + the iframe
 * editor), the responsive margin/padding/visibility/fontSize values reach
 * the rendered DOM as a scoped <style> tag.
 *
 * This proves the fix is universal at the dispatch layer (not per-renderer).
 *
 * Some renderers (BlogPostsBlockRender, SurveyFormInline) import server-only
 * modules that touch the DB at module load. We stub them so the test runs
 * without DATABASE_URL.
 */
import { describe, it, expect, vi } from 'vitest';

// Stub server-coupled modules pulled in by BlockRenderer's eager imports.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/index', () => ({ db: {} }));
vi.mock('@/lib/actions/blog', () => ({
  getRecentPosts: async () => [],
  getPostsByCategory: async () => [],
  getPostsByTag: async () => [],
}));

import { render } from '@testing-library/react';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';

const BLOCK_FIXTURES: Array<Record<string, unknown>> = [
  { id: 'b-text', type: 'text', order: 0, content: 'x' },
  { id: 'b-heading', type: 'heading', order: 0, content: 'h', level: 2 },
  { id: 'b-image', type: 'image', order: 0, url: 'https://example.com/x.png', alt: '' },
  { id: 'b-button', type: 'button', order: 0, text: 'click', url: '/x' },
  { id: 'b-spacer', type: 'spacer', order: 0, size: 'md' },
  { id: 'b-divider', type: 'divider', order: 0 },
  { id: 'b-quote', type: 'quote', order: 0, content: 'q', author: 'a' },
  { id: 'b-code', type: 'code', order: 0, code: 'x' },
  { id: 'b-video', type: 'video', order: 0, url: 'https://x.com/v.mp4' },
  { id: 'b-youtube', type: 'youtube', order: 0, videoId: 'abc' },
  { id: 'b-cta', type: 'cta', order: 0, title: 't', description: 'd' },
  { id: 'b-testimonial', type: 'testimonial', order: 0, quote: 'q', name: 'n' },
  { id: 'b-stats', type: 'stats', order: 0, stats: [] },
  { id: 'b-card-grid', type: 'card-grid', order: 0, cards: [] },
  { id: 'b-section', type: 'section', order: 0, blocks: [] },
  { id: 'b-gallery', type: 'gallery', order: 0, images: [] },
  { id: 'b-metric-cards', type: 'metric-cards', order: 0, metrics: [] },
  { id: 'b-flip-card-grid', type: 'flip-card-grid', order: 0, cards: [] },
  { id: 'b-logo-strip', type: 'logo-strip', order: 0, logos: [] },
  { id: 'b-bento-grid', type: 'bento-grid', order: 0, cards: [] },
  { id: 'b-team-showcase', type: 'team-showcase', order: 0, members: [] },
  { id: 'b-timeline', type: 'timeline', order: 0, steps: [] },
  { id: 'b-accordion', type: 'accordion', order: 0, items: [] },
  { id: 'b-tabs', type: 'tabs', order: 0, tabs: [{ id: 't1', label: 'one', blocks: [] }] },
  { id: 'b-columns', type: 'columns', order: 0, columns: [{ blocks: [] }] },
  { id: 'b-hero', type: 'hero', order: 0, title: 't' },
  { id: 'b-marquee', type: 'marquee', order: 0, items: [] },
  { id: 'b-services-grid', type: 'services-grid', order: 0, services: [] },
];

function wrapAsContent(blocks: unknown[]): string {
  return JSON.stringify({ blocks, version: '1.0' });
}

describe('BlockRenderer — responsive margin/padding reaches every block type', () => {
  for (const fixture of BLOCK_FIXTURES) {
    const block = { ...fixture, responsive: { marginTop: { desktop: '99px' } } };
    it(`type=${block.type}: emits scoped <style> with margin-top: 99px`, () => {
      const { container } = render(
        <BlockRenderer content={wrapAsContent([block])} />,
      );
      const styleTags = Array.from(container.querySelectorAll('style'));
      const matched = styleTags.find((s) => s.innerHTML.includes('margin-top: 99px'));
      expect(matched, `${block.type}: no <style> tag containing margin-top 99px`).toBeTruthy();
      expect(matched!.innerHTML).toContain(`bsr-b-${block.type}`);
    });
  }
});

describe('BlockRenderer — responsive padding + visibility per breakpoint', () => {
  it('emits desktop padding-bottom and mobile display:none for a single block', () => {
    const block = {
      id: 'b-multi',
      type: 'text',
      order: 0,
      content: 'x',
      responsive: {
        paddingBottom: { desktop: '40px' },
        visibility: { mobile: false },
      },
    };
    const { container } = render(
      <BlockRenderer content={wrapAsContent([block])} />,
    );
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.innerHTML).join('');
    expect(css).toContain('padding-bottom: 40px');
    expect(css).toContain('display: none');
  });
});
