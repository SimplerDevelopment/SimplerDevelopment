/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
//
// MarketingPanel is the *other* JUL9-010 panel system — the portal editor's
// per-block settings UI at app/portal/websites/[siteId]/posts/[id]/edit,
// parallel to SectionsPanel.tsx (the settings-popup panel covered by
// components-sections-panel.test.tsx). A field wired into SectionsPanel only
// ships invisible here. This file starts narrow (JUL9-003's flip-card-grid
// fix) rather than mirroring every SectionsPanel block up front.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Heavy-dep mocks (same shapes as components-sections-panel.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange, label }: any) => (
    <div data-testid={`media-picker-${label || 'unnamed'}`}>
      <input
        data-testid={`mp-input-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label, placeholder }: any) => (
    <label data-testid={`color-wrap-${label || placeholder || 'unnamed'}`}>
      <span>{label}</span>
      <input
        data-testid={`color-${label || placeholder || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

vi.mock('@/components/blocks/visual/RichTextEditable', () => ({
  RichTextEditable: ({ html, onChange, placeholder, singleLine }: any) => (
    <textarea
      data-testid={`rte-${placeholder || 'rte'}`}
      data-single-line={singleLine ? 'true' : 'false'}
      value={html || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/portal/IconPicker', () => ({
  IconPicker: ({ value, onChange, label }: any) => (
    <label data-testid={`icon-wrap-${label || 'unnamed'}`}>
      <span>{label}</span>
      <input
        data-testid={`icon-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

// Lazy import after mocks
import { MarketingPanel } from '@/components/portal/visual-editor/_components/block-panels/MarketingPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOnUpdate<T = any>() {
  return vi.fn<(updates: Partial<T>) => void>();
}

function renderPanel(block: any, onUpdate = makeOnUpdate()) {
  const utils = render(<MarketingPanel block={block} onUpdate={onUpdate} />);
  return { ...utils, onUpdate };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketingPanel — FlipCardGrid block', () => {
  const baseFlipCardGrid = {
    id: 'fc1',
    type: 'flip-card-grid',
    overline: 'WHY',
    title: 'T',
    description: 'D',
    columns: 3,
    cardHeight: '280px',
    flipTrigger: 'hover',
    flipAxis: 'horizontal',
    accentColor: '',
    cards: [{ id: 'c1', frontTitle: 'Front', backText: 'Back', accentColor: '' }],
  };

  it('exposes a per-card accent color override (JUL9-003 / JUL9-010 gap)', () => {
    const { onUpdate } = renderPanel(baseFlipCardGrid);
    // Expand the collapsed list item so its fields render.
    fireEvent.click(screen.getByText('Front'));

    const colorInput = screen.getByTestId('color-Accent Color (overrides default above)') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: 'token.brand' } });

    expect(onUpdate).toHaveBeenCalledWith({
      cards: [{ id: 'c1', frontTitle: 'Front', backText: 'Back', accentColor: 'token.brand' }],
    });
  });

  it('emits undefined when the per-card override is cleared', () => {
    const withOverride = {
      ...baseFlipCardGrid,
      cards: [{ id: 'c1', frontTitle: 'Front', backText: 'Back', accentColor: 'token.brand' }],
    };
    const { onUpdate } = renderPanel(withOverride);
    fireEvent.click(screen.getByText('Front'));

    const colorInput = screen.getByTestId('color-Accent Color (overrides default above)') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '' } });

    expect(onUpdate).toHaveBeenCalledWith({
      cards: [{ id: 'c1', frontTitle: 'Front', backText: 'Back', accentColor: '' }],
    });
  });
});
