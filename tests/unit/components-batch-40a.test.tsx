// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / framer-motion / next deps used transitively by Button
// ---------------------------------------------------------------------------

// framer-motion — passthrough proxy
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, ...rest }: any) {
      // strip framer-only props that would otherwise warn as unknown DOM props
      const {
        whileHover: _wh,
        whileTap: _wt,
        whileInView: _wv,
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t,
        viewport: _v,
        ...domSafe
      } = rest;
      void _wh; void _wt; void _wv; void _i; void _a; void _e; void _t; void _v;
      return React.createElement(
        tag,
        { className, style, 'data-motion': tag, ...domSafe },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    { get: (_t, prop: string) => passthrough(prop) },
  );
  return {
    motion,
    AnimatePresence: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: () => () => {} } }),
    useTransform: () => '0%',
  };
});

// next/link — plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { TextBlockRender } from '@/components/blocks/render/TextBlockRender';
import { CtaBlockRender } from '@/components/blocks/render/CtaBlockRender';
import { TestimonialBlockRender } from '@/components/blocks/render/TestimonialBlockRender';
import { AccordionBlockRender } from '@/components/blocks/render/AccordionBlockRender';

// Common base fields satisfying BaseBlock
const base = (id: string, type: string, order = 0) => ({ id, type, order });

// ---------------------------------------------------------------------------
// TextBlockRender
// ---------------------------------------------------------------------------

describe('TextBlockRender', () => {
  it('renders plain text content in a <p> when no HTML markup is present', () => {
    const block: any = { ...base('t1', 'text'), content: 'Hello world' };
    const { container } = render(<TextBlockRender block={block} />);
    const p = container.querySelector('p[data-editable-field="content"]');
    expect(p).toBeTruthy();
    expect(p?.textContent).toBe('Hello world');
  });

  it('applies the left alignment class by default and base size classes', () => {
    const block: any = { ...base('t2', 'text'), content: 'aligned text' };
    const { container } = render(<TextBlockRender block={block} />);
    const p = container.querySelector('p[data-editable-field="content"]') as HTMLElement;
    expect(p.className).toContain('text-left');
    expect(p.className).toContain('text-base');
    expect(p.className).toContain('leading-relaxed');
  });

  it('honors center alignment and the sm size option', () => {
    const block: any = {
      ...base('t3', 'text'),
      content: 'small centered',
      alignment: 'center',
      size: 'sm',
    };
    const { container } = render(<TextBlockRender block={block} />);
    const p = container.querySelector('p[data-editable-field="content"]') as HTMLElement;
    expect(p.className).toContain('text-center');
    expect(p.className).toContain('text-sm');
  });

  it('renders HTML body via dangerouslySetInnerHTML when content contains markup', () => {
    const block: any = { ...base('t4', 'text'), content: '<em>italic</em>' };
    const { container } = render(<TextBlockRender block={block} />);
    const div = container.querySelector('div[data-editable-field="content"]');
    expect(div).toBeTruthy();
    expect(div?.querySelector('em')).toBeTruthy();
  });

  it('renders the legacy heading + body shape (no canonical content)', () => {
    const block: any = {
      ...base('t5', 'text'),
      heading: 'Section Heading',
      body: 'Section body copy.',
    };
    const { container } = render(<TextBlockRender block={block} />);
    const h2 = container.querySelector('h2[data-editable-field="heading"]');
    expect(h2?.textContent).toBe('Section Heading');
    const p = container.querySelector('p[data-editable-field="content"]');
    expect(p?.textContent).toBe('Section body copy.');
  });

  it('drops the "leading-relaxed text-..." size class when a custom fontSize is set in style', () => {
    const block: any = {
      ...base('t6', 'text'),
      content: 'styled',
      style: { fontSize: '20px' },
    };
    const { container } = render(<TextBlockRender block={block} />);
    const p = container.querySelector('p[data-editable-field="content"]') as HTMLElement;
    // hasCustomFontSize branch → sizeClass collapses to 'leading-relaxed'
    expect(p.className).not.toContain('text-base');
    expect(p.className).toContain('leading-relaxed');
  });
});

