// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock framer-motion — Button/Card both pull in motion.<tag>. Each tag is
// returned as a plain element forwarding children, className, style, and ref.
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
  return { motion };
});

// next/link — Card and Button use it when given a link/href.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Components under test
// ---------------------------------------------------------------------------
import { CtaBlockRender } from '@/components/blocks/render/CtaBlockRender';
import { TestimonialBlockRender } from '@/components/blocks/render/TestimonialBlockRender';
import { CardGridBlockRender } from '@/components/blocks/render/CardGridBlockRender';
import { LogoStripBlockRender } from '@/components/blocks/render/LogoStripBlockRender';

// ---------------------------------------------------------------------------
// CtaBlockRender
// ---------------------------------------------------------------------------
describe('CtaBlockRender', () => {
  const baseBlock = {
    type: 'cta',
    title: 'Ready to start?',
    primaryButtonText: 'Sign up',
    primaryButtonUrl: '/signup',
  };

  it('renders the title and primary button text', () => {
    const { container } = render(<CtaBlockRender block={baseBlock as any} />);
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe('Ready to start?');
    expect(screen.getByText('Sign up')).not.toBeNull();
  });

  it('marks the title with data-editable-field="title"', () => {
    const { container } = render(<CtaBlockRender block={baseBlock as any} />);
    const h2 = container.querySelector('h2');
    expect(h2?.getAttribute('data-editable-field')).toBe('title');
  });

  it('omits the description paragraph when not provided', () => {
    const { container } = render(<CtaBlockRender block={baseBlock as any} />);
    const desc = container.querySelector('[data-editable-field="description"]');
    expect(desc).toBeNull();
  });

  it('renders the description when provided', () => {
    const block = { ...baseBlock, description: 'Join the team today' };
    const { container } = render(<CtaBlockRender block={block as any} />);
    const desc = container.querySelector('[data-editable-field="description"]');
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe('Join the team today');
  });

  it('renders the secondary button only when both text and url are present', () => {
    const block = {
      ...baseBlock,
      secondaryButtonText: 'Learn more',
      secondaryButtonUrl: '/about',
    };
    render(<CtaBlockRender block={block as any} />);
    expect(screen.getByText('Learn more')).not.toBeNull();
  });

  it('does not render the secondary button when only the text is set', () => {
    const block = { ...baseBlock, secondaryButtonText: 'Learn more' };
    render(<CtaBlockRender block={block as any} />);
    expect(screen.queryByText('Learn more')).toBeNull();
  });

  it('uses the default gradient backgroundStyle (no bg class) when unset', () => {
    const { container } = render(<CtaBlockRender block={baseBlock as any} />);
    const section = container.querySelector('section') as HTMLElement;
    // gradient is applied via inline style; class shouldn't include solid bg
    expect(section.className).not.toContain('bg-primary/10');
    expect(section.getAttribute('style') || '').toContain('linear-gradient');
  });

  it('uses bg-primary/10 class when backgroundStyle is "solid"', () => {
    const block = { ...baseBlock, backgroundStyle: 'solid' };
    const { container } = render(<CtaBlockRender block={block as any} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.className).toContain('bg-primary/10');
  });

  it('applies no gradient inline style when backgroundStyle="none"', () => {
    const block = { ...baseBlock, backgroundStyle: 'none' };
    const { container } = render(<CtaBlockRender block={block as any} />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section.getAttribute('style') || '').not.toContain('linear-gradient');
  });

  it('drops the default text-4xl class when style.fontSize is set', () => {
    const block = { ...baseBlock, style: { fontSize: '32px' } };
    const { container } = render(<CtaBlockRender block={block as any} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).not.toContain('text-4xl');
  });

  it('keeps the default text-4xl class when style.fontSize is unset', () => {
    const { container } = render(<CtaBlockRender block={baseBlock as any} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).toContain('text-4xl');
  });
});

