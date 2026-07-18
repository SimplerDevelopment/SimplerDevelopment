// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks for heavy *Render dependencies — we only need to verify the preview
// shims dispatch between the empty-state and the underlying renderer. Mocking
// the renderers also avoids pulling in framer-motion/next/link transitively.
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/render/BentoGridBlockRender', () => ({
  BentoGridBlockRender: ({ block }: { block: any }) =>
    React.createElement(
      'div',
      { 'data-testid': 'bento-render' },
      `bento:${block?.cards?.length ?? 0}`,
    ),
}));

vi.mock('@/components/blocks/render/LogoStripBlockRender', () => ({
  LogoStripBlockRender: ({ block }: { block: any }) =>
    React.createElement(
      'div',
      { 'data-testid': 'logos-render' },
      `logos:${block?.logos?.length ?? 0}`,
    ),
}));

vi.mock('@/components/blocks/render/MetricCardsBlockRender', () => ({
  MetricCardsBlockRender: ({ block }: { block: any }) =>
    React.createElement(
      'div',
      { 'data-testid': 'metrics-render' },
      `metrics:${block?.metrics?.length ?? 0}`,
    ),
}));

vi.mock('@/components/blocks/render/TimelineBlockRender', () => ({
  TimelineBlockRender: ({ block }: { block: any }) =>
    React.createElement(
      'div',
      { 'data-testid': 'timeline-render' },
      `timeline:${block?.steps?.length ?? 0}`,
    ),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { BentoGridBlockPreview } from '@/components/blocks/visual/BentoGridBlockPreview';
import { LogoStripBlockPreview } from '@/components/blocks/visual/LogoStripBlockPreview';
import { MetricCardsBlockPreview } from '@/components/blocks/visual/MetricCardsBlockPreview';
import { TimelineBlockPreview } from '@/components/blocks/visual/TimelineBlockPreview';

const noop = () => {};

// ---------------------------------------------------------------------------
// BentoGridBlockPreview
// ---------------------------------------------------------------------------
describe('BentoGridBlockPreview', () => {
  it('renders the empty-state heading when no cards exist', () => {
    const block = { type: 'bento-grid', cards: [] } as any;
    render(
      <BentoGridBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(screen.getByText('Bento Grid')).toBeTruthy();
  });

  it('shows the unselected empty-state copy when not selected', () => {
    const block = { type: 'bento-grid' } as any; // missing cards entirely
    render(
      <BentoGridBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(
      screen.getByText(/No cards yet — click to select and add cards/),
    ).toBeTruthy();
  });

  it('shows the selected empty-state copy when isSelected is true', () => {
    const block = { type: 'bento-grid', cards: [] } as any;
    render(
      <BentoGridBlockPreview block={block} isSelected={true} onChange={noop} />,
    );
    expect(screen.getByText('Add cards in the side panel.')).toBeTruthy();
  });

  it('delegates to BentoGridBlockRender when cards are present', () => {
    const block = {
      type: 'bento-grid',
      cards: [{ id: '1', title: 'a' }, { id: '2', title: 'b' }],
    } as any;
    render(
      <BentoGridBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    const rendered = screen.getByTestId('bento-render');
    expect(rendered.textContent).toBe('bento:2');
  });
});

// ---------------------------------------------------------------------------
// LogoStripBlockPreview
// ---------------------------------------------------------------------------
describe('LogoStripBlockPreview', () => {
  it('renders the empty-state heading when no logos exist', () => {
    const block = { type: 'logo-strip', logos: [] } as any;
    render(
      <LogoStripBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(screen.getByText('Logo Strip')).toBeTruthy();
  });

  it('shows the unselected empty-state copy when not selected', () => {
    const block = { type: 'logo-strip' } as any;
    render(
      <LogoStripBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(
      screen.getByText(/No logos yet — click to select and add logos/),
    ).toBeTruthy();
  });

  it('shows the selected empty-state copy when isSelected is true', () => {
    const block = { type: 'logo-strip', logos: [] } as any;
    render(
      <LogoStripBlockPreview block={block} isSelected={true} onChange={noop} />,
    );
    expect(screen.getByText('Add logos in the side panel.')).toBeTruthy();
  });

  it('delegates to LogoStripBlockRender when logos are present', () => {
    const block = {
      type: 'logo-strip',
      logos: [
        { id: 'a', src: '/a.png' },
        { id: 'b', src: '/b.png' },
        { id: 'c', src: '/c.png' },
      ],
    } as any;
    render(
      <LogoStripBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(screen.getByTestId('logos-render').textContent).toBe('logos:3');
  });
});

// ---------------------------------------------------------------------------
// MetricCardsBlockPreview
// ---------------------------------------------------------------------------
describe('MetricCardsBlockPreview', () => {
  it('renders the empty-state heading when no metrics exist', () => {
    const block = { type: 'metric-cards', metrics: [] } as any;
    render(
      <MetricCardsBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(screen.getByText('Metric Cards')).toBeTruthy();
  });

  it('shows the unselected empty-state copy when not selected', () => {
    const block = { type: 'metric-cards' } as any;
    render(
      <MetricCardsBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(
      screen.getByText(/No metrics yet — click to select and add metrics/),
    ).toBeTruthy();
  });

  it('shows the selected empty-state copy when isSelected is true', () => {
    const block = { type: 'metric-cards', metrics: [] } as any;
    render(
      <MetricCardsBlockPreview block={block} isSelected={true} onChange={noop} />,
    );
    expect(screen.getByText('Add metrics in the side panel.')).toBeTruthy();
  });

  it('delegates to MetricCardsBlockRender when metrics are present', () => {
    const block = {
      type: 'metric-cards',
      metrics: [
        { label: 'Users', value: '1k' },
        { label: 'Posts', value: '500' },
        { label: 'Comments', value: '2k' },
        { label: 'Likes', value: '9k' },
      ],
    } as any;
    render(
      <MetricCardsBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(screen.getByTestId('metrics-render').textContent).toBe('metrics:4');
  });
});

// ---------------------------------------------------------------------------
// TimelineBlockPreview
// ---------------------------------------------------------------------------
describe('TimelineBlockPreview', () => {
  it('renders the empty-state heading when no steps exist', () => {
    const block = { type: 'timeline', steps: [] } as any;
    render(
      <TimelineBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(screen.getByText('Timeline')).toBeTruthy();
  });

  it('shows the unselected empty-state copy when not selected', () => {
    const block = { type: 'timeline' } as any;
    render(
      <TimelineBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(
      screen.getByText(/No steps yet — click to select and add steps/),
    ).toBeTruthy();
  });

  it('shows the selected empty-state copy when isSelected is true', () => {
    const block = { type: 'timeline', steps: [] } as any;
    render(
      <TimelineBlockPreview block={block} isSelected={true} onChange={noop} />,
    );
    expect(screen.getByText('Add steps in the side panel.')).toBeTruthy();
  });

  it('delegates to TimelineBlockRender when steps are present', () => {
    const block = {
      type: 'timeline',
      steps: [
        { title: 'Step 1', body: 'a' },
        { title: 'Step 2', body: 'b' },
      ],
    } as any;
    render(
      <TimelineBlockPreview block={block} isSelected={false} onChange={noop} />,
    );
    expect(screen.getByTestId('timeline-render').textContent).toBe('timeline:2');
  });
});
