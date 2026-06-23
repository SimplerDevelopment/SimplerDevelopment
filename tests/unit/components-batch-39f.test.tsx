// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock framer-motion so we don't pull in IntersectionObserver / animation
// runtime. Each motion.<tag> returns a plain element that forwards children,
// className, style, and ref.
// ---------------------------------------------------------------------------
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    React.forwardRef(function MotionMock(
      { children, className, style }: any,
      ref: any,
    ) {
      return React.createElement(
        tag,
        { className, style, ref, 'data-motion': tag },
        children,
      );
    });
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return {
    motion,
    useScroll: () => ({
      scrollYProgress: { get: () => 0, on: () => () => {} },
    }),
    useTransform: () => '0%',
  };
});

// ---------------------------------------------------------------------------
// Components under test
// ---------------------------------------------------------------------------
import { MotionDiv } from '@/components/animations/MotionDiv';
import { MotionSection } from '@/components/animations/MotionSection';
import { ParallaxSection } from '@/components/animations/ParallaxSection';
import { HeadingBlockRender } from '@/components/blocks/render/HeadingBlockRender';

// ---------------------------------------------------------------------------
// MotionDiv — re-export of motion.div
// ---------------------------------------------------------------------------
describe('MotionDiv', () => {
  it('renders as a div via the mocked motion proxy', () => {
    const { container } = render(
      <MotionDiv className="md-class">
        <span data-testid="md-child">hi</span>
      </MotionDiv>,
    );
    const wrapper = container.querySelector('[data-motion="div"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.tagName).toBe('DIV');
    expect(wrapper?.className).toContain('md-class');
    expect(screen.getByTestId('md-child').textContent).toBe('hi');
  });

  it('renders multiple children', () => {
    render(
      <MotionDiv>
        <span data-testid="a">a</span>
        <span data-testid="b">b</span>
      </MotionDiv>,
    );
    expect(screen.getByTestId('a').textContent).toBe('a');
    expect(screen.getByTestId('b').textContent).toBe('b');
  });

  it('forwards inline style', () => {
    const { container } = render(
      <MotionDiv style={{ color: 'red' }}>
        <span>x</span>
      </MotionDiv>,
    );
    const wrapper = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(wrapper.style.color).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// MotionSection — re-export of motion.section
// ---------------------------------------------------------------------------
describe('MotionSection', () => {
  it('renders as a section via the mocked motion proxy', () => {
    const { container } = render(
      <MotionSection className="ms-class">
        <p data-testid="ms-child">section</p>
      </MotionSection>,
    );
    const wrapper = container.querySelector('[data-motion="section"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.tagName).toBe('SECTION');
    expect(wrapper?.className).toContain('ms-class');
    expect(screen.getByTestId('ms-child').textContent).toBe('section');
  });

  it('renders without a className', () => {
    const { container } = render(
      <MotionSection>
        <span>only-child</span>
      </MotionSection>,
    );
    const wrapper = container.querySelector('[data-motion="section"]');
    expect(wrapper).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ParallaxSection — wraps children with a parallax motion.div
// ---------------------------------------------------------------------------
describe('ParallaxSection', () => {
  it('renders its children inside an outer div + inner motion.div', () => {
    const { container } = render(
      <ParallaxSection>
        <p data-testid="pl-child">parallax</p>
      </ParallaxSection>,
    );

    // outer ref'd div
    const outer = container.firstChild as HTMLElement;
    expect(outer).not.toBeNull();
    expect(outer.tagName).toBe('DIV');

    // inner motion.div (mocked to data-motion="div")
    const inner = outer.querySelector('[data-motion="div"]');
    expect(inner).not.toBeNull();

    expect(screen.getByTestId('pl-child').textContent).toBe('parallax');
  });

  it('forwards className to the outer wrapper, not the inner motion.div', () => {
    const { container } = render(
      <ParallaxSection className="outer-cls">
        <span>x</span>
      </ParallaxSection>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toBe('outer-cls');
  });

  it('defaults className to empty string', () => {
    const { container } = render(
      <ParallaxSection>
        <span>y</span>
      </ParallaxSection>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toBe('');
  });

  it('accepts a custom speed without throwing', () => {
    expect(() =>
      render(
        <ParallaxSection speed={2}>
          <span>fast</span>
        </ParallaxSection>,
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// HeadingBlockRender — pure heading renderer with level + alignment + html
// ---------------------------------------------------------------------------
describe('HeadingBlockRender', () => {
  it('renders an h2 with the provided content text', () => {
    const block: any = { type: 'heading', level: 2, content: 'Hello World' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toBe('Hello World');
  });

  it('renders the correct tag for each heading level', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const block: any = { type: 'heading', level, content: `Level ${level}` };
      const { container } = render(<HeadingBlockRender block={block} />);
      const tag = container.querySelector(`h${level}`);
      expect(tag).not.toBeNull();
      expect(tag?.textContent).toBe(`Level ${level}`);
    }
  });

  it('applies the alignment class (text-center) when alignment="center"', () => {
    const block: any = {
      type: 'heading',
      level: 3,
      content: 'centered',
      alignment: 'center',
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h3 = container.querySelector('h3') as HTMLElement;
    expect(h3.className).toContain('text-center');
  });

  it('defaults alignment to left', () => {
    const block: any = { type: 'heading', level: 2, content: 'default-align' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).toContain('text-left');
  });

  it('accepts legacy "text" field as a fallback for "content"', () => {
    const block: any = { type: 'heading', level: 4, text: 'legacy-text' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h4 = container.querySelector('h4');
    expect(h4?.textContent).toBe('legacy-text');
  });

  it('prefers "content" over "text" when both are present', () => {
    const block: any = {
      type: 'heading',
      level: 1,
      content: 'canonical',
      text: 'legacy',
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('canonical');
  });

  it('renders raw HTML via dangerouslySetInnerHTML when content contains "<"', () => {
    const block: any = {
      type: 'heading',
      level: 2,
      content: 'Hello <em>world</em>',
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2');
    expect(h2?.querySelector('em')?.textContent).toBe('world');
  });

  it('sets the data-editable-field attribute to "content"', () => {
    const block: any = { type: 'heading', level: 2, content: 'editable' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2');
    expect(h2?.getAttribute('data-editable-field')).toBe('content');
  });

  it('omits "text-foreground" class when style.color is set', () => {
    const block: any = {
      type: 'heading',
      level: 2,
      content: 'colored',
      style: { color: '#ff0000' },
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).not.toContain('text-foreground');
  });

  it('includes "text-foreground" class when style.color is unset', () => {
    const block: any = { type: 'heading', level: 2, content: 'plain' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).toContain('text-foreground');
  });
});
