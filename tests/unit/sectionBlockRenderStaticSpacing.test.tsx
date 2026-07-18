/**
 * VEQA-034 follow-up regression test.
 *
 * SectionBlockRender forwards `block.style.padding` to the section's own
 * <section> Tag (so the visible, styled element gets it — mirrors legacy
 * per-side padding block props). It never did the same for
 * `block.style.margin`, so a static margin set via the "Static Spacing"
 * editor control landed only on the invisible BlockStyleWrapper ancestor
 * div (no background/border), making it look completely dropped when
 * inspecting the actual rendered section box. Guard against regressing
 * that asymmetry — margin must land on the same element padding does.
 */
import { describe, it, expect, vi } from 'vitest';

// SectionBlockRender eagerly imports BlogPostsBlockRender, which touches the
// DB at module load. Stub it the same way blockRendererResponsiveDispatch
// does so this test runs without DATABASE_URL.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/index', () => ({ db: {} }));
vi.mock('@/lib/actions/blog', () => ({
  getRecentPosts: async () => [],
  getPostsByCategory: async () => [],
  getPostsByTag: async () => [],
}));

import { render } from '@testing-library/react';
import { SectionBlockRender } from '@/components/blocks/render/SectionBlockRender';
import type { SectionBlock } from '@/types/blocks';

function makeSectionBlock(style: SectionBlock['style']): SectionBlock {
  return {
    id: 'sec1',
    type: 'section',
    order: 0,
    blocks: [],
    style,
  } as SectionBlock;
}

describe('SectionBlockRender — static margin reaches the section Tag', () => {
  it('applies static padding to the <section> element (existing behavior)', () => {
    const block = makeSectionBlock({ padding: '1.5rem 0 0' });
    const { container } = render(<SectionBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.paddingTop).toBe('1.5rem');
  });

  it('applies static margin to the <section> element (regression guard)', () => {
    const block = makeSectionBlock({ margin: '1rem 0 0' });
    const { container } = render(<SectionBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.marginTop).toBe('1rem');
  });

  it('applies both static margin and padding together on the same element', () => {
    const block = makeSectionBlock({ margin: '1rem 0 0', padding: '1.5rem 0 0' });
    const { container } = render(<SectionBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.paddingTop).toBe('1.5rem');
    expect(section.style.marginTop).toBe('1rem');
  });

  it('omits margin from the section Tag when not set (no stray "margin: undefined")', () => {
    const block = makeSectionBlock({ padding: '1.5rem 0 0' });
    const { container } = render(<SectionBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.marginTop).toBe('');
  });
});