// ---------------------------------------------------------------------------
// TestimonialBlockRender
// ---------------------------------------------------------------------------
describe('TestimonialBlockRender', () => {
  const baseBlock = {
    type: 'testimonial',
    quote: 'This product is amazing.',
    author: 'Jane Doe',
  };

  it('renders the quote text inside a blockquote', () => {
    const { container } = render(<TestimonialBlockRender block={baseBlock as any} />);
    const bq = container.querySelector('blockquote');
    expect(bq?.textContent).toBe('This product is amazing.');
  });

  it('renders the author text inside a cite', () => {
    const { container } = render(<TestimonialBlockRender block={baseBlock as any} />);
    const cite = container.querySelector('cite');
    expect(cite?.textContent).toContain('Jane Doe');
  });

  it('marks the quote with data-editable-field="quote"', () => {
    const { container } = render(<TestimonialBlockRender block={baseBlock as any} />);
    const bq = container.querySelector('blockquote');
    expect(bq?.getAttribute('data-editable-field')).toBe('quote');
  });

  it('renders the avatar img when avatar is provided', () => {
    const block = { ...baseBlock, avatar: 'https://cdn.example.com/jane.jpg' };
    const { container } = render(<TestimonialBlockRender block={block as any} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/jane.jpg');
    expect(img?.getAttribute('alt')).toBe('Jane Doe');
  });

  it('omits the avatar img when avatar is unset', () => {
    const { container } = render(<TestimonialBlockRender block={baseBlock as any} />);
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });

  it('renders role + "at" + company when both are present', () => {
    const block = { ...baseBlock, role: 'CEO', company: 'Acme Co' };
    const { container } = render(<TestimonialBlockRender block={block as any} />);
    expect(container.textContent).toContain('CEO');
    expect(container.textContent).toContain('at');
    expect(container.textContent).toContain('Acme Co');
  });

  it('omits the role/company line when neither is present', () => {
    const { container } = render(<TestimonialBlockRender block={baseBlock as any} />);
    // The role/company wrapper is "text-sm text-muted-foreground"
    const sub = container.querySelector('.text-sm.text-muted-foreground');
    expect(sub).toBeNull();
  });

  it('renders only the role when company is missing (no "at" connector)', () => {
    const block = { ...baseBlock, role: 'CEO' };
    const { container } = render(<TestimonialBlockRender block={block as any} />);
    const sub = container.querySelector('.text-sm.text-muted-foreground');
    expect(sub?.textContent).toBe('CEO');
  });

  it('drops the default text-xl class when style.fontSize is set', () => {
    const block = { ...baseBlock, style: { fontSize: '18px' } };
    const { container } = render(<TestimonialBlockRender block={block as any} />);
    const bq = container.querySelector('blockquote') as HTMLElement;
    expect(bq.className).not.toContain('text-xl');
  });

  it('drops the default font-medium class when style.fontWeight is set', () => {
    const block = { ...baseBlock, style: { fontWeight: '700' } };
    const { container } = render(<TestimonialBlockRender block={block as any} />);
    const bq = container.querySelector('blockquote') as HTMLElement;
    expect(bq.className).not.toContain('font-medium');
  });

  it('drops the default text-foreground class when style.color is set', () => {
    const block = { ...baseBlock, style: { color: '#ff0000' } };
    const { container } = render(<TestimonialBlockRender block={block as any} />);
    const bq = container.querySelector('blockquote') as HTMLElement;
    expect(bq.className).not.toContain('text-foreground');
  });
});

// ---------------------------------------------------------------------------
// CardGridBlockRender
// ---------------------------------------------------------------------------
describe('CardGridBlockRender', () => {
  const baseBlock = {
    type: 'card-grid',
    cards: [
      { id: 'a', title: 'Card A', description: 'First card' },
      { id: 'b', title: 'Card B', description: 'Second card' },
    ],
  };

  it('renders one card per item in the cards array', () => {
    const { container } = render(<CardGridBlockRender block={baseBlock as any} />);
    // Each Card renders a <h3> for the title
    const h3s = container.querySelectorAll('h3');
    expect(h3s.length).toBe(2);
  });

  it('renders the title heading when block.title is set', () => {
    const block = { ...baseBlock, title: 'Our Features' };
    const { container } = render(<CardGridBlockRender block={block as any} />);
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe('Our Features');
    expect(h2?.getAttribute('data-editable-field')).toBe('title');
  });

  it('omits the title section when neither title nor description are set', () => {
    const { container } = render(<CardGridBlockRender block={baseBlock as any} />);
    const h2 = container.querySelector('h2');
    expect(h2).toBeNull();
    const desc = container.querySelector('[data-editable-field="description"]');
    expect(desc).toBeNull();
  });

  it('renders the description paragraph when set', () => {
    const block = { ...baseBlock, description: 'Browse our offerings' };
    const { container } = render(<CardGridBlockRender block={block as any} />);
    const desc = container.querySelector('[data-editable-field="description"]');
    expect(desc?.textContent).toBe('Browse our offerings');
  });

  it('uses md:grid-cols-2 column class when columns=2', () => {
    const block = { ...baseBlock, columns: 2 };
    const { container } = render(<CardGridBlockRender block={block as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('md:grid-cols-2');
    expect(grid?.className).not.toContain('lg:grid-cols-3');
  });

  it('defaults to 3 columns (md:grid-cols-2 lg:grid-cols-3) when columns is unset', () => {
    const { container } = render(<CardGridBlockRender block={baseBlock as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('lg:grid-cols-3');
  });

  it('uses lg:grid-cols-4 when columns=4', () => {
    const block = { ...baseBlock, columns: 4 };
    const { container } = render(<CardGridBlockRender block={block as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('lg:grid-cols-4');
  });

  it('renders 0 cards when block.cards is missing', () => {
    const block = { type: 'card-grid' };
    const { container } = render(<CardGridBlockRender block={block as any} />);
    const h3s = container.querySelectorAll('h3');
    expect(h3s.length).toBe(0);
  });

  it('falls back to card.body when description is missing', () => {
    const block = {
      type: 'card-grid',
      cards: [{ id: 'x', title: 'X', body: 'body-as-description' }],
    };
    const { container } = render(<CardGridBlockRender block={block as any} />);
    // Card renders description in a <p>
    const ps = container.querySelectorAll('p');
    const hasBody = Array.from(ps).some((p) => p.textContent?.includes('body-as-description'));
    expect(hasBody).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LogoStripBlockRender
// ---------------------------------------------------------------------------
describe('LogoStripBlockRender', () => {
  const baseBlock = {
    type: 'logo-strip',
    logos: [
      { id: 'l1', imageUrl: 'https://cdn.example.com/1.png', alt: 'Acme' },
      { id: 'l2', imageUrl: 'https://cdn.example.com/2.png', alt: 'Beta', link: 'https://beta.example.com' },
    ],
  };

  it('renders one img per logo', () => {
    const { container } = render(<LogoStripBlockRender block={baseBlock as any} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute('src')).toBe('https://cdn.example.com/1.png');
    expect(imgs[0].getAttribute('alt')).toBe('Acme');
  });

  it('wraps a logo in an <a> when logo.link is set', () => {
    const { container } = render(<LogoStripBlockRender block={baseBlock as any} />);
    const anchor = container.querySelector('a[href="https://beta.example.com"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('aria-label')).toBe('Beta');
    expect(anchor?.querySelector('img')).not.toBeNull();
  });

  it('wraps a logo in a div when logo.link is not set', () => {
    const { container } = render(<LogoStripBlockRender block={baseBlock as any} />);
    const firstImg = container.querySelectorAll('img')[0];
    // Parent of the unlinked logo should not be an anchor
    expect(firstImg.parentElement?.tagName).toBe('DIV');
  });

  it('renders the overline when set', () => {
    const block = { ...baseBlock, overline: 'Trusted by' };
    const { container } = render(<LogoStripBlockRender block={block as any} />);
    const overline = container.querySelector('[data-editable-field="overline"]');
    expect(overline).not.toBeNull();
    expect(overline?.textContent).toBe('Trusted by');
  });

  it('omits the overline element when not set', () => {
    const { container } = render(<LogoStripBlockRender block={baseBlock as any} />);
    const overline = container.querySelector('[data-editable-field="overline"]');
    expect(overline).toBeNull();
  });

  it('applies grayscale class when grayscale is true (default)', () => {
    const { container } = render(<LogoStripBlockRender block={baseBlock as any} />);
    const img = container.querySelector('img');
    expect(img?.className).toContain('grayscale');
  });

  it('omits grayscale class when grayscale=false', () => {
    const block = { ...baseBlock, grayscale: false };
    const { container } = render(<LogoStripBlockRender block={block as any} />);
    const img = container.querySelector('img');
    expect(img?.className).not.toContain('grayscale');
  });

  it('uses the provided logoHeight on each img style', () => {
    const block = { ...baseBlock, logoHeight: '64px' };
    const { container } = render(<LogoStripBlockRender block={block as any} />);
    const img = container.querySelector('img') as HTMLElement;
    expect(img.style.height).toBe('64px');
    expect(img.style.maxHeight).toBe('64px');
  });

  it('defaults to a 6-column responsive grid', () => {
    const { container } = render(<LogoStripBlockRender block={baseBlock as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('md:grid-cols-6');
  });

  it('applies the correct grid class when columns=4', () => {
    const block = { ...baseBlock, columns: 4 };
    const { container } = render(<LogoStripBlockRender block={block as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('md:grid-cols-4');
  });

  it('uses gap-10 class by default (gap=lg)', () => {
    const { container } = render(<LogoStripBlockRender block={baseBlock as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('gap-10');
  });

  it('uses gap-4 class when gap="sm"', () => {
    const block = { ...baseBlock, gap: 'sm' };
    const { container } = render(<LogoStripBlockRender block={block as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('gap-4');
  });

  it('uses justify-start class when alignment="left"', () => {
    const block = { ...baseBlock, alignment: 'left' };
    const { container } = render(<LogoStripBlockRender block={block as any} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('justify-start');
  });

  it('renders an empty grid when logos is missing', () => {
    const block = { type: 'logo-strip' };
    const { container } = render(<LogoStripBlockRender block={block as any} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(0);
  });
});
