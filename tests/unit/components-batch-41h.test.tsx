// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// framer-motion -> plain element passthrough
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, ...rest }: any) {
      // Strip motion-only props so React doesn't warn about unknown DOM attrs
      const {
        whileHover: _wh,
        whileTap: _wt,
        whileInView: _wv,
        whileFocus: _wf,
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t,
        viewport: _v,
        variants: _va,
        ...domRest
      } = rest;
      return React.createElement(
        tag,
        { className, style, 'data-motion': tag, ...domRest },
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

// next/link -> plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Card';
import { Footer } from '@/components/ui/Footer';
import { KeyboardShortcutReference } from '@/components/ui/KeyboardShortcutReference';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------
describe('Icon', () => {
  it('returns null when no name is supplied', () => {
    const { container } = render(<Icon name="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a react-icons component for a mapped Material name', () => {
    const { container } = render(<Icon name="rocket_launch" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // react-icons renders an SVG with aria-hidden defaulted to true
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies numeric size as a px fontSize on the rendered SVG', () => {
    const { container } = render(<Icon name="home" size={24} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('style')).toContain('font-size: 24px');
  });

  it('passes through string size verbatim', () => {
    const { container } = render(<Icon name="home" size="2rem" />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('style')).toContain('font-size: 2rem');
  });

  it('forwards className to the resolved react-icons component', () => {
    const { container } = render(<Icon name="check" className="my-icon" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('my-icon');
  });

  it('falls back to a material-icons span when the name is not mapped', () => {
    const { container } = render(<Icon name="not_a_real_icon_xyz" />);
    const span = container.querySelector('span.material-icons');
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe('not_a_real_icon_xyz');
  });

  it('respects an explicit aria-hidden=false', () => {
    const { container } = render(<Icon name="not_mapped_icon_zzz" aria-hidden={false} />);
    const span = container.querySelector('span.material-icons');
    expect(span?.getAttribute('aria-hidden')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
describe('Card', () => {
  it('renders the title and description (no link, no image, no icon)', () => {
    const { container } = render(
      <Card title="Hello" description="A short description" />,
    );
    expect(container.querySelector('h3')?.innerHTML).toBe('Hello');
    expect(container.textContent).toContain('A short description');
    // No anchor wrapper when there is no link
    expect(container.querySelector('a')).toBeNull();
  });

  it('wraps the card in a Link when link is provided and shows the Learn more affordance', () => {
    const { container } = render(
      <Card title="Cardy" description="d" link="/somewhere" />,
    );
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('/somewhere');
    expect(container.textContent).toContain('Learn more');
  });

  it('renders the image when supplied', () => {
    const { container } = render(
      <Card title="t" description="d" image="https://example.com/x.jpg" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/x.jpg');
    expect(img?.getAttribute('alt')).toBe('t');
  });

  it('renders the icon (mapped) when icon prop is set', () => {
    const { container } = render(
      <Card title="t" description="d" icon="rocket_launch" iconSize="32" />,
    );
    // Mapped icon → svg, not a material-icons span
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { container } = render(
      <Card title="t" description="d" subtitle="my subtitle" />,
    );
    expect(container.textContent).toContain('my subtitle');
  });

  it('applies the provided className to the inner motion wrapper', () => {
    const { container } = render(
      <Card title="t" description="d" className="extra-card-class" />,
    );
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv).toBeTruthy();
    expect(motionDiv.className).toContain('extra-card-class');
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
describe('Footer', () => {
  it('renders the site name as the brand heading', () => {
    render(<Footer />);
    // siteConfig.name = "SimplerDevelopment"
    expect(screen.getByRole('heading', { level: 3, name: /SimplerDevelopment/i })).toBeTruthy();
  });

  it('renders the platform and company column headings', () => {
    render(<Footer />);
    expect(screen.getByRole('heading', { level: 4, name: /Platform/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: /Company/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: /Get in Touch/i })).toBeTruthy();
  });

  it('shows the current year in the copyright notice', () => {
    const { container } = render(<Footer />);
    const year = new Date().getFullYear();
    expect(container.textContent).toContain(String(year));
  });

  it('renders external social links with correct href and rel', () => {
    const { container } = render(<Footer />);
    const linkedin = container.querySelector('a[aria-label="LinkedIn"]') as HTMLAnchorElement;
    expect(linkedin).toBeTruthy();
    expect(linkedin.getAttribute('href')).toContain('linkedin.com');
    expect(linkedin.getAttribute('rel')).toBe('noopener noreferrer');
    expect(linkedin.getAttribute('target')).toBe('_blank');

    const github = container.querySelector('a[aria-label="GitHub"]') as HTMLAnchorElement;
    expect(github.getAttribute('href')).toContain('github.com');

    const twitter = container.querySelector('a[aria-label="Twitter"]') as HTMLAnchorElement;
    expect(twitter.getAttribute('href')).toContain('twitter.com');
  });

  it('renders internal nav links to the marketing pages', () => {
    const { container } = render(<Footer />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/solutions/websites');
    expect(hrefs).toContain('/solutions/email-marketing');
    expect(hrefs).toContain('/about');
    expect(hrefs).toContain('/blog');
    // Two distinct links to /contact (nav + the "Book a free consultation" CTA)
    expect(hrefs.filter((h) => h === '/contact').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the contact email', () => {
    const { container } = render(<Footer />);
    expect(container.textContent).toContain('info@simplerdevelopment.com');
  });
});

// ---------------------------------------------------------------------------
// KeyboardShortcutReference
// ---------------------------------------------------------------------------
describe('KeyboardShortcutReference', () => {
  it('renders nothing when isOpen=false', () => {
    const onClose = vi.fn();
    const { container } = render(
      <KeyboardShortcutReference isOpen={false} onClose={onClose} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal heading and a known shortcut when open', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    expect(screen.getByRole('heading', { level: 2, name: /Keyboard Shortcuts/i })).toBeTruthy();
    // The "Undo last action" description comes from EDITOR_SHORTCUTS
    expect(screen.getByText(/Undo last action/i)).toBeTruthy();
  });

  it('renders the four category section labels', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    expect(screen.getByRole('heading', { level: 3, name: /Editing/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /Blocks/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /Navigation/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /System/i })).toBeTruthy();
  });

  it('invokes onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    const btn = screen.getByTitle(/Close \(Esc\)/i);
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <KeyboardShortcutReference isOpen onClose={onClose} />,
    );
    // The outermost child is the backdrop (fixed inset-0 ... onClick=onClose)
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close when clicking inside the dialog content', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    // Click on the heading itself — should be stopPropagation-ed by the inner div
    fireEvent.click(screen.getByRole('heading', { level: 2, name: /Keyboard Shortcuts/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores non-Escape keypresses', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutReference isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
