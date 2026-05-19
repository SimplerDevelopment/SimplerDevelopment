// @vitest-environment jsdom
/**
 * Unit tests for 4 small block render components (batch 39d):
 *
 *   - HeadingBlockRender      (components/blocks/render/HeadingBlockRender.tsx)
 *   - ImageBlockRender        (components/blocks/render/ImageBlockRender.tsx)
 *   - EmailHeaderBlockRender  (components/blocks/render/EmailHeaderBlockRender.tsx)
 *   - EmailFooterBlockRender  (components/blocks/render/EmailFooterBlockRender.tsx)
 *
 * All four are pure presentational client components — they accept a single
 * `block` prop and return JSX. Their only "side" deps are inline SVG icons
 * (SocialIcon, used by EmailFooter) and a tiny class-combine helper, so we
 * render them with @testing-library/react in jsdom and assert against the
 * produced DOM. No Next router, no fetch, no API calls.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { HeadingBlockRender } from '@/components/blocks/render/HeadingBlockRender';
import { ImageBlockRender } from '@/components/blocks/render/ImageBlockRender';
import { EmailHeaderBlockRender } from '@/components/blocks/render/EmailHeaderBlockRender';
import { EmailFooterBlockRender } from '@/components/blocks/render/EmailFooterBlockRender';

// ---------------------------------------------------------------------------
// Block-factory helpers
//
// The discriminated-union types for blocks are sprawling; these tests only
// need to confirm runtime DOM output for a handful of optional fields. A loose
// any-cast keeps the test file readable without sacrificing type safety in
// the component under test.
// ---------------------------------------------------------------------------
function makeHeading(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    type: 'heading',
    order: 0,
    level: 2,
    content: 'Hello world',
    alignment: 'left',
    ...overrides,
  } as unknown as Parameters<typeof HeadingBlockRender>[0]['block'];
}

function makeImage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    type: 'image',
    order: 0,
    url: 'https://example.com/cat.jpg',
    alt: 'A cat',
    ...overrides,
  } as unknown as Parameters<typeof ImageBlockRender>[0]['block'];
}

function makeEmailHeader(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eh1',
    type: 'email-header',
    order: 0,
    ...overrides,
  } as unknown as Parameters<typeof EmailHeaderBlockRender>[0]['block'];
}

function makeEmailFooter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ef1',
    type: 'email-footer',
    order: 0,
    ...overrides,
  } as unknown as Parameters<typeof EmailFooterBlockRender>[0]['block'];
}

// ---------------------------------------------------------------------------
// HeadingBlockRender
// ---------------------------------------------------------------------------
describe('HeadingBlockRender', () => {
  it.each([
    [1, 'H1'],
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
    [5, 'H5'],
    [6, 'H6'],
  ] as const)('renders the correct <h%i> tag for level=%i', (level, expectedTag) => {
    const { container } = render(
      <HeadingBlockRender block={makeHeading({ level })} />,
    );
    const heading = container.querySelector(expectedTag.toLowerCase());
    expect(heading).toBeTruthy();
    expect(heading!.tagName).toBe(expectedTag);
  });

  it('renders plain text content directly (no HTML parsing) when content has no tags', () => {
    const { container } = render(
      <HeadingBlockRender block={makeHeading({ content: 'Plain heading' })} />,
    );
    const h = container.querySelector('h2');
    expect(h!.textContent).toBe('Plain heading');
    // No nested elements
    expect(h!.children.length).toBe(0);
  });

  it('uses dangerouslySetInnerHTML when content contains an HTML tag', () => {
    const { container } = render(
      <HeadingBlockRender
        block={makeHeading({ content: 'See <em>this</em> word' })}
      />,
    );
    const em = container.querySelector('h2 em');
    expect(em).toBeTruthy();
    expect(em!.textContent).toBe('this');
  });

  it('falls back to block.text when block.content is missing (LLM-author compat)', () => {
    const { container } = render(
      <HeadingBlockRender
        block={makeHeading({ content: undefined, text: 'Legacy field' })}
      />,
    );
    const h = container.querySelector('h2');
    expect(h!.textContent).toBe('Legacy field');
  });

  it.each([
    ['left', 'text-left'],
    ['center', 'text-center'],
    ['right', 'text-right'],
  ] as const)('applies %s alignment class', (alignment, expected) => {
    const { container } = render(
      <HeadingBlockRender block={makeHeading({ alignment })} />,
    );
    const h = container.querySelector('h2');
    expect(h!.className).toContain(expected);
  });

  it('includes the default text-foreground color class when no custom style.color is set', () => {
    const { container } = render(
      <HeadingBlockRender block={makeHeading()} />,
    );
    expect(container.querySelector('h2')!.className).toContain('text-foreground');
  });

  it('drops the default text-foreground class when style.color is provided', () => {
    const { container } = render(
      <HeadingBlockRender
        block={makeHeading({ style: { color: '#ff0000' } })}
      />,
    );
    expect(container.querySelector('h2')!.className).not.toContain('text-foreground');
  });

  it('drops the default size classes when style.fontSize is provided', () => {
    const { container } = render(
      <HeadingBlockRender
        block={makeHeading({ level: 2, style: { fontSize: '40px' } })}
      />,
    );
    // The level=2 default is "text-3xl md:text-4xl"
    const cls = container.querySelector('h2')!.className;
    expect(cls).not.toContain('text-3xl');
    expect(cls).not.toContain('md:text-4xl');
  });

  it('tags the heading with data-editable-field="content" for the visual editor', () => {
    const { container } = render(<HeadingBlockRender block={makeHeading()} />);
    expect(
      container.querySelector('h2')!.getAttribute('data-editable-field'),
    ).toBe('content');
  });
});

// ---------------------------------------------------------------------------
// ImageBlockRender
// ---------------------------------------------------------------------------
describe('ImageBlockRender', () => {
  it('renders an <img> with src and alt from the block', () => {
    const { container } = render(
      <ImageBlockRender
        block={makeImage({ url: 'https://x.test/y.png', alt: 'thumb' })}
      />,
    );
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('https://x.test/y.png');
    expect(img!.getAttribute('alt')).toBe('thumb');
  });

  it('returns null (renders nothing) when block.url is missing', () => {
    const { container } = render(
      <ImageBlockRender block={makeImage({ url: '' })} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('figure')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it.each([
    ['small', 'max-w-sm'],
    ['medium', 'max-w-2xl'],
    ['large', 'max-w-4xl'],
    ['full', 'w-full'],
  ] as const)('applies width class for width=%s', (width, expected) => {
    const { container } = render(
      <ImageBlockRender block={makeImage({ width })} />,
    );
    expect(container.querySelector('figure')!.className).toContain(expected);
  });

  it.each([
    ['left', 'mr-auto'],
    ['center', 'mx-auto'],
    ['right', 'ml-auto'],
  ] as const)('applies alignment class for alignment=%s', (alignment, expected) => {
    const { container } = render(
      <ImageBlockRender block={makeImage({ alignment })} />,
    );
    expect(container.querySelector('figure')!.className).toContain(expected);
  });

  it('renders a <figcaption> when block.caption is set', () => {
    const { container } = render(
      <ImageBlockRender block={makeImage({ caption: 'A nice cat' })} />,
    );
    const fig = container.querySelector('figcaption');
    expect(fig).toBeTruthy();
    expect(fig!.textContent).toBe('A nice cat');
  });

  it('omits <figcaption> when block.caption is empty', () => {
    const { container } = render(
      <ImageBlockRender block={makeImage({ caption: '' })} />,
    );
    expect(container.querySelector('figcaption')).toBeNull();
  });

  it('keeps the default rounded-lg class when style.borderRadius is not set', () => {
    const { container } = render(
      <ImageBlockRender block={makeImage()} />,
    );
    expect(container.querySelector('img')!.className).toContain('rounded-lg');
  });

  it('drops the default rounded-lg class when style.borderRadius is set', () => {
    const { container } = render(
      <ImageBlockRender
        block={makeImage({ style: { borderRadius: '0px' } })}
      />,
    );
    expect(container.querySelector('img')!.className).not.toContain('rounded-lg');
  });
});

// ---------------------------------------------------------------------------
// EmailHeaderBlockRender
// ---------------------------------------------------------------------------
describe('EmailHeaderBlockRender', () => {
  it('renders the logo image when logoUrl is set', () => {
    const { container } = render(
      <EmailHeaderBlockRender
        block={makeEmailHeader({ logoUrl: 'https://x.test/logo.png' })}
      />,
    );
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('https://x.test/logo.png');
    expect(img!.getAttribute('alt')).toBe('Logo');
  });

  it('omits the <img> tag entirely when logoUrl is missing', () => {
    const { container } = render(
      <EmailHeaderBlockRender block={makeEmailHeader()} />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('applies the configured logoWidth as inline style', () => {
    const { container } = render(
      <EmailHeaderBlockRender
        block={makeEmailHeader({ logoUrl: 'x.png', logoWidth: 250 })}
      />,
    );
    const img = container.querySelector('img');
    // jsdom serializes px-less integers as `250px` on inline styles
    expect(img!.style.width).toBe('250px');
  });

  it('defaults logoWidth to 150 when not provided', () => {
    const { container } = render(
      <EmailHeaderBlockRender
        block={makeEmailHeader({ logoUrl: 'x.png' })}
      />,
    );
    const img = container.querySelector('img');
    expect(img!.style.width).toBe('150px');
  });

  it('renders the tagline paragraph when set', () => {
    const { container } = render(
      <EmailHeaderBlockRender
        block={makeEmailHeader({ tagline: 'We do good work' })}
      />,
    );
    const p = container.querySelector('p');
    expect(p).toBeTruthy();
    expect(p!.textContent).toBe('We do good work');
  });

  it('omits the tagline paragraph when not set', () => {
    const { container } = render(
      <EmailHeaderBlockRender block={makeEmailHeader({ logoUrl: 'x.png' })} />,
    );
    expect(container.querySelector('p')).toBeNull();
  });

  it.each([
    ['left', 'text-left'],
    ['center', 'text-center'],
    ['right', 'text-right'],
  ] as const)('applies the %s alignment class on the wrapper', (alignment, expected) => {
    const { container } = render(
      <EmailHeaderBlockRender block={makeEmailHeader({ alignment })} />,
    );
    const wrapper = container.firstElementChild as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).toContain(expected);
  });

  it('defaults to center alignment when alignment is omitted', () => {
    const { container } = render(
      <EmailHeaderBlockRender block={makeEmailHeader()} />,
    );
    const wrapper = container.firstElementChild as HTMLElement | null;
    expect(wrapper!.className).toContain('text-center');
  });

  it('applies mx-auto to the logo only when alignment is center', () => {
    const centered = render(
      <EmailHeaderBlockRender
        block={makeEmailHeader({ logoUrl: 'x.png', alignment: 'center' })}
      />,
    );
    expect(centered.container.querySelector('img')!.className).toContain('mx-auto');

    const leftAligned = render(
      <EmailHeaderBlockRender
        block={makeEmailHeader({ logoUrl: 'x.png', alignment: 'left' })}
      />,
    );
    expect(leftAligned.container.querySelector('img')!.className).not.toContain('mx-auto');
  });
});

// ---------------------------------------------------------------------------
// EmailFooterBlockRender
// ---------------------------------------------------------------------------
describe('EmailFooterBlockRender', () => {
  it('renders the company name when set', () => {
    const { container } = render(
      <EmailFooterBlockRender
        block={makeEmailFooter({ companyName: 'Acme Co' })}
      />,
    );
    expect(container.textContent).toContain('Acme Co');
  });

  it('omits the company-name paragraph when missing', () => {
    const { container } = render(
      <EmailFooterBlockRender block={makeEmailFooter()} />,
    );
    // The first child <p> would be company name; default state should not contain a leading <p>.
    // (Unsubscribe shows as a <span> inside a <p> at the bottom — that <p> is the only one.)
    const ps = container.querySelectorAll('p');
    // With no company/address, only the unsubscribe paragraph should exist.
    expect(ps.length).toBe(1);
    expect(ps[0].textContent).toContain('Unsubscribe');
  });

  it('renders the address paragraph when set', () => {
    const { container } = render(
      <EmailFooterBlockRender
        block={makeEmailFooter({ address: '1 Main St' })}
      />,
    );
    expect(container.textContent).toContain('1 Main St');
  });

  it('renders social link <a> tags with correct href and aria-label', () => {
    const { container } = render(
      <EmailFooterBlockRender
        block={makeEmailFooter({
          socialLinks: [
            { platform: 'twitter', url: 'https://twitter.com/acme' },
            { platform: 'linkedin', url: 'https://linkedin.com/company/acme' },
          ],
        })}
      />,
    );
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('https://twitter.com/acme');
    expect(links[0].getAttribute('aria-label')).toBe('twitter');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[1].getAttribute('aria-label')).toBe('linkedin');
  });

  it('omits the social-links row when socialLinks is empty', () => {
    const { container } = render(
      <EmailFooterBlockRender
        block={makeEmailFooter({ socialLinks: [] })}
      />,
    );
    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it('shows the Unsubscribe link by default (when showUnsubscribe is unset)', () => {
    const { container } = render(
      <EmailFooterBlockRender block={makeEmailFooter()} />,
    );
    expect(container.textContent).toContain('Unsubscribe');
  });

  it('hides the Unsubscribe link only when showUnsubscribe is explicitly false', () => {
    const { container } = render(
      <EmailFooterBlockRender
        block={makeEmailFooter({ showUnsubscribe: false })}
      />,
    );
    expect(container.textContent).not.toContain('Unsubscribe');
  });

  it('shows the View-in-browser link only when showViewInBrowser is true', () => {
    const off = render(
      <EmailFooterBlockRender block={makeEmailFooter()} />,
    );
    expect(off.container.textContent).not.toContain('View in browser');

    const on = render(
      <EmailFooterBlockRender
        block={makeEmailFooter({ showViewInBrowser: true })}
      />,
    );
    expect(on.container.textContent).toContain('View in browser');
  });

  it('hides the entire footer-links row when both unsubscribe and view-in-browser are off', () => {
    const { container } = render(
      <EmailFooterBlockRender
        block={makeEmailFooter({
          showUnsubscribe: false,
          showViewInBrowser: false,
        })}
      />,
    );
    expect(container.textContent).not.toContain('Unsubscribe');
    expect(container.textContent).not.toContain('View in browser');
  });
});
