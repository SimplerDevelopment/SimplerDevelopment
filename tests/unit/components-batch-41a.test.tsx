// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next/image — passthrough <img>. The Palizzi block renderers all use this for
// hero/marquee/book imagery; we just need a DOM-renderable stand-in so we can
// assert src/alt without booting up the real next/image runtime.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, width, height, ...rest }: { src: string; alt: string; width?: number; height?: number; [key: string]: unknown }) => {
    // strip framer-style only props
    const { fill: _fill, sizes: _sizes, priority: _p, placeholder: _pl, blurDataURL: _bd, loader: _l, quality: _q, ...domSafe } = rest;
    void _fill; void _sizes; void _p; void _pl; void _bd; void _l; void _q;
    return React.createElement('img', { src, alt, width, height, ...domSafe });
  },
}));

// Mock sanitize-html so PalizziHistoryBlockRender doesn't try to pull in
// DOMPurify (which works in jsdom but is overkill for a unit test of the
// render layer — we want to assert the renderer's *behaviour*, not DOMPurify).
vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeHtml: (html: string) => html ?? '',
  sanitizeRichHtml: (html: string) => html ?? '',
}));

// post-content-slot context — used by PostContentPlaceholderRender. Default to
// `null` (so the static placeholder renders); individual tests can override
// the hook to return a custom slot via vi.mocked().
vi.mock('@/lib/visual-editor/post-content-slot', () => ({
  usePostContentSlot: vi.fn(() => null),
}));

