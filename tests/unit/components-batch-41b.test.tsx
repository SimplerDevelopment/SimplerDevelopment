// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for transitive deps
// ---------------------------------------------------------------------------

// next/link — plain anchor passthrough
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// BrandingContext — return null so blocks fall back to their default styling.
// FeaturedContentBlockRender reads useBranding()?.buttonStyle which is safe
// against null but we want a deterministic value across the suite.
vi.mock('@/contexts/BrandingContext', () => ({
  __esModule: true,
  useBranding: () => null,
}));

// Icon — render a span carrying the icon name so tests can assert on it
vi.mock('@/components/ui/Icon', () => ({
  __esModule: true,
  Icon: ({ name, size, className }: any) =>
    React.createElement(
      'span',
      { 'data-icon': name, 'data-size': size, className: className || 'icon' },
      name,
    ),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { TimelineBlockRender } from '@/components/blocks/render/TimelineBlockRender';
import { MetricCardsBlockRender } from '@/components/blocks/render/MetricCardsBlockRender';
import { ServicesGridBlockRender } from '@/components/blocks/render/ServicesGridBlockRender';
import { FeaturedContentBlockRender } from '@/components/blocks/render/FeaturedContentBlockRender';

// BaseBlock-satisfying scaffold
const base = (id: string, type: string, order = 0) => ({ id, type, order });

// ---------------------------------------------------------------------------
// TimelineBlockRender
// ---------------------------------------------------------------------------

describe('TimelineBlockRender', () => {
  it('renders header overline, title, and subtitle when provided', () => {
    const block: any = {
      ...base('tl1', 'timeline'),
      overline: 'OUR PROCESS',
      title: 'How we work',
      subtitle: 'A simple three-step journey',
      steps: [],
    };
    const { container } = render(<TimelineBlockRender block={block} />);
    const h2 = container.querySelector('h2[data-editable-field="title"]');
    expect(h2?.innerHTML).toContain('How we work');
    // overline is the first <p> in the centered header div
    const header = container.querySelector('.text-center.mb-16');
    expect(header).toBeTruthy();
    expect(header?.textContent).toContain('OUR PROCESS');
    expect(header?.textContent).toContain('A simple three-step journey');
  });

  it('omits the header block entirely when overline, title, and subtitle are all missing', () => {
    const block: any = { ...base('tl2', 'timeline'), steps: [{ id: 's1', title: 'Step 1' }] };
    const { container } = render(<TimelineBlockRender block={block} />);
    expect(container.querySelector('.text-center.mb-16')).toBeNull();
  });

  it('renders one row per step using canonical fields', () => {
    const block: any = {
      ...base('tl3', 'timeline'),
      steps: [
        { id: 'a', title: 'Discover', description: 'Find the problem' },
        { id: 'b', title: 'Design', description: 'Plan the solution' },
        { id: 'c', title: 'Deliver', description: 'Ship it' },
      ],
    };
    const { container } = render(<TimelineBlockRender block={block} />);
    const stepRows = container.querySelectorAll('h3');
    expect(stepRows.length).toBe(3);
    expect(container.textContent).toContain('Discover');
    expect(container.textContent).toContain('Design');
    expect(container.textContent).toContain('Deliver');
  });

  it('falls back to label/body aliases when title/description are missing', () => {
    const block: any = {
      ...base('tl4', 'timeline'),
      steps: [{ label: 'Aliased Title', body: 'Aliased body copy' }],
    };
    const { container } = render(<TimelineBlockRender block={block} />);
    const h3 = container.querySelector('h3');
    expect(h3?.innerHTML).toContain('Aliased Title');
    const p = container.querySelector('p.text-sm.leading-relaxed');
    expect(p?.innerHTML).toContain('Aliased body copy');
  });

  it('renders a left-padded numeric badge derived from index when number is not supplied', () => {
    const block: any = {
      ...base('tl5', 'timeline'),
      steps: [
        { id: 's0', title: 'A' },
        { id: 's1', title: 'B' },
      ],
    };
    const { container } = render(<TimelineBlockRender block={block} />);
    // Mobile number element holds the zero-padded number text
    const mobileNums = container.querySelectorAll('.lg\\:hidden.absolute');
    expect(mobileNums[0]?.textContent).toBe('01');
    expect(mobileNums[1]?.textContent).toBe('02');
  });

  it('handles a missing steps array gracefully', () => {
    const block: any = { ...base('tl6', 'timeline'), title: 'Only Header' };
    const { container } = render(<TimelineBlockRender block={block} />);
    // No step rows
    expect(container.querySelectorAll('h3').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MetricCardsBlockRender
// ---------------------------------------------------------------------------

describe('MetricCardsBlockRender', () => {
  it('renders header title and description when provided', () => {
    const block: any = {
      ...base('m1', 'metric-cards'),
      title: 'Outcomes',
      description: 'What we delivered for our clients.',
      metrics: [],
    };
    const { container } = render(<MetricCardsBlockRender block={block} />);
    expect(container.querySelector('h2[data-editable-field="title"]')?.innerHTML).toContain(
      'Outcomes',
    );
    expect(
      container.querySelector('p[data-editable-field="description"]')?.innerHTML,
    ).toContain('What we delivered');
  });

  it('uses the 4-column grid class by default', () => {
    const block: any = { ...base('m2', 'metric-cards'), metrics: [] };
    const { container } = render(<MetricCardsBlockRender block={block} />);
    const grid = container.querySelector('.grid.grid-cols-1') as HTMLElement;
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
  });

  it('switches to a 3-column class set when columns=3', () => {
    const block: any = { ...base('m3', 'metric-cards'), columns: 3, metrics: [] };
    const { container } = render(<MetricCardsBlockRender block={block} />);
    const grid = container.querySelector('.grid.grid-cols-1') as HTMLElement;
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
  });

  it('wraps the card in an anchor when metric.link is set, plain div otherwise', () => {
    const block: any = {
      ...base('m4', 'metric-cards'),
      metrics: [
        { id: 'a', value: '99%', label: 'Retention', link: '/case-studies/a' },
        { id: 'b', value: '12x', label: 'Growth' },
      ],
    };
    const { container } = render(<MetricCardsBlockRender block={block} />);
    expect(container.querySelector('a[href="/case-studies/a"]')).toBeTruthy();
    // Anchor count equals number of linked metrics
    expect(container.querySelectorAll('a').length).toBe(1);
    // Both cards still render their values
    expect(container.textContent).toContain('99%');
    expect(container.textContent).toContain('12x');
  });

  it('renders the institution row only when institution or institutionLogo is set', () => {
    const block: any = {
      ...base('m5', 'metric-cards'),
      metrics: [
        { id: 'i1', value: '1', label: 'L', institution: 'Acme Co' },
        { id: 'i2', value: '2', label: 'L' },
      ],
    };
    const { container } = render(<MetricCardsBlockRender block={block} />);
    // Only the first metric has the institution border-t row
    const instRows = container.querySelectorAll('.border-t.border-gray-100');
    expect(instRows.length).toBe(1);
    expect(instRows[0].textContent).toContain('Acme Co');
  });

  it('renders the linkText label and the arrow_forward icon for linked metrics', () => {
    const block: any = {
      ...base('m6', 'metric-cards'),
      metrics: [
        { id: 'l1', value: 'X', label: 'L', link: '/x', linkText: 'See more' },
      ],
    };
    const { container } = render(<MetricCardsBlockRender block={block} />);
    expect(container.textContent).toContain('See more');
    const icon = container.querySelector('[data-icon="arrow_forward"]');
    expect(icon).toBeTruthy();
  });

  it('falls back to the "Case Study" link label when linkText is omitted', () => {
    const block: any = {
      ...base('m7', 'metric-cards'),
      metrics: [{ id: 'cs', value: 'X', label: 'L', link: '/x' }],
    };
    const { container } = render(<MetricCardsBlockRender block={block} />);
    expect(container.textContent).toContain('Case Study');
  });
});

// ---------------------------------------------------------------------------
// ServicesGridBlockRender
// ---------------------------------------------------------------------------

describe('ServicesGridBlockRender', () => {
  it('uses a 3-column class set by default', () => {
    const block: any = { ...base('s1', 'services-grid'), services: [] };
    const { container } = render(<ServicesGridBlockRender block={block} />);
    const grid = container.querySelector('.grid.grid-cols-1') as HTMLElement;
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
  });

  it('uses the 4-column variant when columns=4', () => {
    const block: any = { ...base('s2', 'services-grid'), columns: 4, services: [] };
    const { container } = render(<ServicesGridBlockRender block={block} />);
    const grid = container.querySelector('.grid.grid-cols-1') as HTMLElement;
    expect(grid.className).toContain('lg:grid-cols-4');
  });

  it('renders an <img> when service.image is set and skips the material-icons span', () => {
    const block: any = {
      ...base('s3', 'services-grid'),
      services: [
        {
          id: 'sv1',
          title: 'Strategy',
          description: 'Plan',
          image: 'https://cdn/x.svg',
        },
      ],
    };
    const { container } = render(<ServicesGridBlockRender block={block} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn/x.svg');
    // No icon span when image is present
    expect(container.querySelector('span.material-icons')).toBeNull();
  });

  it('renders a material-icons span when only icon is set (no image)', () => {
    const block: any = {
      ...base('s4', 'services-grid'),
      services: [{ id: 'sv2', title: 'Design', icon: 'palette' }],
    };
    const { container } = render(<ServicesGridBlockRender block={block} />);
    const iconSpan = container.querySelector('span.material-icons');
    expect(iconSpan?.textContent).toBe('palette');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders bullets with default check_circle icon when bullet.icon is omitted', () => {
    const block: any = {
      ...base('s5', 'services-grid'),
      services: [
        {
          id: 'sv3',
          title: 'Build',
          bullets: [
            { id: 'b1', text: 'Fast' },
            { id: 'b2', text: 'Secure', icon: 'lock' },
          ],
        },
      ],
    };
    const { container } = render(<ServicesGridBlockRender block={block} />);
    const bulletIcons = container.querySelectorAll('ul span.material-icons');
    expect(bulletIcons.length).toBe(2);
    expect(bulletIcons[0].textContent).toBe('check_circle');
    expect(bulletIcons[1].textContent).toBe('lock');
  });

  it('renders the Learn More link with a default label when linkText is omitted', () => {
    const block: any = {
      ...base('s6', 'services-grid'),
      services: [{ id: 'sv4', title: 'Ship', link: '/services/ship' }],
    };
    const { container } = render(<ServicesGridBlockRender block={block} />);
    const anchor = container.querySelector('a[href="/services/ship"]');
    expect(anchor).toBeTruthy();
    expect(anchor?.textContent).toContain('Learn More');
  });

  it('respects custom linkText when provided', () => {
    const block: any = {
      ...base('s7', 'services-grid'),
      services: [
        { id: 'sv5', title: 'Ship', link: '/x', linkText: 'Read the brief' },
      ],
    };
    const { container } = render(<ServicesGridBlockRender block={block} />);
    expect(container.textContent).toContain('Read the brief');
  });
});

// ---------------------------------------------------------------------------
// FeaturedContentBlockRender
// ---------------------------------------------------------------------------

describe('FeaturedContentBlockRender', () => {
  it('renders the title and the optional description', () => {
    const block: any = {
      ...base('f1', 'featured-content'),
      title: 'Featured',
      description: 'A short blurb.',
    };
    const { container } = render(<FeaturedContentBlockRender block={block} />);
    expect(container.querySelector('h2[data-editable-field="title"]')?.innerHTML).toBe(
      'Featured',
    );
    expect(
      container.querySelector('p[data-editable-field="description"]')?.innerHTML,
    ).toBe('A short blurb.');
  });

  it('omits the description paragraph when description is not provided', () => {
    const block: any = { ...base('f2', 'featured-content'), title: 'No desc' };
    const { container } = render(<FeaturedContentBlockRender block={block} />);
    expect(container.querySelector('p[data-editable-field="description"]')).toBeNull();
  });

  it('renders a stats grid only when block.stats has entries', () => {
    const block: any = {
      ...base('f3', 'featured-content'),
      title: 'T',
      stats: [
        { id: 's1', value: '100+', label: 'Clients' },
        { id: 's2', value: '5yr', label: 'Track record' },
      ],
    };
    const { container } = render(<FeaturedContentBlockRender block={block} />);
    // Two stat values rendered as text content
    expect(container.textContent).toContain('100+');
    expect(container.textContent).toContain('Clients');
    expect(container.textContent).toContain('5yr');
    expect(container.textContent).toContain('Track record');
  });

  it('skips the stats grid when stats is missing or empty', () => {
    const block1: any = { ...base('f4a', 'featured-content'), title: 'T' };
    const { container: c1 } = render(<FeaturedContentBlockRender block={block1} />);
    expect(c1.querySelector('.grid.grid-cols-2')).toBeNull();

    const block2: any = { ...base('f4b', 'featured-content'), title: 'T', stats: [] };
    const { container: c2 } = render(<FeaturedContentBlockRender block={block2} />);
    expect(c2.querySelector('.grid.grid-cols-2')).toBeNull();
  });

  it('renders the button anchor only when both buttonText and buttonUrl are provided', () => {
    const yes: any = {
      ...base('f5', 'featured-content'),
      title: 'T',
      buttonText: 'Read more',
      buttonUrl: '/articles/1',
    };
    const { container: c1 } = render(<FeaturedContentBlockRender block={yes} />);
    const a = c1.querySelector('a[href="/articles/1"]');
    expect(a).toBeTruthy();
    expect(a?.textContent).toContain('Read more');

    const no: any = {
      ...base('f5b', 'featured-content'),
      title: 'T',
      buttonText: 'No url',
    };
    const { container: c2 } = render(<FeaturedContentBlockRender block={no} />);
    expect(c2.querySelector('a')).toBeNull();
  });

  it('renders an <img> when imageUrl is set, and places it on the right by default', () => {
    const block: any = {
      ...base('f6', 'featured-content'),
      title: 'T',
      imageUrl: 'https://cdn/hero.jpg',
      imagePosition: 'right',
    };
    const { container } = render(<FeaturedContentBlockRender block={block} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn/hero.jpg');
    // Image wrapper takes col-start-2 when imagePosition === 'right'
    const wrapper = img?.parentElement as HTMLElement;
    expect(wrapper.className).toContain('lg:col-start-2');
  });

  it('places the image on the left (col-start-1) when imagePosition is not "right"', () => {
    const block: any = {
      ...base('f7', 'featured-content'),
      title: 'T',
      imageUrl: 'https://cdn/hero.jpg',
      imagePosition: 'left',
    };
    const { container } = render(<FeaturedContentBlockRender block={block} />);
    const img = container.querySelector('img');
    const wrapper = img?.parentElement as HTMLElement;
    expect(wrapper.className).toContain('lg:col-start-1');
  });

  it('omits the image wrapper when imageUrl is not provided', () => {
    const block: any = { ...base('f8', 'featured-content'), title: 'T' };
    const { container } = render(<FeaturedContentBlockRender block={block} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
