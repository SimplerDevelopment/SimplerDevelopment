// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / framer-motion / next deps used transitively by Button
// (mirrors tests/unit/components-batch-40a.test.tsx conventions)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { HeroBlockRender } from '@/components/blocks/render/HeroBlockRender';
import { CtaBlockRender } from '@/components/blocks/render/CtaBlockRender';
import { HeroCtaBlockRender } from '@/components/blocks/render/HeroCtaBlockRender';

const base = (id: string, type: string, order = 0) => ({ id, type, order });

// ---------------------------------------------------------------------------
// (a) Legacy `hero` block renders through the adapter with identical content
// ---------------------------------------------------------------------------

describe('VEQA-067 — HeroBlockRender adapter (legacy hero)', () => {
  it('renders title, subtitle, description, and CTA text/link exactly as before', () => {
    const block: any = {
      ...base('h1', 'hero'),
      title: 'Welcome Home',
      subtitle: 'The Eyebrow',
      description: 'A short description.',
      ctaText: 'Get Started',
      ctaLink: '/start',
    };
    const { container } = render(<HeroBlockRender block={block} />);

    expect(container.querySelector('h1[data-editable-field="title"]')?.textContent).toBe('Welcome Home');
    expect(container.querySelector('p[data-editable-field="subtitle"]')?.textContent).toBe('The Eyebrow');
    expect(container.querySelector('p[data-editable-field="description"]')?.textContent).toBe('A short description.');

    const primary = container.querySelector('a[href="/start"]');
    expect(primary).toBeTruthy();
    expect(primary?.textContent).toContain('Get Started');
  });

  it('renders the secondary CTA only when both text and link are supplied', () => {
    const block: any = {
      ...base('h2', 'hero'),
      title: 'T',
      ctaText: 'A',
      ctaLink: '/a',
      secondaryCtaText: 'B',
      secondaryCtaLink: '/b',
    };
    const { container } = render(<HeroBlockRender block={block} />);
    expect(container.querySelector('a[href="/a"]')).toBeTruthy();
    expect(container.querySelector('a[href="/b"]')).toBeTruthy();
  });

  it('omits the primary CTA when ctaText/ctaLink are absent (matches pre-merge conditional)', () => {
    const block: any = { ...base('h3', 'hero'), title: 'No CTA here' };
    const { container } = render(<HeroBlockRender block={block} />);
    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it('renders a section (not the banner look) — full-bleed hero markup', () => {
    const block: any = { ...base('h4', 'hero'), title: 'T' };
    const { container } = render(<HeroBlockRender block={block} />);
    const section = container.querySelector('section');
    expect(section?.className).toContain('min-h-[60vh]');
  });
});

// ---------------------------------------------------------------------------
// (b) Legacy `cta` block renders through the adapter with identical content
// ---------------------------------------------------------------------------

describe('VEQA-067 — CtaBlockRender adapter (legacy cta)', () => {
  it('renders title and primary button text/link exactly as before', () => {
    const block: any = {
      ...base('c1', 'cta'),
      title: 'Big Title',
      primaryButtonText: 'Click Me',
      primaryButtonUrl: '/go',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    const h2 = container.querySelector('h2[data-editable-field="title"]');
    expect(h2?.textContent).toBe('Big Title');
    const primary = container.querySelector('a[href="/go"]');
    expect(primary).toBeTruthy();
    expect(primary?.textContent).toContain('Click Me');
  });

  it('always renders the primary button (unconditional, matching pre-merge CtaBlockRender)', () => {
    const block: any = { ...base('c2', 'cta'), title: 'T', primaryButtonText: 'Go', primaryButtonUrl: '/x' };
    const { container } = render(<CtaBlockRender block={block} />);
    expect(container.querySelector('a[href="/x"]')).toBeTruthy();
  });

  it('renders the secondary button only when both text and url are supplied', () => {
    const block: any = {
      ...base('c3', 'cta'),
      title: 'T',
      primaryButtonText: 'A',
      primaryButtonUrl: '/a',
      secondaryButtonText: 'B',
      secondaryButtonUrl: '/b',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    expect(container.querySelector('a[href="/a"]')).toBeTruthy();
    expect(container.querySelector('a[href="/b"]')).toBeTruthy();
  });

  it('applies a gradient background style by default', () => {
    const block: any = { ...base('c4', 'cta'), title: 'T', primaryButtonText: 'A', primaryButtonUrl: '/a' };
    const { container } = render(<CtaBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.getAttribute('style')).toMatch(/linear-gradient/);
  });

  it('applies the bg-primary/10 solid-background class when backgroundStyle is "solid"', () => {
    const block: any = {
      ...base('c5', 'cta'), title: 'T', primaryButtonText: 'A', primaryButtonUrl: '/a', backgroundStyle: 'solid',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.className).toContain('bg-primary/10');
  });
});

// ---------------------------------------------------------------------------
// (c) Native `hero-cta` block renders both layout variants
// ---------------------------------------------------------------------------

describe('VEQA-067 — HeroCtaBlockRender (native hero-cta)', () => {
  it("layout: 'hero' renders the full-bleed hero look with subtitle + primary/secondary buttons", () => {
    const block: any = {
      ...base('hc1', 'hero-cta'),
      layout: 'hero',
      title: 'Unified Hero',
      subtitle: 'Overline',
      description: 'Desc',
      primaryButtonText: 'Start',
      primaryButtonUrl: '/start',
      secondaryButtonText: 'Learn',
      secondaryButtonUrl: '/learn',
    };
    const { container } = render(<HeroCtaBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.className).toContain('min-h-[60vh]');
    expect(container.querySelector('h1[data-editable-field="title"]')?.textContent).toBe('Unified Hero');
    expect(container.querySelector('p[data-editable-field="subtitle"]')?.textContent).toBe('Overline');
    expect(container.querySelector('a[href="/start"]')?.textContent).toContain('Start');
    expect(container.querySelector('a[href="/learn"]')?.textContent).toContain('Learn');
  });

  it("layout: 'banner' renders the centered CTA-band look (h2 title, unconditional primary button)", () => {
    const block: any = {
      ...base('hc2', 'hero-cta'),
      layout: 'banner',
      title: 'Unified Banner',
      primaryButtonText: 'Buy Now',
      primaryButtonUrl: '/buy',
    };
    const { container } = render(<HeroCtaBlockRender block={block} />);
    expect(container.querySelector('section h2[data-editable-field="title"]')?.textContent).toBe('Unified Banner');
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('a[href="/buy"]')?.textContent).toContain('Buy Now');
  });

  it("layout: 'hero' omits the primary button when primaryButtonText/Url are absent", () => {
    const block: any = { ...base('hc3', 'hero-cta'), layout: 'hero', title: 'No button' };
    const { container } = render(<HeroCtaBlockRender block={block} />);
    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it("layout: 'banner' still renders the primary button even when text/url are absent (unconditional per legacy cta)", () => {
    const block: any = { ...base('hc4', 'hero-cta'), layout: 'banner', title: 'Empty button' };
    const { container } = render(<HeroCtaBlockRender block={block} />);
    // Button renders unconditionally in banner layout, but href is empty/undefined -> safeHref(undefined) is null
    const buttons = container.querySelectorAll('button, a');
    expect(buttons.length).toBeGreaterThan(0);
  });

  // VEQA-064 — the Content tab's Description field is a rich-text control
  // (RichTextField in panel-fields.tsx). Confirm the renderer treats the
  // stored value as HTML (dangerouslySetInnerHTML) for both layouts, so
  // formatting authored there (bold/links/lists) actually shows up rendered
  // rather than escaped as literal text.
  it("layout: 'hero' renders an HTML description as markup, not escaped text", () => {
    const block: any = {
      ...base('hc5', 'hero-cta'),
      layout: 'hero',
      title: 'T',
      description: 'A <strong>bold</strong> claim with a <a href="/more">link</a>.',
    };
    const { container } = render(<HeroCtaBlockRender block={block} />);
    const desc = container.querySelector('p[data-editable-field="description"]');
    expect(desc?.querySelector('strong')?.textContent).toBe('bold');
    expect(desc?.querySelector('a[href="/more"]')?.textContent).toBe('link');
    expect(desc?.innerHTML).not.toContain('&lt;strong&gt;');
  });

  it("layout: 'banner' renders an HTML description as markup, not escaped text", () => {
    const block: any = {
      ...base('hc6', 'hero-cta'),
      layout: 'banner',
      title: 'T',
      description: 'Save <strong>20%</strong> today.',
      primaryButtonText: 'Buy',
      primaryButtonUrl: '/buy',
    };
    const { container } = render(<HeroCtaBlockRender block={block} />);
    const desc = container.querySelector('p[data-editable-field="description"]');
    expect(desc?.querySelector('strong')?.textContent).toBe('20%');
  });
});

// ---------------------------------------------------------------------------
// (d) Field normalization mapping — adapters map legacy fields onto the
// canonical hero-cta shape before delegating to HeroCtaBlockRender.
// ---------------------------------------------------------------------------

describe('VEQA-067 — field normalization', () => {
  it('HeroBlockRender maps ctaText/ctaLink -> primaryButtonText/Url and secondaryCtaText/Link -> secondaryButtonText/Url', () => {
    const block: any = {
      ...base('n1', 'hero'),
      title: 'T',
      ctaText: 'Primary Text',
      ctaLink: '/primary-url',
      secondaryCtaText: 'Secondary Text',
      secondaryCtaLink: '/secondary-url',
    };
    const { container } = render(<HeroBlockRender block={block} />);
    const primary = container.querySelector('a[href="/primary-url"]');
    const secondary = container.querySelector('a[href="/secondary-url"]');
    expect(primary?.textContent).toContain('Primary Text');
    expect(secondary?.textContent).toContain('Secondary Text');
  });

  it('CtaBlockRender field names already match the canonical shape 1:1 (no renaming)', () => {
    const block: any = {
      ...base('n2', 'cta'),
      title: 'T',
      primaryButtonText: 'Same Name',
      primaryButtonUrl: '/same-url',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    const primary = container.querySelector('a[href="/same-url"]');
    expect(primary?.textContent).toContain('Same Name');
  });

  it('legacy elementStyles keys (cta/secondaryCta) still resolve through the hero adapter', () => {
    const block: any = {
      ...base('n3', 'hero'),
      title: 'T',
      ctaText: 'Styled',
      ctaLink: '/styled',
      elementStyles: { cta: { color: 'rgb(1, 2, 3)' } },
    };
    const { container } = render(<HeroBlockRender block={block} />);
    const primary = container.querySelector('a[href="/styled"]') as HTMLElement;
    expect(primary.style.color).toBe('rgb(1, 2, 3)');
  });

  it('HeroBlockRender still accepts the legacy LLM-authored headline/eyebrow/subheadline aliases', () => {
    const block: any = {
      ...base('n4', 'hero'),
      headline: 'Aliased Title',
      eyebrow: 'Aliased Subtitle',
      subheadline: 'Aliased Description',
    };
    const { container } = render(<HeroBlockRender block={block} />);
    expect(container.querySelector('h1[data-editable-field="title"]')?.textContent).toBe('Aliased Title');
    expect(container.querySelector('p[data-editable-field="subtitle"]')?.textContent).toBe('Aliased Subtitle');
    expect(container.querySelector('p[data-editable-field="description"]')?.textContent).toBe('Aliased Description');
  });
});
