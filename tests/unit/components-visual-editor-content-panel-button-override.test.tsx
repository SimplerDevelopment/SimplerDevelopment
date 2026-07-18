// @vitest-environment jsdom
/**
 * Unit tests for VEQA-038 — button block "overridden by Style tab" indicator.
 *
 * ButtonBlockRender.tsx (components/blocks/render/ButtonBlockRender.tsx)
 * resolves button visuals as: variant -> brand preset -> block.style, where
 * each later stage wins. When a Style-tab value is set, the corresponding
 * Content-tab control (Variant / Size / Brand Preset) renders but has no
 * visible effect. These tests assert the ContentPanel shows an override
 * badge for each such pair, and only when the overriding value is present.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// IconPicker pulls in the full react-icons/md set — irrelevant to this test
// and slow to render, so stub it out like other block-panel tests do for
// heavy leaf components.
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

function renderPanel(block: Block) {
  return render(<ContentPanel block={block} onUpdate={() => {}} />);
}

describe('ContentPanel — button block override indicator (VEQA-038)', () => {
  // ─── Pair 1: variant background ← style.backgroundColor ──────────────────
  it('shows the override badge on Variant when style.backgroundColor is set', () => {
    renderPanel(makeButtonBlock({ variant: 'primary', style: { backgroundColor: '#ff0000' } }));
    expect(screen.getAllByTestId('override-badge').length).toBeGreaterThan(0);
  });

  it('does not show the override badge on Variant when no style override is set', () => {
    renderPanel(makeButtonBlock({ variant: 'primary' }));
    expect(screen.queryByTestId('override-badge')).not.toBeInTheDocument();
  });

  // ─── Pair 2: variant text color ← style.color ─────────────────────────────
  it('shows the override badge on Variant when style.color is set', () => {
    renderPanel(makeButtonBlock({ variant: 'secondary', style: { color: '#00ff00' } }));
    expect(screen.getAllByTestId('override-badge').length).toBeGreaterThan(0);
  });

  // ─── Pair 3: brand preset ← style.borderColor (and friends) ──────────────
  it('shows the override badge on Brand Preset when a preset is set and style.borderColor overrides it', () => {
    renderPanel(makeButtonBlock({ presetId: 'cta-primary', style: { borderColor: '#000000' } }));
    // Exactly one badge expected: no variant/size override present, only preset.
    const badges = screen.getAllByTestId('override-badge');
    expect(badges.length).toBe(1);
  });

  it('does not show the override badge on Brand Preset when no preset is set, even if style.borderColor is set', () => {
    renderPanel(makeButtonBlock({ style: { borderColor: '#000000' } }));
    expect(screen.queryByTestId('override-badge')).not.toBeInTheDocument();
  });

  it('does not show the override badge on Brand Preset when a preset is set but no overriding style value is present', () => {
    renderPanel(makeButtonBlock({ presetId: 'cta-primary' }));
    expect(screen.queryByTestId('override-badge')).not.toBeInTheDocument();
  });

  // ─── Pair 4: size text ← style.fontSize ───────────────────────────────────
  it('shows the override badge on Size when style.fontSize is set', () => {
    renderPanel(makeButtonBlock({ size: 'lg', style: { fontSize: '22px' } }));
    expect(screen.getAllByTestId('override-badge').length).toBeGreaterThan(0);
  });

  it('does not show the override badge on Size when style.fontSize is absent', () => {
    renderPanel(makeButtonBlock({ size: 'lg', style: {} }));
    expect(screen.queryByTestId('override-badge')).not.toBeInTheDocument();
  });

  // ─── Combined: all three pairs firing at once ─────────────────────────────
  it('shows three badges when variant, size, and preset are all overridden simultaneously', () => {
    renderPanel(
      makeButtonBlock({
        variant: 'outline',
        size: 'sm',
        presetId: 'cta-primary',
        style: { backgroundColor: '#111', fontSize: '10px' },
      })
    );
    expect(screen.getAllByTestId('override-badge').length).toBe(3);
  });

  // ─── Non-button blocks are unaffected ─────────────────────────────────────
  it('renders no override badge for non-button block types', () => {
    const headingBlock = { id: 'block-2', type: 'heading', order: 0, content: 'Hi', level: 2 } as unknown as Block;
    renderPanel(headingBlock);
    expect(screen.queryByTestId('override-badge')).not.toBeInTheDocument();
  });
});
