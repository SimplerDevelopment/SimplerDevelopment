// @vitest-environment jsdom
/**
 * Unit tests for VEQA-041 — force-hover preview trigger on the button
 * block's Hover Effect control.
 *
 * ContentPanel.tsx wraps the Hover Effect SelectField in a div that calls
 * `onForceHoverChange(true)` on mouse-enter and `onForceHoverChange(false)`
 * on mouse-leave. BlockContentEditor forwards that flag to
 * VisualEditorShell, which sends PARENT_MESSAGES.FORCE_HOVER_BLOCK to the
 * iframe so the canvas can preview the button's `:hover` CSS via a
 * `.force-hover` class (mirrored in ButtonBlockRender.tsx). These tests
 * only cover the panel-side trigger — the postMessage plumbing itself is
 * covered by tests/unit/hooks-use-visual-editor-parent.test.ts and
 * tests/unit/lib-use-editor-mode.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// IconPicker pulls in the full react-icons/md set — stub it out like the
// override-badge test does for the same button-panel render.
vi.mock('@/components/portal/IconPicker', () => ({
  IconPicker: () => <div data-testid="icon-picker-stub" />,
}));

import { ContentPanel } from '@/components/portal/visual-editor/_components/block-panels/ContentPanel';
import type { Block } from '@/types/blocks';

function makeButtonBlock(overrides: Record<string, unknown> = {}): Block {
  return {
    id: 'block-1',
    type: 'button',
    order: 0,
    text: 'Click me',
    url: '/somewhere',
    ...overrides,
  } as unknown as Block;
}

function hoverEffectWrapper() {
  return screen.getByText('Hover Effect').closest('div')!;
}

describe('ContentPanel — button Hover Effect force-hover trigger (VEQA-041)', () => {
  it('calls onForceHoverChange(true) on mouse-enter of the Hover Effect control', () => {
    const onForceHoverChange = vi.fn();
    render(<ContentPanel block={makeButtonBlock()} onUpdate={() => {}} onForceHoverChange={onForceHoverChange} />);

    fireEvent.mouseEnter(hoverEffectWrapper());

    expect(onForceHoverChange).toHaveBeenCalledWith(true);
  });

  it('calls onForceHoverChange(false) on mouse-leave of the Hover Effect control', () => {
    const onForceHoverChange = vi.fn();
    render(<ContentPanel block={makeButtonBlock()} onUpdate={() => {}} onForceHoverChange={onForceHoverChange} />);

    const wrapper = hoverEffectWrapper();
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseLeave(wrapper);

    expect(onForceHoverChange).toHaveBeenNthCalledWith(1, true);
    expect(onForceHoverChange).toHaveBeenNthCalledWith(2, false);
  });

  it('does not throw when onForceHoverChange is not provided', () => {
    render(<ContentPanel block={makeButtonBlock()} onUpdate={() => {}} />);
    const wrapper = hoverEffectWrapper();
    expect(() => {
      fireEvent.mouseEnter(wrapper);
      fireEvent.mouseLeave(wrapper);
    }).not.toThrow();
  });

  it('does not render a Hover Effect control (or fire the callback) for non-button blocks', () => {
    const onForceHoverChange = vi.fn();
    const headingBlock = { id: 'block-2', type: 'heading', order: 0, content: 'Hi', level: 2 } as unknown as Block;
    render(<ContentPanel block={headingBlock} onUpdate={() => {}} onForceHoverChange={onForceHoverChange} />);

    expect(screen.queryByText('Hover Effect')).not.toBeInTheDocument();
    expect(onForceHoverChange).not.toHaveBeenCalled();
  });
});
