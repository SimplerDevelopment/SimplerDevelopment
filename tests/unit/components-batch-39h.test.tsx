/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / framer-motion / next deps
// ---------------------------------------------------------------------------

// Mock framer-motion so we don't pull in animation runtime / IntersectionObserver.
// Each motion.<tag> returns a plain element that forwards children + className + style.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style }: any) {
      return React.createElement(tag, { className, style, 'data-motion': tag }, children);
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return {
    motion,
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: () => () => {} } }),
    useTransform: () => '0%',
  };
});

// next/link — render plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// next/navigation — usePathname is configurable per-test
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// next/dynamic — synchronously render the underlying default-exported component.
// AppsHeroWith3D uses dynamic() with .then((mod) => ({ default: mod.X })) — we
// stub it to return a tiny placeholder component so the test does not pull the
// real 3D scene.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function DynamicStub(props: any) {
      return React.createElement(
        'div',
        { 'data-testid': 'dynamic-stub', className: props?.className },
        null,
      );
    },
}));

// Mock the Hero section to keep AppsHeroWith3D test focused on the wrapper's
// own behavior (and avoid pulling in Button / FadeIn / SlideIn etc.).
vi.mock('@/components/sections/Hero', () => ({
  Hero: (props: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'hero-mock' },
      JSON.stringify({
        title: props.title,
        subtitle: props.subtitle,
        description: props.description,
        ctaText: props.ctaText,
        ctaLink: props.ctaLink,
        secondaryCtaText: props.secondaryCtaText,
        secondaryCtaLink: props.secondaryCtaLink,
      }),
    ),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { ParallaxSection } from '@/components/animations/ParallaxSection';
import { PetersFooter } from '@/components/peters-outdoor/PetersFooter';
import { PetersNavigation } from '@/components/peters-outdoor/PetersNavigation';
import { AppsHeroWith3D } from '@/components/sections/AppsHeroWith3D';

// ---------------------------------------------------------------------------
// ParallaxSection
// ---------------------------------------------------------------------------

describe('ParallaxSection', () => {
  it('renders children inside the outer wrapper', () => {
    render(
      <ParallaxSection>
        <p data-testid="child">parallax child</p>
      </ParallaxSection>,
    );
    expect(screen.getByTestId('child').textContent).toBe('parallax child');
  });

  it('applies the provided className to the outer wrapper', () => {
    const { container } = render(
      <ParallaxSection className="my-outer">
        <span>x</span>
      </ParallaxSection>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toBe('my-outer');
  });

  it('uses an empty className by default', () => {
    const { container } = render(
      <ParallaxSection>
        <span>x</span>
      </ParallaxSection>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toBe('');
  });

  it('renders a motion.div child wrapper from the mocked framer-motion', () => {
    const { container } = render(
      <ParallaxSection>
        <span data-testid="leaf">leaf</span>
      </ParallaxSection>,
    );
    // mocked motion.div sets data-motion="div"
    const motionDiv = container.querySelector('[data-motion="div"]');
    expect(motionDiv).toBeTruthy();
    expect(motionDiv?.querySelector('[data-testid="leaf"]')).toBeTruthy();
  });

  it('accepts a custom speed prop without crashing', () => {
    expect(() =>
      render(
        <ParallaxSection speed={0.8}>
          <span>fast</span>
        </ParallaxSection>,
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PetersFooter
// ---------------------------------------------------------------------------

describe('PetersFooter', () => {
  it('renders the brand name and tagline', () => {
    render(<PetersFooter />);
    expect(screen.getAllByText('W.H. Peters').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Outdoor Adventures/i).length).toBeGreaterThan(0);
  });

  it('renders the Explore section heading', () => {
    render(<PetersFooter />);
    expect(screen.getByText('Explore')).toBeTruthy();
  });

  it('renders all five Explore links pointing to /p/* routes', () => {
    render(<PetersFooter />);
    const labels = ['About', 'Tours', 'Reviews', 'Gallery', 'Book a Tour'];
    for (const label of labels) {
      const link = screen.getByRole('link', { name: label }) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toMatch(/^\/p\//);
    }
  }, 15_000);

  it('renders contact items (phone, email, location)', () => {
    render(<PetersFooter />);
    expect(screen.getByText('410-507-1025')).toBeTruthy();
    expect(screen.getByText('info@petersoutdoor.com')).toBeTruthy();
    expect(screen.getByText('Ocean Pines, MD')).toBeTruthy();
  });

  it('renders the copyright with the current year', () => {
    render(<PetersFooter />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} W\\.H\\. Peters`))).toBeTruthy();
  });

  it('renders Privacy Policy and Terms links in the bottom bar', () => {
    render(<PetersFooter />);
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText(/Terms.*Conditions/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PetersNavigation
// ---------------------------------------------------------------------------

describe('PetersNavigation', () => {
  beforeEach(() => {
    mockPathname = '/p/home';
  });

  afterEach(() => {
    mockPathname = '/';
  });

  it('renders the brand mark linking to /p/home', () => {
    render(<PetersNavigation />);
    const links = screen.getAllByRole('link', { name: /W\.H\. Peters/ });
    // Logo link should point to /p/home
    const logoLink = links.find((l) => (l as HTMLAnchorElement).getAttribute('href') === '/p/home');
    expect(logoLink).toBeTruthy();
  });

  it('renders the desktop nav links and the Book a Tour CTA', () => {
    render(<PetersNavigation />);
    const labels = ['Home', 'About', 'Tours', 'Reviews', 'Gallery'];
    for (const label of labels) {
      // Each appears once in desktop set (mobile menu closed by default)
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0);
    }
    const cta = screen.getAllByRole('link', { name: /Book a Tour/i });
    expect(cta.length).toBeGreaterThan(0);
    expect((cta[0] as HTMLAnchorElement).getAttribute('href')).toBe('/p/booking');
  });

  it('marks the active link based on pathname', () => {
    mockPathname = '/p/tours';
    render(<PetersNavigation />);
    const toursLinks = screen.getAllByRole('link', { name: 'Tours' });
    // The active desktop link gets the bg-[var(--po-forest)] class
    const active = toursLinks.find((l) => l.className.includes('bg-[var(--po-forest)]'));
    expect(active).toBeTruthy();
  });

  it('toggles the mobile menu when the menu button is clicked', () => {
    render(<PetersNavigation />);
    // Mobile menu starts closed — extra mobile links not yet rendered.
    // After clicking the toggle button, mobile menu opens (links duplicated).
    const homeBefore = screen.getAllByRole('link', { name: 'Home' }).length;
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    const homeAfter = screen.getAllByRole('link', { name: 'Home' }).length;
    expect(homeAfter).toBeGreaterThan(homeBefore);
  });

  it('closes the mobile menu when a mobile link is clicked', () => {
    render(<PetersNavigation />);
    const buttons = screen.getAllByRole('button');
    // Open the mobile menu
    fireEvent.click(buttons[0]);
    const aboutLinks = screen.getAllByRole('link', { name: 'About' });
    // The duplicate from the mobile menu is the last one
    const mobileAbout = aboutLinks[aboutLinks.length - 1];
    fireEvent.click(mobileAbout);
    // After clicking, mobile menu should collapse back
    const aboutAfter = screen.getAllByRole('link', { name: 'About' });
    expect(aboutAfter.length).toBeLessThan(aboutLinks.length);
  });
});

// ---------------------------------------------------------------------------
// AppsHeroWith3D
// ---------------------------------------------------------------------------

describe('AppsHeroWith3D', () => {
  it('renders the dynamic 3D background placeholder', () => {
    render(<AppsHeroWith3D />);
    expect(screen.getByTestId('dynamic-stub')).toBeTruthy();
  });

  it('renders the inner Hero with the expected marketing copy', () => {
    render(<AppsHeroWith3D />);
    const hero = screen.getByTestId('hero-mock');
    const props = JSON.parse(hero.textContent || '{}');
    expect(props.title).toBe('Digital Tools Built for Modern Web');
    expect(props.subtitle).toBe('Apps and Products');
    expect(props.description).toMatch(/suite of applications/i);
    expect(props.ctaText).toBe('Get Started');
    expect(props.ctaLink).toBe('/contact');
    expect(props.secondaryCtaText).toBe('View Solutions');
    expect(props.secondaryCtaLink).toBe('/solutions');
  });

  it('wraps the scene + hero in a relative positioning container', () => {
    const { container } = render(<AppsHeroWith3D />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('relative');
  });
});
