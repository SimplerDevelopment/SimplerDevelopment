// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StickyScrollTabsBlockRender } from '@/components/blocks/render/StickyScrollTabsBlockRender';
import type { StickyScrollTabsBlock } from '@/types/blocks';

// jsdom does not implement HTMLElement.scrollTo — stub it before render
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/responsive', () => ({
  combineResponsiveClasses: vi.fn(() => ''),
}));

vi.mock('@/lib/utils/elementStyles', () => ({
  getElementCSS: vi.fn(() => ({})),
}));

vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeRichHtml: vi.fn((s: string) => s),
}));

// Mock all nested block renderers — they are irrelevant to the tabs/panel
// logic we're testing and would require deep dependency resolution.
vi.mock('@/components/blocks/render/TextBlockRender', () => ({
  TextBlockRender: ({ block }: { block: { content?: string } }) => (
    <div data-testid="text-block">{block.content}</div>
  ),
}));
vi.mock('@/components/blocks/render/HeadingBlockRender', () => ({
  HeadingBlockRender: () => <div data-testid="heading-block" />,
}));
vi.mock('@/components/blocks/render/ImageBlockRender', () => ({
  ImageBlockRender: () => <div data-testid="image-block" />,
}));
vi.mock('@/components/blocks/render/ButtonBlockRender', () => ({
  ButtonBlockRender: () => <div data-testid="button-block" />,
}));
vi.mock('@/components/blocks/render/SpacerBlockRender', () => ({
  SpacerBlockRender: () => <div data-testid="spacer-block" />,
}));
vi.mock('@/components/blocks/render/DividerBlockRender', () => ({
  DividerBlockRender: () => <div data-testid="divider-block" />,
}));
vi.mock('@/components/blocks/render/ColumnsBlockRender', () => ({
  ColumnsBlockRender: () => <div data-testid="columns-block" />,
}));
vi.mock('@/components/blocks/render/SectionBlockRender', () => ({
  SectionBlockRender: () => <div data-testid="section-block" />,
}));
vi.mock('@/components/blocks/render/CardGridBlockRender', () => ({
  CardGridBlockRender: () => <div data-testid="card-grid-block" />,
}));
vi.mock('@/components/blocks/render/AccordionBlockRender', () => ({
  AccordionBlockRender: () => <div data-testid="accordion-block" />,
}));
vi.mock('@/components/blocks/render/BlockStyleWrapper', () => ({
  BlockStyleWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBlock(overrides?: Partial<StickyScrollTabsBlock>): StickyScrollTabsBlock {
  return {
    id: 'sst-1',
    type: 'sticky-scroll-tabs',
    order: 0,
    panels: [
      {
        id: 'panel-a',
        label: 'Features',
        icon: 'star',
        blocks: [
          {
            id: 'txt-1',
            type: 'text',
            order: 0,
            // @ts-expect-error content not on BaseBlock but TextBlock has it
            content: 'Features content',
          },
        ],
      },
      {
        id: 'panel-b',
        label: 'Pricing',
        blocks: [],
      },
      {
        id: 'panel-c',
        label: 'FAQ',
        blocks: [],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StickyScrollTabsBlockRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Renders without crashing ───────────────────────────────────────────────

  it('renders without crashing', () => {
    const { container } = render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('has .sticky-scroll-tabs root class', () => {
    const { container } = render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    expect(container.querySelector('.sticky-scroll-tabs')).toBeInTheDocument();
  });

  // ── Tabs rendered ─────────────────────────────────────────────────────────

  it('renders one tab button per panel', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    // The desktop tab row renders buttons. Filter to ssct-tab class.
    const tabs = document.querySelectorAll('.ssct-tab');
    expect(tabs).toHaveLength(3);
  });

  it('renders panel labels in desktop tab buttons', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const tabs = document.querySelectorAll('.ssct-tab');
    // textContent includes the icon span text (e.g. "starFeatures") — use includes
    const labels = Array.from(tabs).map((t) => t.textContent ?? '');
    expect(labels.some((l) => l.includes('Features'))).toBe(true);
    expect(labels.some((l) => l.includes('Pricing'))).toBe(true);
    expect(labels.some((l) => l.includes('FAQ'))).toBe(true);
  });

  it('renders panel icons when provided', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    // panel-a has icon: 'star'
    const icons = document.querySelectorAll('.ssct-tab-icon');
    expect(icons.length).toBeGreaterThan(0);
    expect(icons[0].textContent).toBe('star');
  });

  // ── Active tab aria-pressed ───────────────────────────────────────────────

  it('first tab has aria-pressed=true (default active)', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const tabs = document.querySelectorAll<HTMLButtonElement>('.ssct-tab');
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true');
    expect(tabs[1].getAttribute('aria-pressed')).toBe('false');
    expect(tabs[2].getAttribute('aria-pressed')).toBe('false');
  });

  // ── Panels rendered ───────────────────────────────────────────────────────

  it('renders one panel element per panel', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const panels = document.querySelectorAll('.ssct-panel');
    expect(panels).toHaveLength(3);
  });

  it('first panel has is-active class', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const panels = document.querySelectorAll('.ssct-panel');
    expect(panels[0].classList.contains('is-active')).toBe(true);
    expect(panels[1].classList.contains('is-active')).toBe(false);
  });

  it('first panel is aria-hidden=false, others aria-hidden=true', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const panels = document.querySelectorAll('.ssct-panel');
    expect(panels[0].getAttribute('aria-hidden')).toBe('false');
    expect(panels[1].getAttribute('aria-hidden')).toBe('true');
    expect(panels[2].getAttribute('aria-hidden')).toBe('true');
  });

  it('renders nested blocks inside the active panel', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    expect(screen.getByTestId('text-block')).toBeInTheDocument();
  });

  // ── Header section ────────────────────────────────────────────────────────

  it('renders overline, title, and description when provided', () => {
    const block = makeBlock({
      overline: '<em>New</em>',
      title: '<strong>Our Platform</strong>',
      description: 'Everything you need.',
    });
    render(<StickyScrollTabsBlockRender block={block} />);
    expect(document.querySelector('.ssct-header')).toBeInTheDocument();
    expect(document.querySelector('.ssct-overline')).toBeInTheDocument();
    expect(document.querySelector('.ssct-title')).toBeInTheDocument();
    expect(document.querySelector('.ssct-description')).toBeInTheDocument();
  });

  it('does not render header when overline/title/description are all absent', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    expect(document.querySelector('.ssct-header')).not.toBeInTheDocument();
  });

  it('renders only provided header fields', () => {
    const block = makeBlock({ title: 'Just a Title' });
    render(<StickyScrollTabsBlockRender block={block} />);
    expect(document.querySelector('.ssct-title')).toBeInTheDocument();
    expect(document.querySelector('.ssct-overline')).not.toBeInTheDocument();
    expect(document.querySelector('.ssct-description')).not.toBeInTheDocument();
  });

  // ── Mobile tab strip ──────────────────────────────────────────────────────

  it('renders mobile tab strip in carousel mode (default)', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    expect(document.querySelector('.ssct-mobile-tabs')).toBeInTheDocument();
  });

  it('does not render mobile tab strip in hide mode', () => {
    const block = makeBlock({ mobileTabsBehavior: 'hide' });
    render(<StickyScrollTabsBlockRender block={block} />);
    expect(document.querySelector('.ssct-mobile-tabs')).not.toBeInTheDocument();
  });

  it('mobile tab strip has role=tablist', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const strip = document.querySelector('.ssct-mobile-tabs');
    expect(strip?.getAttribute('role')).toBe('tablist');
  });

  it('mobile tab pills have role=tab', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const mobilePills = document.querySelectorAll('.ssct-mobile-tab');
    expect(mobilePills.length).toBe(3);
    mobilePills.forEach((pill) => {
      expect(pill.getAttribute('role')).toBe('tab');
    });
  });

  it('first mobile pill has aria-selected=true', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const mobilePills = document.querySelectorAll<HTMLButtonElement>('.ssct-mobile-tab');
    expect(mobilePills[0].getAttribute('aria-selected')).toBe('true');
    expect(mobilePills[1].getAttribute('aria-selected')).toBe('false');
  });

  it('mobile pills show panel labels', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const mobilePills = document.querySelectorAll('.ssct-mobile-tab');
    // textContent may include icon span text (e.g. "starFeatures") — use includes
    const labels = Array.from(mobilePills).map((p) => p.textContent ?? '');
    expect(labels.some((l) => l.includes('Features'))).toBe(true);
    expect(labels.some((l) => l.includes('Pricing'))).toBe(true);
    expect(labels.some((l) => l.includes('FAQ'))).toBe(true);
  });

  // ── Empty panels ──────────────────────────────────────────────────────────

  it('renders without crashing when panels array is empty', () => {
    const block = makeBlock({ panels: [] });
    const { container } = render(<StickyScrollTabsBlockRender block={block} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(document.querySelectorAll('.ssct-tab')).toHaveLength(0);
    expect(document.querySelectorAll('.ssct-panel')).toHaveLength(0);
  });

  // ── Scroll outer height ───────────────────────────────────────────────────

  it('sets outer scroll wrapper min-height based on panel count', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const outer = document.querySelector<HTMLElement>('.ssct-scroll-outer');
    expect(outer?.style.minHeight).toBe('300vh'); // 3 panels × 100vh
  });

  it('outer scroll height is at least 100vh when panels is empty', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock({ panels: [] })} />);
    const outer = document.querySelector<HTMLElement>('.ssct-scroll-outer');
    expect(outer?.style.minHeight).toBe('100vh'); // Math.max(1, 0) = 1
  });

  // ── Custom color props ────────────────────────────────────────────────────

  it('applies custom activeTabBackground to first (active) tab', () => {
    const block = makeBlock({ activeTabBackground: '#ff0000' });
    render(<StickyScrollTabsBlockRender block={block} />);
    const firstTab = document.querySelectorAll<HTMLButtonElement>('.ssct-tab')[0];
    expect(firstTab.style.background).toBe('rgb(255, 0, 0)');
  });

  it('applies custom inactiveTabBackground to inactive tabs', () => {
    const block = makeBlock({ inactiveTabBackground: '#0000ff' });
    render(<StickyScrollTabsBlockRender block={block} />);
    const secondTab = document.querySelectorAll<HTMLButtonElement>('.ssct-tab')[1];
    expect(secondTab.style.background).toBe('rgb(0, 0, 255)');
  });

  // ── Tab click calls window.scrollTo ──────────────────────────────────────

  it('clicking a desktop tab does not throw', () => {
    // In jsdom, offsetHeight/innerHeight are 0 so handleTabClick exits early
    // (total <= 0). Verify the click handler wires up without crashing.
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const tabs = document.querySelectorAll<HTMLButtonElement>('.ssct-tab');
    expect(() => fireEvent.click(tabs[1])).not.toThrow();
  });

  it('clicking a mobile tab pill calls window.scrollTo', () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const pills = document.querySelectorAll<HTMLButtonElement>('.ssct-mobile-tab');
    fireEvent.click(pills[1]);
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  // ── stickyTopOffset ───────────────────────────────────────────────────────

  it('applies custom stickyTopOffset to sticky stage', () => {
    const block = makeBlock({ stickyTopOffset: 120 });
    render(<StickyScrollTabsBlockRender block={block} />);
    const stage = document.querySelector<HTMLElement>('.ssct-stage');
    expect(stage?.style.top).toBe('120px');
  });

  // ── panelMinHeight ────────────────────────────────────────────────────────

  it('applies custom panelMinHeight to the panel canvas', () => {
    const block = makeBlock({ panelMinHeight: '80vh' });
    render(<StickyScrollTabsBlockRender block={block} />);
    const panelsEl = document.querySelector<HTMLElement>('.ssct-panels');
    expect(panelsEl?.style.minHeight).toBe('80vh');
  });

  // ── data attributes on panels ─────────────────────────────────────────────

  it('sets data-panel-id on each panel', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const panels = document.querySelectorAll<HTMLElement>('.ssct-panel');
    expect(panels[0].dataset.panelId).toBe('panel-a');
    expect(panels[1].dataset.panelId).toBe('panel-b');
    expect(panels[2].dataset.panelId).toBe('panel-c');
  });

  it('sets data-panel-index on each panel', () => {
    render(<StickyScrollTabsBlockRender block={makeBlock()} />);
    const panels = document.querySelectorAll<HTMLElement>('.ssct-panel');
    expect(panels[0].dataset.panelIndex).toBe('0');
    expect(panels[1].dataset.panelIndex).toBe('1');
    expect(panels[2].dataset.panelIndex).toBe('2');
  });
});
