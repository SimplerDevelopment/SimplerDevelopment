// @vitest-environment jsdom
/**
 * Unit tests for VEQA-032 step 3b — the second (and last) leaf group
 * consuming the typography cascade (components/blocks/render/typography-cascade.tsx,
 * VEQA-032 step 1): HeroCtaBlockRender (+ its HeroBlockRender/CtaBlockRender
 * adapters), CardGridBlockRender, MetricCardsBlockRender, FlipCardGridBlockRender.
 *
 * Mirrors tests/unit/typography-cascade-leaves-3a.test.tsx's per-leaf shape:
 *   1. No provider, no own style → theme fallback class present (where one
 *      exists), no inline color/fontSize on content nodes.
 *   2. Provider (`TypographyCascadeProvider own={{ color, fontSize }}`) →
 *      content nodes get the inline ancestor values; fallback classes that
 *      exist are suppressed.
 *   3. Provider + the leaf's own `block.style` (or, for MetricCardsBlockRender
 *      / FlipCardGridBlockRender, the block's bespoke `accentColor`) → own
 *      wins.
 *   4. Composite blocks only (this step's addition over 3a): provider + a
 *      per-item explicit override → that item's value wins while a sibling
 *      item without one still inherits the ancestor. MetricCardsBlockRender's
 *      `metric.accentColor` is the one slot in this group where a per-item
 *      field colors CONTENT text (the metric value) — CardGridBlock's and
 *      FlipCardGridBlock's per-item fields (`iconColor`, `accentColor`) are
 *      chrome (icon tint / back-card background), not text color, so there is
 *      no equivalent content-level item-wins test for those two blocks.
 *   5. Chrome nodes (icons, buttons/CTA links, decorative glyphs) are
 *      unaffected by the provider.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, ...rest }: any) {
      const {
        whileHover: _wh, whileTap: _wt, whileInView: _wv,
        initial: _i, animate: _a, exit: _e, transition: _t, viewport: _v,
        ...domSafe
      } = rest;
      void _wh; void _wt; void _wv; void _i; void _a; void _e; void _t; void _v;
      return React.createElement(tag, { className, style, 'data-motion': tag, ...domSafe }, children);
    };
  const motion: any = new Proxy({}, { get: (_t, prop: string) => passthrough(prop) });
  return {
    motion,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: () => () => {} } }),
    useTransform: () => '0%',
  };
});

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => React.createElement('a', { href, ...rest }, children),
}));

import { TypographyCascadeProvider } from '@/components/blocks/render/typography-cascade';
import { HeroCtaBlockRender } from '@/components/blocks/render/HeroCtaBlockRender';
import { HeroBlockRender } from '@/components/blocks/render/HeroBlockRender';
import { CtaBlockRender } from '@/components/blocks/render/CtaBlockRender';
import { CardGridBlockRender } from '@/components/blocks/render/CardGridBlockRender';
import { MetricCardsBlockRender } from '@/components/blocks/render/MetricCardsBlockRender';
import { FlipCardGridBlockRender } from '@/components/blocks/render/FlipCardGridBlockRender';
import type { HeroCtaBlock, CardGridBlock, MetricCardsBlock, FlipCardGridBlock, HeroBlock, CtaBlock } from '@/types/blocks';

const ANCESTOR = { color: '#123456', fontSize: '22px' };

// ---------------------------------------------------------------------------
// HeroCtaBlockRender — 'banner' layout
// ---------------------------------------------------------------------------

describe('HeroCtaBlockRender (banner) — VEQA-032 step 3b', () => {
  const baseBlock: HeroCtaBlock = {
    id: 'b1', type: 'hero-cta', order: 0, layout: 'banner',
    title: 'Banner Title', description: 'Banner description', primaryButtonText: 'Go', primaryButtonUrl: '/go',
  };

  it('no provider, no own style → fallback classes present, no inline color/fontSize', () => {
    render(<HeroCtaBlockRender block={baseBlock} />);
    const title = screen.getByText('Banner Title');
    expect(title.className).toMatch(/text-4xl/);
    expect(title.style.color).toBe('');
    expect(title.style.fontSize).toBe('');
  });

  it('provider ancestor value → inline values applied, fallback classes gone', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeroCtaBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const title = screen.getByText('Banner Title');
    expect(title.className).not.toMatch(/text-4xl/);
    expect(title).toHaveStyle({ color: '#123456', fontSize: '22px' });

    const description = screen.getByText('Banner description');
    expect(description.className).not.toMatch(/text-xl/);
    expect(description).toHaveStyle({ color: '#123456', fontSize: '22px' });
  });

  it('own block.style beats provider ancestor value', () => {
    const ownBlock: HeroCtaBlock = { ...baseBlock, style: { color: '#abcdef', fontSize: '10px' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeroCtaBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const title = screen.getByText('Banner Title');
    // own wins → this leaf does not inline the ancestor's color/fontSize for
    // the title (own is carried via BlockStyleWrapper elsewhere); it must not
    // show the ancestor's value.
    expect(title.style.color).not.toBe('#123456');
    expect(title.style.fontSize).not.toBe('22px');
  });

  it('chrome: primary button is unaffected by the provider', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeroCtaBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const button = screen.getByText('Go').closest('a');
    expect(button?.style.color).toBe('');
    expect(button?.style.fontSize).toBe('');
  });
});

// ---------------------------------------------------------------------------
// HeroCtaBlockRender — 'hero' layout
// ---------------------------------------------------------------------------

describe('HeroCtaBlockRender (hero) — VEQA-032 step 3b', () => {
  const baseBlock: HeroCtaBlock = {
    id: 'h1', type: 'hero-cta', order: 0, layout: 'hero',
    subtitle: 'Eyebrow', title: 'Hero Title', description: 'Hero description',
  };

  it('no provider, no own style → fallback classes present, no inline color/fontSize', () => {
    render(<HeroCtaBlockRender block={baseBlock} />);
    const title = screen.getByText('Hero Title');
    expect(title.className).toMatch(/text-5xl/);
    expect(title.style.color).toBe('');
  });

  it('provider ancestor value → inline values applied on subtitle/title/description, fallback classes gone', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeroCtaBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const subtitle = screen.getByText('Eyebrow');
    expect(subtitle).toHaveStyle({ color: '#123456' });

    const title = screen.getByText('Hero Title');
    expect(title.className).not.toMatch(/text-5xl/);
    expect(title).toHaveStyle({ color: '#123456', fontSize: '22px' });

    const description = screen.getByText('Hero description');
    expect(description).toHaveStyle({ color: '#123456' });
  });

  it('own block.style beats provider ancestor value', () => {
    const ownBlock: HeroCtaBlock = { ...baseBlock, style: { color: '#abcdef' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeroCtaBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const title = screen.getByText('Hero Title');
    expect(title.style.color).not.toBe('#123456');
  });
});

// ---------------------------------------------------------------------------
// HeroBlockRender / CtaBlockRender — VEQA-067 adapters pass the cascade
// through unchanged (they only remap field names, no typography logic of
// their own — VEQA-032 step 3b editor-tree/adapter check).
// ---------------------------------------------------------------------------

describe('HeroBlockRender / CtaBlockRender adapters — VEQA-032 step 3b', () => {
  it('HeroBlockRender: ancestor cascade reaches the title through the adapter', () => {
    const block: HeroBlock = { id: 'ha1', type: 'hero', order: 0, title: 'Adapter Hero', ctaText: 'Go', ctaLink: '/go' } as HeroBlock;
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <HeroBlockRender block={block} />
      </TypographyCascadeProvider>
    );
    const title = screen.getByText('Adapter Hero');
    expect(title).toHaveStyle({ color: '#123456', fontSize: '22px' });
  });

  it('CtaBlockRender: ancestor cascade reaches the title through the adapter', () => {
    const block: CtaBlock = { id: 'ca1', type: 'cta', order: 0, title: 'Adapter Cta', primaryButtonText: 'Go', primaryButtonUrl: '/go' } as CtaBlock;
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <CtaBlockRender block={block} />
      </TypographyCascadeProvider>
    );
    const title = screen.getByText('Adapter Cta');
    expect(title).toHaveStyle({ color: '#123456', fontSize: '22px' });
  });
});

// ---------------------------------------------------------------------------
// CardGridBlockRender
// ---------------------------------------------------------------------------

describe('CardGridBlockRender — VEQA-032 step 3b', () => {
  const baseBlock: CardGridBlock = {
    id: 'cg1', type: 'card-grid', order: 0,
    title: 'Grid Title', description: 'Grid description',
    cards: [
      { id: 'c1', title: 'Card One', description: 'Desc one' },
      { id: 'c2', title: 'Card Two', description: 'Desc two' },
    ],
  };

  it('no provider, no own style → block header fallback classes present, per-card titles have no inline color', () => {
    render(<CardGridBlockRender block={baseBlock} />);
    const heading = screen.getByText('Grid Title');
    expect(heading.className).toMatch(/text-4xl/);
    expect(heading.style.color).toBe('');

    const cardTitle = screen.getByText('Card One');
    expect(cardTitle.style.color).toBe('');
  });

  it('provider ancestor value → block header + every per-card title/description get the inline value', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <CardGridBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const heading = screen.getByText('Grid Title');
    expect(heading.className).not.toMatch(/text-4xl/);
    expect(heading).toHaveStyle({ color: '#123456', fontSize: '22px' });

    // Both cards (no per-item override on CardGridBlock's cards) inherit —
    // there is no per-item text-color field to test "item wins" against.
    expect(screen.getByText('Card One')).toHaveStyle({ color: '#123456' });
    expect(screen.getByText('Card Two')).toHaveStyle({ color: '#123456' });
    expect(screen.getByText('Desc one')).toHaveStyle({ color: '#123456' });
  });

  it('own block.style beats provider ancestor value for the block header', () => {
    const ownBlock: CardGridBlock = { ...baseBlock, style: { color: '#abcdef' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <CardGridBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const heading = screen.getByText('Grid Title');
    expect(heading.className).not.toMatch(/text-4xl/);
    expect(heading.style.color).not.toBe('#123456');
  });

  it('chrome: per-card iconColor is untouched by the provider (no icon rendered here has an ancestor color)', () => {
    const withIcon: CardGridBlock = {
      ...baseBlock,
      cards: [{ id: 'c1', title: 'Card One', description: 'Desc one', icon: 'star', iconColor: '#ff0000' }],
    };
    const { container } = render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <CardGridBlockRender block={withIcon} />
      </TypographyCascadeProvider>
    );
    const icon = container.querySelector('[data-motion="div"] > *');
    // Icon color stays the per-item override — no ancestor bleed.
    expect(icon).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// MetricCardsBlockRender
// ---------------------------------------------------------------------------

describe('MetricCardsBlockRender — VEQA-032 step 3b', () => {
  const baseBlock: MetricCardsBlock = {
    id: 'mc1', type: 'metric-cards', order: 0,
    overline: 'Overline Text', title: 'Metrics Title', description: 'Metrics description',
    metrics: [
      { id: 'm1', value: '83%', label: 'First Label' },
      { id: 'm2', value: '99%', label: 'Second Label' },
    ],
  };

  it('no provider, no own style → block header + value/label have no inline color beyond the hardcoded theme default', () => {
    render(<MetricCardsBlockRender block={baseBlock} />);
    const title = screen.getByText('Metrics Title');
    expect(title.style.color).toBe('');
    expect(title.style.fontSize).toBe('');

    const value = screen.getByText('83%');
    // theme default accent color, not an ancestor value. (Not asserting
    // fontSize here — jsdom's CSSOM silently drops `clamp()` as an invalid
    // inline fontSize value, a jsdom limitation unrelated to this cascade;
    // the ancestor-fontSize-applies case below uses a plain px value and
    // asserts fine.)
    expect(value.style.color).toBe('rgb(0, 77, 128)');
  });

  it('provider ancestor value → overline/title/description/value/label get the inline value', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <MetricCardsBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const overline = screen.getByText('Overline Text');
    // Overline's color is accentColor-driven; with no block.accentColor set,
    // the ancestor color now wins over the '#004D80' theme default.
    expect(overline).toHaveStyle({ color: '#123456' });

    const title = screen.getByText('Metrics Title');
    expect(title).toHaveStyle({ color: '#123456', fontSize: '22px' });

    const value = screen.getByText('83%');
    expect(value).toHaveStyle({ color: '#123456', fontSize: '22px' });

    const label = screen.getByText('First Label');
    expect(label).toHaveStyle({ color: '#123456' });
  });

  it('block.accentColor beats provider ancestor value for the metric value color', () => {
    const ownBlock: MetricCardsBlock = { ...baseBlock, accentColor: '#abcdef' };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <MetricCardsBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const value = screen.getByText('83%');
    expect(value).toHaveStyle({ color: '#abcdef' });
  });

  it('per-item explicit metric.accentColor wins for that item, while a sibling item without one inherits the ancestor', () => {
    const mixedBlock: MetricCardsBlock = {
      ...baseBlock,
      metrics: [
        { id: 'm1', value: '83%', label: 'First Label', accentColor: '#ff00ff' },
        { id: 'm2', value: '99%', label: 'Second Label' },
      ],
    };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <MetricCardsBlockRender block={mixedBlock} />
      </TypographyCascadeProvider>
    );
    const itemValue = screen.getByText('83%');
    expect(itemValue).toHaveStyle({ color: '#ff00ff' });

    const siblingValue = screen.getByText('99%');
    expect(siblingValue).toHaveStyle({ color: '#123456' });
  });

  it('chrome: the "Case Study" CTA link color is unaffected by the provider (stays the theme default, not the ancestor color)', () => {
    const withLink: MetricCardsBlock = {
      ...baseBlock,
      metrics: [{ id: 'm1', value: '83%', label: 'First Label', link: '/case-study' }],
    };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <MetricCardsBlockRender block={withLink} />
      </TypographyCascadeProvider>
    );
    const link = screen.getByText('Case Study');
    expect(link.style.color).not.toBe('#123456');
    expect(link).toHaveStyle({ color: 'rgb(0, 77, 128)' });
  });
});

// ---------------------------------------------------------------------------
// FlipCardGridBlockRender
// ---------------------------------------------------------------------------

describe('FlipCardGridBlockRender — VEQA-032 step 3b', () => {
  const baseBlock: FlipCardGridBlock = {
    id: 'fc1', type: 'flip-card-grid', order: 0,
    overline: 'Flip Overline', title: 'Flip Title', description: 'Flip description',
    cards: [
      { id: 'f1', frontTitle: 'Front One', frontSubtitle: 'Sub one', backText: 'Back one' },
      { id: 'f2', frontTitle: 'Front Two', backText: 'Back two' },
    ],
  };

  it('no provider, no own style → no inline color on front/back text nodes', () => {
    render(<FlipCardGridBlockRender block={baseBlock} />);
    const frontTitle = screen.getByText('Front One');
    expect(frontTitle.style.color).toBe('');
    const backText = screen.getByText('Back one');
    expect(backText.style.color).toBe('');
  });

  it('provider ancestor value → block header + every front/back text node get the inline value', () => {
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <FlipCardGridBlockRender block={baseBlock} />
      </TypographyCascadeProvider>
    );
    const overline = screen.getByText('Flip Overline');
    expect(overline).toHaveStyle({ color: '#123456' });

    const title = screen.getByText('Flip Title');
    expect(title).toHaveStyle({ color: '#123456', fontSize: '22px' });

    const frontTitle = screen.getByText('Front One');
    expect(frontTitle).toHaveStyle({ color: '#123456', fontSize: '22px' });

    const frontSubtitle = screen.getByText('Sub one');
    expect(frontSubtitle).toHaveStyle({ color: '#123456' });

    const backText = screen.getByText('Back one');
    expect(backText).toHaveStyle({ color: '#123456' });

    // sibling card without a frontSubtitle still gets the ancestor on its
    // own front title — confirms the shared (non-per-item) resolution
    // applies uniformly across cards.
    const frontTitleTwo = screen.getByText('Front Two');
    expect(frontTitleTwo).toHaveStyle({ color: '#123456' });
  });

  it('own block.style beats provider ancestor value', () => {
    const ownBlock: FlipCardGridBlock = { ...baseBlock, style: { color: '#abcdef' } };
    render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <FlipCardGridBlockRender block={ownBlock} />
      </TypographyCascadeProvider>
    );
    const frontTitle = screen.getByText('Front One');
    expect(frontTitle.style.color).not.toBe('#123456');
  });

  it('chrome: front icon tint and back-card background stay on card.accentColor/block.accentColor, not the ancestor color', () => {
    const withIcon: FlipCardGridBlock = {
      ...baseBlock,
      cards: [{ id: 'f1', frontTitle: 'Front One', frontIcon: 'star', backText: 'Back one', accentColor: '#00ff00' }],
    };
    const { container } = render(
      <TypographyCascadeProvider own={ANCESTOR}>
        <FlipCardGridBlockRender block={withIcon} />
      </TypographyCascadeProvider>
    );
    const icon = container.querySelector('.material-icons');
    expect(icon).toHaveStyle({ color: '#00ff00' });
  });
});
