// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// framer-motion -> plain element passthrough
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, animate, ...rest }: any) {
      return React.createElement(
        tag,
        { className, style, 'data-motion': tag, 'data-animate': JSON.stringify(animate ?? null), ...rest },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return { motion };
});

// react-fast-marquee — render children directly so we can assert on them
vi.mock('react-fast-marquee', () => ({
  __esModule: true,
  default: ({ children, style, direction, speed, pauseOnHover }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'marquee',
        'data-direction': direction,
        'data-speed': String(speed),
        'data-pause-hover': String(pauseOnHover),
        style,
      },
      children,
    ),
}));

// useTheme — controllable per test
const themeState: { resolvedTheme: 'light' | 'dark'; toggleTheme: ReturnType<typeof vi.fn> } = {
  resolvedTheme: 'light',
  toggleTheme: vi.fn(),
};
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => themeState,
}));

// elementStyles helper — return empty object (covers branch where styles absent)
vi.mock('@/lib/utils/elementStyles', () => ({
  getElementCSS: (_styles: any, _el: string) => ({}),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { AnimatedText } from '@/components/ui/AnimatedText';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { MarqueeBlockRender } from '@/components/blocks/render/MarqueeBlockRender';

beforeEach(() => {
  themeState.resolvedTheme = 'light';
  themeState.toggleTheme = vi.fn();
});

// ---------------------------------------------------------------------------
// AnimatedText
// ---------------------------------------------------------------------------
describe('AnimatedText', () => {
  it('renders each letter as its own motion span', () => {
    const { container } = render(<AnimatedText text="Hi" />);
    const spans = container.querySelectorAll('[data-motion="span"]');
    expect(spans).toHaveLength(2);
    expect(container.textContent).toBe('Hi');
  });

  it('replaces spaces with non-breaking spaces', () => {
    const { container } = render(<AnimatedText text="A B" />);
    const spans = container.querySelectorAll('[data-motion="span"]');
    expect(spans).toHaveLength(3);
    // middle span is a non-breaking space
    expect(spans[1].textContent).toBe(' ');
  });

  it('applies the supplied className to the wrapper span', () => {
    const { container } = render(<AnimatedText text="X" className="my-class" />);
    const wrapper = container.querySelector('span.my-class');
    expect(wrapper).toBeTruthy();
  });

  it('falls back to no className when none supplied', () => {
    const { container } = render(<AnimatedText text="X" />);
    // outer wrapper span is the first child
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper.className).toBe('');
  });

  it('emits a non-trivial animate prop when hovered', () => {
    const { container } = render(<AnimatedText text="A" isHovered />);
    const span = container.querySelector('[data-motion="span"]') as HTMLElement;
    const animate = span.getAttribute('data-animate');
    expect(animate).toContain('y');
    // when hovered, y is an array [0, -8, 0]
    expect(animate).toContain('-8');
  });

  it('emits a static animate when not hovered', () => {
    const { container } = render(<AnimatedText text="A" isHovered={false} />);
    const span = container.querySelector('[data-motion="span"]') as HTMLElement;
    expect(span.getAttribute('data-animate')).toBe(JSON.stringify({ y: 0 }));
  });
});

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------
describe('ThemeToggle', () => {
  it('renders a labelled button', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /toggle theme/i });
    expect(btn).toBeTruthy();
  });

  it('shows the sun icon when in dark mode', () => {
    themeState.resolvedTheme = 'dark';
    const { container } = render(<ThemeToggle />);
    const path = container.querySelector('svg path');
    // sun-ish path starts with "M12 3v1"
    expect(path?.getAttribute('d')).toMatch(/M12 3v1/);
  });

  it('shows the moon icon when in light mode', () => {
    themeState.resolvedTheme = 'light';
    const { container } = render(<ThemeToggle />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('d')).toMatch(/M20\.354 15\.354/);
  });

  it('invokes toggleTheme on click', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(themeState.toggleTheme).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accordion / AccordionItem
// ---------------------------------------------------------------------------
describe('Accordion', () => {
  it('wraps children with default spacing classes', () => {
    const { container } = render(
      <Accordion>
        <div data-testid="child">child</div>
      </Accordion>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('space-y-4');
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('applies an extra className when provided', () => {
    const { container } = render(<Accordion className="extra-class">x</Accordion>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('extra-class');
    expect(wrapper.className).toContain('space-y-4');
  });
});

describe('AccordionItem', () => {
  it('hides body content by default', () => {
    render(
      <AccordionItem title="Section">
        <p>hidden body</p>
      </AccordionItem>,
    );
    expect(screen.queryByText('hidden body')).toBeNull();
    expect(screen.getByText('Section')).toBeTruthy();
  });

  it('shows body when defaultOpen=true', () => {
    render(
      <AccordionItem title="Section" defaultOpen>
        <p>visible body</p>
      </AccordionItem>,
    );
    expect(screen.getByText('visible body')).toBeTruthy();
  });

  it('toggles open/closed when the header button is clicked', () => {
    render(
      <AccordionItem title="Toggle Me">
        <span>panel text</span>
      </AccordionItem>,
    );
    const btn = screen.getByRole('button', { name: /toggle me/i });

    // initially closed
    expect(screen.queryByText('panel text')).toBeNull();

    fireEvent.click(btn);
    expect(screen.getByText('panel text')).toBeTruthy();

    fireEvent.click(btn);
    expect(screen.queryByText('panel text')).toBeNull();
  });

  it('rotates the chevron icon when open', () => {
    const { container } = render(
      <AccordionItem title="Rotates" defaultOpen>
        <span />
      </AccordionItem>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toMatch(/rotate-180/);
  });
});

// ---------------------------------------------------------------------------
// MarqueeBlockRender
// ---------------------------------------------------------------------------
describe('MarqueeBlockRender', () => {
  const baseBlock: any = {
    id: 'mq1',
    type: 'marquee',
    items: [],
  };

  it('renders nothing when there are no items', () => {
    const { container } = render(<MarqueeBlockRender block={baseBlock} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders text items inside the marquee', () => {
    const block: any = {
      ...baseBlock,
      items: [
        { id: 'a', type: 'text', content: 'hello' },
        { id: 'b', type: 'text', content: 'world' },
      ],
    };
    render(<MarqueeBlockRender block={block} />);
    expect(screen.getByTestId('marquee')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('world')).toBeTruthy();
  });

  it('wraps items in an anchor when a link is provided', () => {
    const block: any = {
      ...baseBlock,
      items: [{ id: 'a', type: 'text', content: 'click', link: 'https://example.com' }],
    };
    const { container } = render(<MarqueeBlockRender block={block} />);
    const anchor = container.querySelector('a[href="https://example.com"]');
    expect(anchor).toBeTruthy();
    expect(anchor?.textContent).toContain('click');
  });

  it('renders an image item with the supplied URL and alt', () => {
    const block: any = {
      ...baseBlock,
      items: [
        {
          id: 'img1',
          type: 'image',
          imageUrl: '/logo.png',
          imageAlt: 'Logo',
        },
      ],
    };
    const { container } = render(<MarqueeBlockRender block={block} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/logo.png');
    expect(img?.getAttribute('alt')).toBe('Logo');
  });

  it('renders an icon item via material-icons span', () => {
    const block: any = {
      ...baseBlock,
      items: [{ id: 'i1', type: 'icon', content: 'star' }],
    };
    const { container } = render(<MarqueeBlockRender block={block} />);
    const icon = container.querySelector('span.material-icons');
    expect(icon).toBeTruthy();
    expect(icon?.textContent).toBe('star');
  });

  it('forwards direction and speed to the marquee', () => {
    const block: any = {
      ...baseBlock,
      direction: 'right',
      speed: 120,
      pauseOnHover: true,
      items: [{ id: 't', type: 'text', content: 'x' }],
    };
    render(<MarqueeBlockRender block={block} />);
    const mq = screen.getByTestId('marquee');
    expect(mq.getAttribute('data-direction')).toBe('right');
    expect(mq.getAttribute('data-speed')).toBe('120');
    expect(mq.getAttribute('data-pause-hover')).toBe('true');
  });

  it('applies fixed height wrapper when direction is vertical', () => {
    const block: any = {
      ...baseBlock,
      direction: 'up',
      height: '300px',
      items: [{ id: 't', type: 'text', content: 'x' }],
    };
    const { container } = render(<MarqueeBlockRender block={block} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.height).toBe('300px');
    expect(outer.style.overflow).toBe('hidden');
  });

  it('omits the height wrapper styles when horizontal', () => {
    const block: any = {
      ...baseBlock,
      direction: 'left',
      height: '300px',
      items: [{ id: 't', type: 'text', content: 'x' }],
    };
    const { container } = render(<MarqueeBlockRender block={block} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.height).toBe('');
  });
});