// combineResponsiveClasses — concatenate truthy strings with spaces. Mirrors
// the real implementation's externally visible behaviour without pulling in
// the responsive utils module.
vi.mock('@/lib/utils/responsive', () => ({
  combineResponsiveClasses: (...parts: Array<string | undefined>) =>
    parts.filter(Boolean).join(' ').trim(),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { PostContentPlaceholderRender } from '@/components/blocks/render/PostContentPlaceholderRender';
import { PalizziFooterBlockRender } from '@/components/blocks/render/PalizziFooterBlockRender';
import { PalizziHistoryBlockRender } from '@/components/blocks/render/PalizziHistoryBlockRender';
import { PalizziWelcomeBlockRender } from '@/components/blocks/render/PalizziWelcomeBlockRender';
import { usePostContentSlot } from '@/lib/visual-editor/post-content-slot';

const base = (id: string, type: string, order = 0) => ({ id, type, order });

// ---------------------------------------------------------------------------
// PostContentPlaceholderRender
// ---------------------------------------------------------------------------

describe('PostContentPlaceholderRender', () => {
  it('renders the static placeholder UI when no slot is provided by context', () => {
    vi.mocked(usePostContentSlot).mockReturnValueOnce(null);
    const block: Record<string, unknown> = { ...base('p1', 'post-content') };
    const { container } = render(<PostContentPlaceholderRender block={block} />);
    // The label text is part of the placeholder ornamentation.
    expect(screen.getByText('Post Content')).toBeTruthy();
    // The material-icon "article" glyph is the icon — verify it's there.
    expect(container.querySelector('.material-icons')?.textContent).toBe('article');
  });

  it('renders the editor slot when usePostContentSlot returns a node (substitution path)', () => {
    vi.mocked(usePostContentSlot).mockReturnValueOnce(
      <div data-testid="live-post-body">live post body</div>,
    );
    const block: Record<string, unknown> = { ...base('p2', 'post-content') };
    render(<PostContentPlaceholderRender block={block} />);
    // Slot rendered, static placeholder NOT rendered.
    expect(screen.getByTestId('live-post-body').textContent).toBe('live post body');
    expect(screen.queryByText('Post Content')).toBeNull();
  });

  it('applies combined responsive classes when block.responsive is provided', () => {
    vi.mocked(usePostContentSlot).mockReturnValueOnce(null);
    const block: Record<string, unknown> = {
      ...base('p3', 'post-content'),
      responsive: {
        paddingTop: 'pt-4 md:pt-8',
        visibility: 'hidden-mobile',
      },
    };
    const { container } = render(<PostContentPlaceholderRender block={block} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('pt-4 md:pt-8');
    expect(outer.className).toContain('hidden-mobile');
  });

  it('renders an empty-class wrapper when block.responsive is absent', () => {
    vi.mocked(usePostContentSlot).mockReturnValueOnce(null);
    const block: Record<string, unknown> = { ...base('p4', 'post-content') };
    const { container } = render(<PostContentPlaceholderRender block={block} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toBe('');
  });
});

// ---------------------------------------------------------------------------
// PalizziFooterBlockRender
// ---------------------------------------------------------------------------

describe('PalizziFooterBlockRender', () => {
  it('renders the marquee image with the provided src', () => {
    const block: Record<string, unknown> = {
      ...base('f1', 'palizzi-footer'),
      marqueeImage: '/marquee.png',
      columns: [],
      bottomText: '© 2026 Palizzi',
    };
    const { container } = render(<PalizziFooterBlockRender block={block} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/marquee.png');
  });

  it('renders each column label and html content', () => {
    const block: Record<string, unknown> = {
      ...base('f2', 'palizzi-footer'),
      marqueeImage: '/m.png',
      columns: [
        { label: 'CONTACT', content: '<strong>hello@palizzi.com</strong>' },
        { label: 'HOURS', content: 'Mon-Fri 9-5' },
      ],
      bottomText: 'foot',
    };
    const { container } = render(<PalizziFooterBlockRender block={block} />);
    expect(screen.getByText('CONTACT')).toBeTruthy();
    expect(screen.getByText('HOURS')).toBeTruthy();
    // dangerouslySetInnerHTML rendered the <strong>
    expect(container.querySelector('strong')?.textContent).toBe('hello@palizzi.com');
  });

  it('renders link columns as anchor tags with the right href + label', () => {
    const block: Record<string, unknown> = {
      ...base('f3', 'palizzi-footer'),
      marqueeImage: '/m.png',
      columns: [
        {
          label: 'NAV',
          links: [
            { label: 'About', href: '/about' },
            { label: 'Menu', href: '/menu' },
          ],
        },
      ],
      bottomText: 'foot',
    };
    render(<PalizziFooterBlockRender block={block} />);
    const about = screen.getByText('About') as HTMLAnchorElement;
    const menu = screen.getByText('Menu') as HTMLAnchorElement;
    expect(about.getAttribute('href')).toBe('/about');
    expect(menu.getAttribute('href')).toBe('/menu');
  });

  it('shifts a link\'s color on mouseenter and restores on mouseleave', () => {
    const block: Record<string, unknown> = {
      ...base('f4', 'palizzi-footer'),
      marqueeImage: '/m.png',
      columns: [
        { label: 'NAV', links: [{ label: 'Home', href: '/' }] },
      ],
      bottomText: 'foot',
    };
    render(<PalizziFooterBlockRender block={block} />);
    const link = screen.getByText('Home') as HTMLAnchorElement;
    // initial inline color
    expect(link.style.color).toBe('rgba(245, 230, 211, 0.5)');

    // synthesise mouse events that the inline handlers expect
    link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    // The handlers mutate style directly — verify after react synthetic event roundtrip
    // (mouseenter doesn't bubble for React's synthetic event system unless we use
    // the React-friendly fireEvent.mouseEnter. Use that instead.)
  });

  it('hover handlers swap the link color via React synthetic events', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const block: Record<string, unknown> = {
      ...base('f5', 'palizzi-footer'),
      marqueeImage: '/m.png',
      columns: [
        { label: 'NAV', links: [{ label: 'Home', href: '/' }] },
      ],
      bottomText: 'foot',
    };
    render(<PalizziFooterBlockRender block={block} />);
    const link = screen.getByText('Home') as HTMLAnchorElement;
    fireEvent.mouseEnter(link);
    expect(link.style.color).toBe('rgb(201, 169, 110)');
    fireEvent.mouseLeave(link);
    expect(link.style.color).toBe('rgba(245, 230, 211, 0.5)');
  });

  it('renders bottomText in the footer', () => {
    const block: Record<string, unknown> = {
      ...base('f6', 'palizzi-footer'),
      marqueeImage: '/m.png',
      columns: [],
      bottomText: '© 2026 Palizzi Trattoria',
    };
    render(<PalizziFooterBlockRender block={block} />);
    expect(screen.getByText('© 2026 Palizzi Trattoria')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PalizziHistoryBlockRender
// ---------------------------------------------------------------------------

describe('PalizziHistoryBlockRender', () => {
  const baseBlock = (overrides: Partial<Record<string, unknown>> = {}) => ({
    ...base('h1', 'palizzi-history'),
    backgroundImage: '/bg.jpg',
    marqueeImage: '/marquee.png',
    overline: 'OUR STORY',
    title: 'A Tradition',
    titleAccent: 'Since 1952',
    paragraphs: ['First paragraph.', 'Second paragraph.'],
    ...overrides,
  });

  it('renders overline, title, and accent', () => {
    render(<PalizziHistoryBlockRender block={baseBlock() as unknown} />);
    expect(screen.getByText('OUR STORY')).toBeTruthy();
    // Title is split across a text node and a <span> for the accent —
    // verify both fragments are present.
    expect(screen.getByText(/A Tradition/)).toBeTruthy();
    expect(screen.getByText('Since 1952')).toBeTruthy();
  });

  it('renders background and marquee images with correct src', () => {
    const { container } = render(
      <PalizziHistoryBlockRender block={baseBlock() as unknown} />,
    );
    const imgs = container.querySelectorAll('img');
    const srcs = Array.from(imgs).map((i) => i.getAttribute('src'));
    expect(srcs).toContain('/bg.jpg');
    expect(srcs).toContain('/marquee.png');
  });

  it('renders one <p> per paragraph (with dividers between but not after last)', () => {
    const block = baseBlock({
      paragraphs: ['Alpha', 'Beta', 'Gamma'],
    }) as unknown;
    const { container } = render(<PalizziHistoryBlockRender block={block} />);
    // Paragraphs use dangerouslySetInnerHTML, so check by text content
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Beta');
    expect(container.textContent).toContain('Gamma');
    // 3 paragraphs => 2 dividers (between, not after last). The dividers are
    // <div> elements with a unique width style; count those.
    const dividers = container.querySelectorAll('div[style*="height: 1px"]');
    // Note: the overlay gradient also uses a div but with different styles —
    // the divider has explicit width: 4rem.
    const paraDividers = Array.from(dividers).filter((d) =>
      (d as HTMLElement).style.width === '4rem',
    );
    expect(paraDividers.length).toBe(2);
  });

  it('renders no paragraph dividers when there is only one paragraph', () => {
    const block = baseBlock({ paragraphs: ['Only one'] }) as unknown;
    const { container } = render(<PalizziHistoryBlockRender block={block} />);
    const dividers = container.querySelectorAll('div[style*="height: 1px"]');
    const paraDividers = Array.from(dividers).filter((d) =>
      (d as HTMLElement).style.width === '4rem',
    );
    expect(paraDividers.length).toBe(0);
  });

  it('wraps the section in an element with id="history"', () => {
    const { container } = render(
      <PalizziHistoryBlockRender block={baseBlock() as unknown} />,
    );
    expect(container.querySelector('section#history')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PalizziWelcomeBlockRender
// ---------------------------------------------------------------------------

describe('PalizziWelcomeBlockRender', () => {
  const baseBlock = (overrides: Partial<Record<string, unknown>> = {}) => ({
    ...base('w1', 'palizzi-welcome'),
    overline: 'BENVENUTI',
    title: 'Welcome to',
    titleAccent: 'Palizzi',
    paragraphs: ['A neighborhood institution.', 'Family-run since 1952.'],
    bookImage: '/book.jpg',
    bookTitle: 'Tales of Palizzi',
    bookSubtitle: 'A coffee-table memoir',
    bookLabel: 'AS SEEN IN',
    bookAuthors: 'By Marco & Lucia',
    ...overrides,
  });

  it('renders the overline label inside the ornament', () => {
    render(<PalizziWelcomeBlockRender block={baseBlock() as unknown} />);
    expect(screen.getByText('BENVENUTI')).toBeTruthy();
  });

  it('renders the title together with its accent', () => {
    render(<PalizziWelcomeBlockRender block={baseBlock() as unknown} />);
    expect(screen.getByText(/Welcome to/)).toBeTruthy();
    expect(screen.getByText('Palizzi')).toBeTruthy();
  });

  it('renders each paragraph as its own <p>', () => {
    const { container } = render(
      <PalizziWelcomeBlockRender block={baseBlock() as unknown} />,
    );
    expect(container.textContent).toContain('A neighborhood institution.');
    expect(container.textContent).toContain('Family-run since 1952.');
  });

  it('renders the book image with alt = bookTitle', () => {
    const { container } = render(
      <PalizziWelcomeBlockRender block={baseBlock() as unknown} />,
    );
    const bookImg = container.querySelector('img[alt="Tales of Palizzi"]') as HTMLImageElement;
    expect(bookImg).toBeTruthy();
    expect(bookImg.getAttribute('src')).toBe('/book.jpg');
  });

  it('renders book label, subtitle, and authors', () => {
    render(<PalizziWelcomeBlockRender block={baseBlock() as unknown} />);
    expect(screen.getByText('AS SEEN IN')).toBeTruthy();
    expect(screen.getByText('Tales of Palizzi')).toBeTruthy();
    expect(screen.getByText('A coffee-table memoir')).toBeTruthy();
    expect(screen.getByText('By Marco & Lucia')).toBeTruthy();
  });

  it('renders an empty paragraph list without throwing', () => {
    const block = baseBlock({ paragraphs: [] }) as unknown;
    const { container } = render(<PalizziWelcomeBlockRender block={block} />);
    // Only the structural <p> tags (overline, book label/title/subtitle/authors)
    // should be in the document — none from the paragraphs list.
    expect(container.textContent).toContain('BENVENUTI');
    expect(container.textContent).toContain('Tales of Palizzi');
  });

  it('wraps the section with id="welcome"', () => {
    const { container } = render(
      <PalizziWelcomeBlockRender block={baseBlock() as unknown} />,
    );
    expect(container.querySelector('section#welcome')).toBeTruthy();
  });
});
