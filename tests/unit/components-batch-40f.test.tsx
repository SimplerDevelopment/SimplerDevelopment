// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / framer-motion / next deps
// ---------------------------------------------------------------------------

// Mock framer-motion so we don't pull in animation runtime / IntersectionObserver.
// Each motion.<tag> returns a plain element that forwards children + className + style.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, onClick }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: React.MouseEventHandler }) {
      return React.createElement(
        tag,
        { className, style, onClick, 'data-motion': tag },
        children,
      );
    };
  const motion: Record<string, React.ComponentType<{ children?: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: React.MouseEventHandler }>> = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

// next/link — render plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children?: React.ReactNode; href?: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Mock Icon to avoid pulling in Material Icons font loader
vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name, className, size, style }: { name?: string; className?: string; size?: string | number; style?: React.CSSProperties }) =>
    React.createElement(
      'span',
      { 'data-testid': 'icon', 'data-icon-name': name, className, style, 'data-size': size },
      name,
    ),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { Hero } from '@/components/sections/Hero';
import { ServicesGrid, type Service } from '@/components/sections/ServicesGrid';
import { Button } from '@/components/ui/Button';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

describe('Hero', () => {
  it('renders the title as an h1', () => {
    render(<Hero title="Welcome Home" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Welcome Home');
  });

  it('renders the default CTA pointing to /contact when no link given', () => {
    render(<Hero title="Hi" />);
    const cta = screen.getByRole('link', { name: 'Get Started' }) as HTMLAnchorElement;
    expect(cta.getAttribute('href')).toBe('/contact');
  });

  it('uses provided ctaText and ctaLink when supplied', () => {
    render(<Hero title="Hi" ctaText="Sign Up" ctaLink="/signup" />);
    const cta = screen.getByRole('link', { name: 'Sign Up' }) as HTMLAnchorElement;
    expect(cta.getAttribute('href')).toBe('/signup');
  });

  it('does not render subtitle paragraph when subtitle prop is omitted', () => {
    const { container } = render(<Hero title="Hi" />);
    // Should not have an uppercase tracking-wide paragraph
    expect(container.querySelector('p.uppercase')).toBeNull();
  });

  it('renders subtitle when provided', () => {
    render(<Hero title="Hi" subtitle="Hello world" />);
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders description when provided', () => {
    render(<Hero title="Hi" description="A nice description" />);
    expect(screen.getByText('A nice description')).toBeTruthy();
  });

  it('does not render the secondary CTA unless both text and link are provided', () => {
    render(<Hero title="Hi" secondaryCtaText="Learn" />);
    expect(screen.queryByRole('link', { name: 'Learn' })).toBeNull();
  });

  it('renders the secondary CTA when both text and link are provided', () => {
    render(<Hero title="Hi" secondaryCtaText="Learn More" secondaryCtaLink="/about" />);
    const sec = screen.getByRole('link', { name: 'Learn More' }) as HTMLAnchorElement;
    expect(sec.getAttribute('href')).toBe('/about');
  });

  it('no longer renders the removed scroll indicator svg', () => {
    const { container } = render(<Hero title="Hi" />);
    // The bouncing scroll indicator (svg path d="M19 14l-7 7m0 0l-7-7m7 7V3")
    // was removed from Hero — assert it stays gone.
    const path = container.querySelector('path[d="M19 14l-7 7m0 0l-7-7m7 7V3"]');
    expect(path).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ServicesGrid
// ---------------------------------------------------------------------------

const sampleServices: Service[] = [
  { id: 's1', title: 'Web Design', description: 'Beautiful sites' },
  { id: 's2', title: 'SEO', description: 'Get found', link: '/seo', icon: 'search' },
  { id: 's3', title: 'Branding', description: 'Stand out', image: '/img/brand.jpg' },
];

describe('ServicesGrid', () => {
  it('renders one Card per service entry', () => {
    render(<ServicesGrid services={sampleServices} />);
    expect(screen.getByText('Web Design')).toBeTruthy();
    expect(screen.getByText('SEO')).toBeTruthy();
    expect(screen.getByText('Branding')).toBeTruthy();
  });

  it('renders the title heading when title prop is given', () => {
    render(<ServicesGrid title="Our Services" services={sampleServices} />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toBe('Our Services');
  });

  it('renders the description paragraph when description prop is given', () => {
    render(
      <ServicesGrid
        title="Services"
        description="What we offer"
        services={sampleServices}
      />,
    );
    expect(screen.getByText('What we offer')).toBeTruthy();
  });

  it('does not render the header block when title and description are both omitted', () => {
    const { container } = render(<ServicesGrid services={sampleServices} />);
    expect(container.querySelector('h2')).toBeNull();
  });

  it('renders an empty grid (no cards) when services is empty', () => {
    render(<ServicesGrid services={[]} />);
    expect(screen.queryByText('Web Design')).toBeNull();
  });

  it('passes the icon name through to the Card mock', () => {
    render(<ServicesGrid services={[sampleServices[1]]} />);
    const icon = screen.getByTestId('icon');
    expect(icon.getAttribute('data-icon-name')).toBe('search');
  });

  it('wraps each card in a link when service.link is set', () => {
    render(<ServicesGrid services={[sampleServices[1]]} />);
    // The Card itself wraps in a Link when link is set
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/seo');
  });
});

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

describe('Button', () => {
  it('renders as a <button> when no href is provided', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn.tagName.toLowerCase()).toBe('button');
  });

  it('renders as an <a> when href is provided', () => {
    render(<Button href="/go">Click me</Button>);
    const link = screen.getByRole('link', { name: 'Click me' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/go');
  });

  it('calls onClick when the button is clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Tap' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a real <button> (not a link) when disabled is true even if href is given', () => {
    render(
      <Button href="/go" disabled>
        Disabled
      </Button>,
    );
    // disabled short-circuits the link branch
    expect(screen.queryByRole('link')).toBeNull();
    const btn = screen.getByRole('button', { name: 'Disabled' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('applies the outline variant classes', () => {
    render(<Button variant="outline">Out</Button>);
    const btn = screen.getByRole('button', { name: 'Out' });
    expect(btn.className).toContain('border-2');
    expect(btn.className).toContain('border-primary');
  });

  it('applies size classes for the lg size', () => {
    render(<Button size="lg">Big</Button>);
    const btn = screen.getByRole('button', { name: 'Big' });
    expect(btn.className).toContain('px-8');
    expect(btn.className).toContain('py-4');
    expect(btn.className).toContain('text-lg');
  });

  it('applies the warm variant classes', () => {
    render(<Button variant="warm">Warm</Button>);
    const btn = screen.getByRole('button', { name: 'Warm' });
    expect(btn.className).toContain('bg-accent-warm');
  });

  it('forwards type="submit" to the underlying button', () => {
    render(<Button type="submit">Send</Button>);
    const btn = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(btn.type).toBe('submit');
  });

  it('merges custom className with the variant classes', () => {
    render(<Button className="my-extra">x</Button>);
    const btn = screen.getByRole('button', { name: 'x' });
    expect(btn.className).toContain('my-extra');
  });

  it('forwards custom inline styles to the button', () => {
    render(<Button style={{ backgroundColor: 'rgb(255, 0, 0)' }}>Styled</Button>);
    const btn = screen.getByRole('button', { name: 'Styled' }) as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });
});

// ---------------------------------------------------------------------------
// Accordion / AccordionItem
// ---------------------------------------------------------------------------

describe('Accordion', () => {
  it('renders children inside the container', () => {
    render(
      <Accordion>
        <span data-testid="leaf">leaf</span>
      </Accordion>,
    );
    expect(screen.getByTestId('leaf')).toBeTruthy();
  });

  it('applies the default space-y spacing class', () => {
    const { container } = render(
      <Accordion>
        <span>x</span>
      </Accordion>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('space-y-4');
  });

  it('appends a custom className when provided', () => {
    const { container } = render(
      <Accordion className="extra-cls">
        <span>x</span>
      </Accordion>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('extra-cls');
    expect(wrapper.className).toContain('space-y-4');
  });
});

describe('AccordionItem', () => {
  it('renders the title in the trigger button', () => {
    render(
      <AccordionItem title="Section One">
        <p>body</p>
      </AccordionItem>,
    );
    expect(screen.getByRole('button', { name: /Section One/ })).toBeTruthy();
  });

  it('starts collapsed by default — children not in the DOM', () => {
    render(
      <AccordionItem title="Hidden">
        <p data-testid="content">secret</p>
      </AccordionItem>,
    );
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('starts open when defaultOpen is true — children visible', () => {
    render(
      <AccordionItem title="Open" defaultOpen>
        <p data-testid="content">visible</p>
      </AccordionItem>,
    );
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('toggles open and closed when the trigger button is clicked', () => {
    render(
      <AccordionItem title="Toggle">
        <p data-testid="content">tg</p>
      </AccordionItem>,
    );
    const btn = screen.getByRole('button', { name: /Toggle/ });
    expect(screen.queryByTestId('content')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByTestId('content')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('rotates the chevron svg when open', () => {
    const { container } = render(
      <AccordionItem title="Chev" defaultOpen>
        <p>x</p>
      </AccordionItem>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') || '').toContain('rotate-180');
  });
});
