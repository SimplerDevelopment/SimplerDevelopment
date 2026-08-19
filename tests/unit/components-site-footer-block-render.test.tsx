// @vitest-environment jsdom
/**
 * Unit tests for the REAL SiteFooterBlockRender (components/blocks/render/SiteFooterBlockRender.tsx).
 *
 * Other suites (components-batch-43g/43h, lib-misc-batch-38a) mock this
 * component out entirely, so nothing exercised its actual rendered markup.
 * Added alongside the 2026-08-18 a11y fixes so the two fixes below have real
 * regression coverage:
 *   - heading-order: link-group / contact-column labels are `<p>`, not `<h4>`
 *     (a bare h4 with no preceding h2/h3 trips Lighthouse's heading-order
 *     audit — these are visual labels, not document structure).
 *   - target-size: the contact-column social icon anchors get a padded
 *     24×24 tap target (`p-1 -m-1`) instead of the bare 16×16 icon box.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SiteFooterBlockRender } from '@/components/blocks/render/SiteFooterBlockRender';
import type { SiteFooterBlock } from '@/types/blocks';

function makeBlock(overrides: Partial<SiteFooterBlock> = {}): SiteFooterBlock {
  return {
    id: 'footer-1',
    type: 'site-footer',
    order: 0,
    linkGroups: [
      { label: 'Company', links: [{ label: 'About', href: '/about' }] },
    ],
    ...overrides,
  } as SiteFooterBlock;
}

describe('SiteFooterBlockRender — heading-order (a11y)', () => {
  it('renders link-group labels as <p>, not <h4>', () => {
    const { container } = render(<SiteFooterBlockRender block={makeBlock()} />);
    expect(container.querySelector('h4')).toBeFalsy();
    const label = Array.from(container.querySelectorAll('p')).find(p =>
      p.textContent === 'Company',
    );
    expect(label).toBeTruthy();
    expect(label?.className).toContain('text-xs');
    expect(label?.className).toContain('tracking-[0.2em]');
  });

  it('renders the Contact column label as <p>, not <h4>', () => {
    const { container } = render(
      <SiteFooterBlockRender
        block={makeBlock({
          contactInfo: { address: '123 Main St', phone: '555-1234', email: 'hi@example.com' },
        })}
      />,
    );
    expect(container.querySelector('h4')).toBeFalsy();
    const label = Array.from(container.querySelectorAll('p')).find(p =>
      p.textContent === 'Contact',
    );
    expect(label).toBeTruthy();
  });

  it('never renders any heading element (h1-h6) — footer has no document-outline role', () => {
    const { container } = render(
      <SiteFooterBlockRender
        block={makeBlock({
          contactInfo: { address: '123 Main St' },
          linkGroups: [
            { label: 'Company', links: [{ label: 'About', href: '/about' }] },
            { label: 'Legal', links: [{ label: 'Privacy', href: '/privacy' }] },
          ],
        })}
      />,
    );
    expect(container.querySelectorAll('h1,h2,h3,h4,h5,h6').length).toBe(0);
  });
});

describe('SiteFooterBlockRender — social link target-size (a11y)', () => {
  it('gives the contact-column social anchor a padded 24×24 tap target', () => {
    const { container } = render(
      <SiteFooterBlockRender
        block={makeBlock({
          contactInfo: { email: 'hi@example.com' },
          socialLinks: [{ platform: 'twitter', url: 'https://twitter.com/x' }],
        })}
      />,
    );
    const anchor = container.querySelector('a[href="https://twitter.com/x"]');
    expect(anchor).toBeTruthy();
    expect(anchor?.className).toContain('p-1');
    expect(anchor?.className).toContain('-m-1');
  });

  it('leaves the bottom-bar social anchor (already 32×32) unaffected', () => {
    const { container } = render(
      <SiteFooterBlockRender
        block={makeBlock({
          contactInfo: undefined,
          socialLinks: [{ platform: 'twitter', url: 'https://twitter.com/x' }],
        })}
      />,
    );
    const anchor = container.querySelector('a[href="https://twitter.com/x"]') as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    expect(anchor.style.width).toBe('32px');
    expect(anchor.style.height).toBe('32px');
  });
});
