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

describe('MarketingPanel — BentoGrid block', () => {
  const baseBento = {
    id: 'bg1',
    type: 'bento-grid',
    overline: 'CAPS',
    title: 'T',
    subtitle: 'S',
    columns: 2,
    accentColor: '',
    cards: [{ id: 'cd1', title: 'C', lead: 'L', items: ['a', 'b'], variant: 'dark', span: 6, accentColor: '' }],
  };

  it('exposes the previously-missing block-level Default Accent Color field (JUL9-003)', () => {
    const { onUpdate } = renderPanel(baseBento);
    const colorInput = screen.getByTestId('color-Default Accent Color') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: 'token.brand' } });
    expect(onUpdate).toHaveBeenCalledWith({ accentColor: 'token.brand' });
  });

  it('exposes a per-card accent color override (JUL9-003)', () => {
    const { onUpdate } = renderPanel(baseBento);
    const colorInput = screen.getByTestId('color-Accent Color (overrides default above)') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: 'token.accent-2' } });
    expect(onUpdate).toHaveBeenCalledWith({
      cards: [{ id: 'cd1', title: 'C', lead: 'L', items: ['a', 'b'], variant: 'dark', span: 6, accentColor: 'token.accent-2' }],
    });
  });
});

describe('MarketingPanel — TeamShowcase block', () => {
  const baseTeamShowcase = {
    id: 'ts1',
    type: 'team-showcase',
    overline: 'TEAM',
    title: 'T',
    subtitle: 'S',
    accentColor: '',
    members: [{ id: 'p1', name: 'Alice', title: 'CEO', photo: 'http://a.png', bio: 'Bio', accentColor: '' }],
  };

  it('renames the block-level picker to "Default Accent Color" (JUL9-003)', () => {
    const { onUpdate } = renderPanel(baseTeamShowcase);
    const colorInput = screen.getByTestId('color-Default Accent Color') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: 'token.brand' } });
    expect(onUpdate).toHaveBeenCalledWith({ accentColor: 'token.brand' });
  });

  it('exposes a per-member accent color override (JUL9-003)', () => {
    const { onUpdate } = renderPanel(baseTeamShowcase);
    const colorInput = screen.getByTestId('color-Accent Color (overrides default above)') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: 'token.gold' } });
    const last = (onUpdate as any).mock.calls.pop()[0];
    expect(last.members[0].accentColor).toBe('token.gold');
  });
});

describe('MarketingPanel — TeamFlipGrid block', () => {
  const baseTeamFlip = {
    id: 'tf1',
    type: 'team-flip-grid',
    overline: 'MEET',
    title: 'T',
    subtitle: 'S',
    columns: 4,
    nameColor: '',
    titleColor: '',
    members: [
      { id: 'm1', name: 'A', title: 'T', photo: 'http://a.png', bio: 'b', question: 'Q', answer: 'A!', nameColor: '', titleColor: '' },
    ],
  };

  it('renames the block-level pickers to "Default Name/Title Color" (JUL9-003)', () => {
    const { onUpdate } = renderPanel(baseTeamFlip);
    fireEvent.change(screen.getByTestId('color-Default Name Color'), { target: { value: 'token.navy' } });
    expect(onUpdate).toHaveBeenCalledWith({ nameColor: 'token.navy' });

    fireEvent.change(screen.getByTestId('color-Default Title Color'), { target: { value: 'token.blue' } });
    expect(onUpdate).toHaveBeenCalledWith({ titleColor: 'token.blue' });
  });

  it('exposes per-member nameColor/titleColor overrides (JUL9-003)', () => {
    const { onUpdate } = renderPanel(baseTeamFlip);
    fireEvent.change(screen.getByTestId('color-Name Color (overrides default above)'), { target: { value: 'token.red' } });
    let last = (onUpdate as any).mock.calls.pop()[0];
    expect(last.members[0].nameColor).toBe('token.red');

    fireEvent.change(screen.getByTestId('color-Title Color (overrides default above)'), { target: { value: 'token.green' } });
    last = (onUpdate as any).mock.calls.pop()[0];
    expect(last.members[0].titleColor).toBe('token.green');
  });
});
