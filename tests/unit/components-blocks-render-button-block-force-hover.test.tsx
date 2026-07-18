// @vitest-environment jsdom
/**
 * Unit tests for VEQA-041 — the `.force-hover` CSS mirror injected by
 * ButtonBlockRender.tsx.
 *
 * The editor canvas adds a `.force-hover` class to the selected button's
 * SelectableBlock wrapper while the Content-tab Hover Effect control is
 * being interacted with (see ContentPanel.tsx +
 * components-visual-editor-content-panel-force-hover.test.tsx). For that to
 * visually do anything, every `<selector>:hover` rule in HOVER_STYLES must
 * have a `.force-hover <selector>` descendant-selector mirror with the same
 * body. These tests assert that mirror is present and generated (not just
 * hand-typed and possibly stale) by checking it tracks HOVER_STYLES.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ButtonBlockRender } from '@/components/blocks/render/ButtonBlockRender';
import type { ButtonBlock } from '@/types/blocks';

function makeButtonBlock(overrides: Partial<ButtonBlock> = {}): ButtonBlock {
  return {
    id: 'btn-1',
    type: 'button',
    order: 0,
    text: 'Click me',
    url: '/somewhere',
    ...overrides,
  } as ButtonBlock;
}

function injectedCss(): string {
  const style = document.querySelector('style');
  expect(style).toBeTruthy();
  return style!.textContent || '';
}

describe('ButtonBlockRender — force-hover CSS mirror (VEQA-041)', () => {
  it('injects a .force-hover descendant-selector mirror for each :hover rule', () => {
    render(<ButtonBlockRender block={makeButtonBlock({ hoverEffect: 'lift' })} />);
    const css = injectedCss();

    // Real hover rule still present (unchanged behavior).
    expect(css).toContain('.btn-hover-lift:hover');
    // Mirror: same selector, ancestor-class-triggered instead of :hover.
    expect(css).toContain('.force-hover .btn-hover-lift');
    // Same rule body reused, not hand-duplicated with different values.
    expect(css).toMatch(/\.force-hover \.btn-hover-lift\s*\{\s*transform: translateY\(-2px\); box-shadow: 0 6px 20px rgba\(0,0,0,0\.15\);\s*\}/);
  });

  it('mirrors the pseudo-element hover effects (fill/slide) with ::before intact', () => {
    render(<ButtonBlockRender block={makeButtonBlock({ hoverEffect: 'fill' })} />);
    const css = injectedCss();

    expect(css).toContain('.force-hover .btn-hover-fill::before');
    expect(css).toContain('.force-hover .btn-hover-slide::before');
  });

  it('mirrors the pulse keyframe-animation hover rule', () => {
    render(<ButtonBlockRender block={makeButtonBlock({ hoverEffect: 'pulse' })} />);
    const css = injectedCss();

    expect(css).toContain('.force-hover .btn-hover-pulse');
    expect(css).toMatch(/\.force-hover \.btn-hover-pulse\s*\{\s*animation: btn-pulse 0\.6s ease;\s*\}/);
  });

  it('does not add a force-hover mirror for non-hover rules (e.g. .btn-icon)', () => {
    render(<ButtonBlockRender block={makeButtonBlock({ icon: 'star' })} />);
    const css = injectedCss();

    expect(css).not.toContain('.force-hover .btn-icon');
  });

  it('never applies the .force-hover class itself — that is the editor canvas wrapper\'s job', () => {
    const { container } = render(<ButtonBlockRender block={makeButtonBlock({ hoverEffect: 'glow' })} />);
    const link = container.querySelector('a, span');
    expect(link?.className).not.toContain('force-hover');
  });
});