// ---------------------------------------------------------------------------
// CtaBlockRender
// ---------------------------------------------------------------------------

describe('CtaBlockRender', () => {
  it('renders title and primary button text', () => {
    const block: any = {
      ...base('c1', 'cta'),
      title: 'Big Title',
      primaryButtonText: 'Click Me',
      primaryButtonUrl: '/go',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    const h2 = container.querySelector('h2[data-editable-field="title"]');
    expect(h2?.textContent).toBe('Big Title');
    // Button is rendered as an anchor via next/link mock
    const primary = container.querySelector('a[href="/go"]');
    expect(primary).toBeTruthy();
    expect(primary?.textContent).toContain('Click Me');
  });

  it('renders the description paragraph when provided', () => {
    const block: any = {
      ...base('c2', 'cta'),
      title: 'T',
      description: 'A description for the CTA.',
      primaryButtonText: 'Go',
      primaryButtonUrl: '/x',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    const desc = container.querySelector('p[data-editable-field="description"]');
    expect(desc).toBeTruthy();
    expect(desc?.textContent).toContain('A description');
  });

  it('omits the description paragraph when not provided', () => {
    const block: any = {
      ...base('c3', 'cta'),
      title: 'No Desc',
      primaryButtonText: 'Go',
      primaryButtonUrl: '/x',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    expect(container.querySelector('p[data-editable-field="description"]')).toBeNull();
  });

  it('renders the secondary button only when both text and url are supplied', () => {
    const block: any = {
      ...base('c4', 'cta'),
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

  it('does not render a secondary button when only secondaryButtonText is set', () => {
    const block: any = {
      ...base('c5', 'cta'),
      title: 'T',
      primaryButtonText: 'A',
      primaryButtonUrl: '/a',
      secondaryButtonText: 'B', // no url
    };
    const { container } = render(<CtaBlockRender block={block} />);
    // Only one anchor (primary)
    const anchors = container.querySelectorAll('a');
    expect(anchors.length).toBe(1);
  });

  it('applies a gradient background style by default (when bgStyle is "gradient" or missing)', () => {
    const block: any = {
      ...base('c6', 'cta'),
      title: 'T',
      primaryButtonText: 'A',
      primaryButtonUrl: '/a',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.getAttribute('style')).toMatch(/linear-gradient/);
  });

  it('applies the bg-primary/10 solid-background class when backgroundStyle is "solid"', () => {
    const block: any = {
      ...base('c7', 'cta'),
      title: 'T',
      primaryButtonText: 'A',
      primaryButtonUrl: '/a',
      backgroundStyle: 'solid',
    };
    const { container } = render(<CtaBlockRender block={block} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.className).toContain('bg-primary/10');
  });
});

// ---------------------------------------------------------------------------
// TestimonialBlockRender
// ---------------------------------------------------------------------------

describe('TestimonialBlockRender', () => {
  it('renders the quote, author, role and company', () => {
    const block: any = {
      ...base('q1', 'testimonial'),
      quote: 'Great service!',
      author: 'Jane Doe',
      role: 'CEO',
      company: 'Acme',
    };
    const { container } = render(<TestimonialBlockRender block={block} />);
    const bq = container.querySelector('blockquote[data-editable-field="quote"]');
    expect(bq?.textContent).toBe('Great service!');
    expect(container.querySelector('[data-editable-field="author"]')?.textContent).toBe(
      'Jane Doe',
    );
    // role and company combined with " at "
    expect(container.textContent).toContain('CEO');
    expect(container.textContent).toContain('Acme');
    expect(container.textContent).toContain(' at ');
  });

  it('omits the role/company sub-line when neither is provided', () => {
    const block: any = {
      ...base('q2', 'testimonial'),
      quote: 'q',
      author: 'a',
    };
    const { container } = render(<TestimonialBlockRender block={block} />);
    // The text-sm muted line only renders when role or company present.
    const muted = container.querySelector('.text-sm.text-muted-foreground');
    expect(muted).toBeNull();
  });

  it('renders an avatar img when avatar is set', () => {
    const block: any = {
      ...base('q3', 'testimonial'),
      quote: 'q',
      author: 'a',
      avatar: 'https://example.com/face.jpg',
    };
    const { container } = render(<TestimonialBlockRender block={block} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/face.jpg');
    expect(img?.getAttribute('alt')).toBe('a');
  });

  it('does not render an avatar img when avatar is not set', () => {
    const block: any = {
      ...base('q4', 'testimonial'),
      quote: 'q',
      author: 'a',
    };
    const { container } = render(<TestimonialBlockRender block={block} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders just the role with no " at " separator when company is missing', () => {
    const block: any = {
      ...base('q5', 'testimonial'),
      quote: 'q',
      author: 'a',
      role: 'Founder',
    };
    const { container } = render(<TestimonialBlockRender block={block} />);
    const muted = container.querySelector('.text-sm.text-muted-foreground') as HTMLElement;
    expect(muted).toBeTruthy();
    expect(muted.textContent).toContain('Founder');
    expect(muted.textContent).not.toContain(' at ');
  });
});

// ---------------------------------------------------------------------------
// AccordionBlockRender
// ---------------------------------------------------------------------------

describe('AccordionBlockRender', () => {
  it('renders the optional title when provided', () => {
    const block: any = {
      ...base('a1', 'accordion'),
      title: 'FAQ',
      items: [],
    };
    const { container } = render(<AccordionBlockRender block={block} />);
    const h3 = container.querySelector('h3');
    expect(h3).toBeTruthy();
    expect(h3?.innerHTML).toBe('FAQ');
  });

  it('does not render a title heading when title is omitted', () => {
    const block: any = { ...base('a2', 'accordion'), items: [] };
    const { container } = render(<AccordionBlockRender block={block} />);
    expect(container.querySelector('h3')).toBeNull();
  });

  it('renders one button per item with the item title', () => {
    const block: any = {
      ...base('a3', 'accordion'),
      items: [
        { id: 'i1', title: 'First Q', content: 'First A' },
        { id: 'i2', title: 'Second Q', content: 'Second A' },
      ],
    };
    const { container } = render(<AccordionBlockRender block={block} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].innerHTML).toContain('First Q');
    expect(buttons[1].innerHTML).toContain('Second Q');
  });

  it('opens an item when its button is clicked and hides it again on a second click', () => {
    const block: any = {
      ...base('a4', 'accordion'),
      items: [{ id: 'only', title: 'Title', content: '<p>Body Content</p>' }],
    };
    const { container } = render(<AccordionBlockRender block={block} />);
    // Initially closed — no content div rendered
    expect(container.textContent).not.toContain('Body Content');
    const btn = container.querySelector('button')!;
    fireEvent.click(btn);
    expect(container.textContent).toContain('Body Content');
    fireEvent.click(btn);
    expect(container.textContent).not.toContain('Body Content');
  });

  it('rotates the chevron svg when an item is open', () => {
    const block: any = {
      ...base('a5', 'accordion'),
      items: [{ id: 'only', title: 'T', content: 'C' }],
    };
    const { container } = render(<AccordionBlockRender block={block} />);
    const svgBefore = container.querySelector('svg') as SVGElement;
    expect(svgBefore.getAttribute('class') || '').not.toContain('rotate-180');
    fireEvent.click(container.querySelector('button')!);
    const svgAfter = container.querySelector('svg') as SVGElement;
    expect(svgAfter.getAttribute('class') || '').toContain('rotate-180');
  });

  it('handles a missing items array gracefully', () => {
    const block: any = { ...base('a6', 'accordion') };
    const { container } = render(<AccordionBlockRender block={block} />);
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
