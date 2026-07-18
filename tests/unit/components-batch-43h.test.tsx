// @vitest-environment jsdom
/**
 * Batch 43h — small visual-editor "preview" wrapper components.
 *
 * Each component delegates to its production renderer when the block has the
 * required content (members / cards / link groups), otherwise it renders an
 * empty-state placeholder with isSelected-dependent copy. The renderers
 * themselves are mocked so the tests exercise only the wrapper conditionals
 * (empty-state branch vs. delegate branch, plus FlipCardGridBlockPreview's
 * hover-flip notice).
 *
 * Components covered:
 *   - TeamFlipGridBlockPreview   (components/blocks/visual/TeamFlipGridBlockPreview.tsx)
 *   - TeamShowcaseBlockPreview   (components/blocks/visual/TeamShowcaseBlockPreview.tsx)
 *   - SiteFooterBlockPreview     (components/blocks/visual/SiteFooterBlockPreview.tsx)
 *   - FlipCardGridBlockPreview   (components/blocks/visual/FlipCardGridBlockPreview.tsx)
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy renderer deps. Each renderer is replaced with a deterministic
// stub that surfaces the block props as data attributes so we can assert the
// wrapper passed them through correctly.
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/render/TeamFlipGridBlockRender', () => ({
  TeamFlipGridBlockRender: ({ block }: any) =>
    React.createElement('div', {
      'data-testid': 'team-flip-grid-render',
      'data-member-count': String(block?.members?.length ?? 0),
    }),
}));

vi.mock('@/components/blocks/render/TeamShowcaseBlockRender', () => ({
  TeamShowcaseBlockRender: ({ block }: any) =>
    React.createElement('div', {
      'data-testid': 'team-showcase-render',
      'data-member-count': String(block?.members?.length ?? 0),
    }),
}));

vi.mock('@/components/blocks/render/SiteFooterBlockRender', () => ({
  SiteFooterBlockRender: ({ block }: any) =>
    React.createElement('div', {
      'data-testid': 'site-footer-render',
      'data-group-count': String(block?.linkGroups?.length ?? 0),
    }),
}));

vi.mock('@/components/blocks/render/FlipCardGridBlockRender', () => ({
  FlipCardGridBlockRender: ({ block }: any) =>
    React.createElement('div', {
      'data-testid': 'flipcard-grid-render',
      'data-card-count': String(block?.cards?.length ?? 0),
      'data-flip-trigger': block?.flipTrigger ?? 'hover',
    }),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { TeamFlipGridBlockPreview } from '@/components/blocks/visual/TeamFlipGridBlockPreview';
import { TeamShowcaseBlockPreview } from '@/components/blocks/visual/TeamShowcaseBlockPreview';
import { SiteFooterBlockPreview } from '@/components/blocks/visual/SiteFooterBlockPreview';
import { FlipCardGridBlockPreview } from '@/components/blocks/visual/FlipCardGridBlockPreview';

// ---------------------------------------------------------------------------
// TeamFlipGridBlockPreview
// ---------------------------------------------------------------------------
describe('TeamFlipGridBlockPreview', () => {
  it('renders the unselected empty-state placeholder when members is missing', () => {
    const block: any = { type: 'team-flip-grid' };
    const { container, queryByTestId } = render(
      <TeamFlipGridBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Team Flip Grid');
    expect(container.textContent).toContain('No members yet');
    expect(container.textContent).not.toContain('Add team members');
    expect(queryByTestId('team-flip-grid-render')).toBeNull();
  });

  it('renders the selected empty-state placeholder when members is an empty array', () => {
    const block: any = { type: 'team-flip-grid', members: [] };
    const { container } = render(
      <TeamFlipGridBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Team Flip Grid');
    expect(container.textContent).toContain('Add team members in the side panel.');
    expect(container.textContent).not.toContain('No members yet');
  });

  it('delegates to the renderer when at least one member is present', () => {
    const block: any = {
      type: 'team-flip-grid',
      members: [{ id: 'm1', name: 'Ada Lovelace', title: 'Founder' }],
    };
    const { getByTestId, container } = render(
      <TeamFlipGridBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    const el = getByTestId('team-flip-grid-render');
    expect(el.getAttribute('data-member-count')).toBe('1');
    // Empty-state copy must NOT be rendered when we delegate.
    expect(container.textContent).not.toContain('No members yet');
    expect(container.textContent).not.toContain('Add team members');
  });
});

// ---------------------------------------------------------------------------
// TeamShowcaseBlockPreview
// ---------------------------------------------------------------------------
describe('TeamShowcaseBlockPreview', () => {
  it('renders the unselected empty-state placeholder when members is missing', () => {
    const block: any = { type: 'team-showcase' };
    const { container, queryByTestId } = render(
      <TeamShowcaseBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Team Showcase');
    expect(container.textContent).toContain('No members yet');
    expect(queryByTestId('team-showcase-render')).toBeNull();
  });

  it('renders the selected empty-state placeholder when members is an empty array', () => {
    const block: any = { type: 'team-showcase', members: [] };
    const { container } = render(
      <TeamShowcaseBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Team Showcase');
    expect(container.textContent).toContain('Add team members in the side panel.');
  });

  it('delegates to the renderer when members has entries', () => {
    const block: any = {
      type: 'team-showcase',
      members: [
        { id: 'm1', name: 'A' },
        { id: 'm2', name: 'B' },
      ],
    };
    const { getByTestId, container } = render(
      <TeamShowcaseBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(getByTestId('team-showcase-render').getAttribute('data-member-count')).toBe('2');
    expect(container.textContent).not.toContain('Team Showcase');
  });
});

// ---------------------------------------------------------------------------
// SiteFooterBlockPreview
// ---------------------------------------------------------------------------
describe('SiteFooterBlockPreview', () => {
  it('renders the unselected empty-state placeholder when linkGroups is undefined', () => {
    const block: any = { type: 'site-footer' };
    const { container, queryByTestId } = render(
      <SiteFooterBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Site Footer');
    expect(container.textContent).toContain('No link groups yet');
    expect(queryByTestId('site-footer-render')).toBeNull();
  });

  it('renders the selected empty-state placeholder when linkGroups is empty', () => {
    const block: any = { type: 'site-footer', linkGroups: [] };
    const { container } = render(
      <SiteFooterBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Site Footer');
    expect(container.textContent).toContain('Add link groups in the side panel.');
    expect(container.textContent).not.toContain('No link groups yet');
  });

  it('delegates to the renderer when linkGroups has entries', () => {
    const block: any = {
      type: 'site-footer',
      linkGroups: [
        { title: 'Company', links: [] },
        { title: 'Resources', links: [] },
        { title: 'Legal', links: [] },
      ],
    };
    const { getByTestId, container } = render(
      <SiteFooterBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(getByTestId('site-footer-render').getAttribute('data-group-count')).toBe('3');
    // Wrapper empty-state title only appears in the placeholder branch.
    expect(container.textContent).not.toContain('Site Footer');
  });
});

// ---------------------------------------------------------------------------
// FlipCardGridBlockPreview
// ---------------------------------------------------------------------------
describe('FlipCardGridBlockPreview', () => {
  it('renders the unselected empty-state placeholder when cards is undefined', () => {
    const block: any = { type: 'flipcard-grid' };
    const { container, queryByTestId } = render(
      <FlipCardGridBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Flip Card Grid');
    expect(container.textContent).toContain('No cards yet');
    expect(queryByTestId('flipcard-grid-render')).toBeNull();
  });

  it('renders the selected empty-state placeholder when cards is empty', () => {
    const block: any = { type: 'flipcard-grid', cards: [] };
    const { container } = render(
      <FlipCardGridBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Flip Card Grid');
    expect(container.textContent).toContain('Add cards in the side panel');
  });

  it('delegates to the renderer and shows the hover-flip notice when flipTrigger is missing (defaults to hover)', () => {
    const block: any = {
      type: 'flipcard-grid',
      cards: [
        { id: 'c1', front: 'Front A', back: 'Back A' },
        { id: 'c2', front: 'Front B', back: 'Back B' },
      ],
    };
    const { container, getByTestId } = render(
      <FlipCardGridBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(getByTestId('flipcard-grid-render').getAttribute('data-card-count')).toBe('2');
    expect(container.textContent).toContain('Hover-flip preview disabled in editor');
    // The wrapper div has the editor preview class hook.
    expect(container.querySelector('.pc-flipcard-editor-preview')).toBeTruthy();
  });

  it('delegates to the renderer and explicitly shows the hover-flip notice when flipTrigger is "hover"', () => {
    const block: any = {
      type: 'flipcard-grid',
      cards: [{ id: 'c1', front: 'F', back: 'B' }],
      flipTrigger: 'hover',
    };
    const { container, getByTestId } = render(
      <FlipCardGridBlockPreview block={block} isSelected={false} onChange={() => {}} />,
    );
    expect(getByTestId('flipcard-grid-render').getAttribute('data-flip-trigger')).toBe('hover');
    expect(container.textContent).toContain('Hover-flip preview disabled in editor');
  });

  it('delegates to the renderer and hides the hover-flip notice when flipTrigger is "click"', () => {
    const block: any = {
      type: 'flipcard-grid',
      cards: [{ id: 'c1', front: 'F', back: 'B' }],
      flipTrigger: 'click',
    };
    const { container, getByTestId } = render(
      <FlipCardGridBlockPreview block={block} isSelected={true} onChange={() => {}} />,
    );
    expect(getByTestId('flipcard-grid-render').getAttribute('data-flip-trigger')).toBe('click');
    expect(container.textContent).not.toContain('Hover-flip preview disabled in editor');
    // Empty-state title must not appear either.
    expect(container.textContent).not.toContain('Flip Card Grid');
  });
});
