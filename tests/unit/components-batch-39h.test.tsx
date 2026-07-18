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
