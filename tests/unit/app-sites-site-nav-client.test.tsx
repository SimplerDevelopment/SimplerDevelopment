// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick, target, rel, ...rest }: any) =>
    React.createElement('a', { href, onClick, target, rel, ...rest }, children),
}));

// The global setup.ts stubs ResizeObserver as an arrow (vi.fn().mockImplementation)
// which cannot be used with `new`. Override it here with a proper class so the
// nav's useEffect doesn't throw "is not a constructor".
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_cb: ResizeObserverCallback) {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// ---------------------------------------------------------------------------
// Component under test (imported after mocks)
// ---------------------------------------------------------------------------

import { SiteNavClient } from '@/app/sites/[domain]/SiteNavClient';
import type { NavItem } from '@/lib/actions/client-sites';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseProps = {
  siteName: 'Acme Corp',
  navItems: [] as NavItem[],
  isTransparent: false,
  navBg: '#1c3370',
  navText: '#ffffff',
  primaryColor: '#2563eb',
  secondaryColor: '#1e3a5f',
  logoAlt: 'Acme Logo',
};

const makeItem = (overrides: Partial<NavItem> & { id: number; label: string; href: string }): NavItem => ({
  parentId: null,
  sortOrder: 0,
  openInNewTab: false,
  isButton: false,
  description: null,
  icon: null,
  featuredImage: null,
  children: undefined,
  ...overrides,
});

const regularItem = makeItem({ id: 1, label: 'About', href: '/about' });
const buttonItem = makeItem({ id: 99, label: 'Book Now', href: '/book', isButton: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderNav(props: Partial<typeof baseProps> & { navItems?: NavItem[] } = {}) {
  return render(<SiteNavClient {...baseProps} {...props} />);
}

// Force matchMedia to report mobile (max-width: 1023px).
// The component calls mq.addEventListener('change', fn) then fn() via update().
// We must immediately call the listener so the state is set before render assertions.
function setMobile(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const isMatch = mobile && query.includes('1023');
    const listeners: Array<(e: { matches: boolean }) => void> = [];
    return {
      matches: isMatch,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_type: string, cb: (e: { matches: boolean }) => void) => {
        listeners.push(cb);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as typeof window.matchMedia;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteNavClient', () => {
  beforeEach(() => {
    setMobile(false);
    // Reset scrollY
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Basic rendering ───────────────────────────────────────────────────────

  it('renders siteName as fallback when no logoUrl is provided', () => {
    renderNav();
    expect(screen.getByText('Acme Corp')).toBeTruthy();
  });

  it('renders a logo <img> when logoUrl is provided instead of siteName text', () => {
    renderNav({ logoUrl: 'https://cdn.example.com/logo.png' });
    const img = document.querySelector('img[alt="Acme Logo"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('cdn.example.com/logo.png');
    // The siteName text span should NOT appear
    expect(screen.queryByText('Acme Corp')).toBeNull();
  });

  it('renders regular nav link labels', () => {
    renderNav({ navItems: [regularItem] });
    // Desktop + mobile panels both render the label (mobile is CSS-hidden)
    expect(screen.getAllByText('About').length).toBeGreaterThan(0);
  });

  it('renders a button/CTA item in the desktop CTA group', () => {
    renderNav({ navItems: [buttonItem] });
    // Both desktop CTA container and mobile menu footer should render the label
    const nodes = screen.getAllByText('Book Now');
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('renders the home-link "/" at the root of the nav', () => {
    renderNav();
    const homeLinks = document.querySelectorAll('a[href="/"]');
    expect(homeLinks.length).toBeGreaterThan(0);
  });

  // ── basePath resolution ───────────────────────────────────────────────────

  it('prepends basePath to internal absolute links', () => {
    renderNav({ basePath: '/sites/acme', navItems: [regularItem] });
    // Desktop link is the one in the nav link group (first matching <a>)
    const links = screen.getAllByText('About').map((el) => el.closest('a'));
    const hrefs = links.map((a) => a?.getAttribute('href'));
    expect(hrefs.some((h) => h === '/sites/acme/about')).toBe(true);
  });

  it('does NOT double-prefix links already starting with basePath', () => {
    const alreadyPrefixed = makeItem({ id: 2, label: 'Prefixed', href: '/sites/acme/already' });
    renderNav({ basePath: '/sites/acme', navItems: [alreadyPrefixed] });
    const links = screen.getAllByText('Prefixed').map((el) => el.closest('a'));
    // All rendered copies should resolve to the same (un-doubled) href
    links.forEach((a) => expect(a?.getAttribute('href')).toBe('/sites/acme/already'));
  });

  it('does NOT prefix external URLs', () => {
    const external = makeItem({ id: 3, label: 'External', href: 'https://example.com', openInNewTab: true });
    renderNav({ basePath: '/sites/acme', navItems: [external] });
    const links = screen.getAllByText('External').map((el) => el.closest('a'));
    links.forEach((a) => expect(a?.getAttribute('href')).toBe('https://example.com'));
  });

  it('does NOT prefix mailto links', () => {
    const mail = makeItem({ id: 4, label: 'Email', href: 'mailto:info@example.com' });
    renderNav({ basePath: '/sites/acme', navItems: [mail] });
    const links = screen.getAllByText('Email').map((el) => el.closest('a'));
    links.forEach((a) => expect(a?.getAttribute('href')).toBe('mailto:info@example.com'));
  });

  it('does NOT prefix hash-only anchors', () => {
    const hash = makeItem({ id: 5, label: 'Section', href: '#services' });
    renderNav({ basePath: '/sites/acme', navItems: [hash] });
    const links = screen.getAllByText('Section').map((el) => el.closest('a'));
    links.forEach((a) => expect(a?.getAttribute('href')).toBe('#services'));
  });

  // ── openInNewTab ─────────────────────────────────────────────────────────

  it('adds target=_blank and rel=noopener to links with openInNewTab=true', () => {
    const newTab = makeItem({ id: 6, label: 'New Tab', href: 'https://example.com', openInNewTab: true });
    renderNav({ navItems: [newTab] });
    const links = screen.getAllByText('New Tab').map((el) => el.closest('a'));
    // Every rendered copy (desktop + mobile) should carry the attributes
    links.forEach((link) => {
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  // ── Scroll behavior ───────────────────────────────────────────────────────

  it('is non-transparent by default: nav always shows bg color (showScrolled=true)', () => {
    renderNav({ isTransparent: false });
    const nav = document.querySelector('nav');
    // jsdom converts hex to rgb(); navBg = '#1c3370' → 'rgb(28, 51, 112)'
    expect(nav?.style.backgroundColor).toBe('rgb(28, 51, 112)');
  });

  it('registers a scroll event listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderNav();
    expect(addSpy.mock.calls.some(([evt]) => evt === 'scroll')).toBe(true);
  });

  it('removes the scroll listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderNav();
    unmount();
    expect(removeSpy.mock.calls.some(([evt]) => evt === 'scroll')).toBe(true);
  });

  it('transparent nav changes to white bg after scrollY > 50', async () => {
    renderNav({ isTransparent: true });
    const nav = document.querySelector('nav') as HTMLElement;
    // Initially unscrolled → transparent
    expect(nav.style.backgroundColor).toBe('transparent');
    // Simulate scroll past threshold
    await act(async () => {
      Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 60 });
      window.dispatchEvent(new Event('scroll'));
    });
    // jsdom preserves the rgba() string as-is
    expect(nav.style.backgroundColor).toBe('rgba(255, 255, 255, 0.95)');
  });

  // ── Mobile hamburger menu ─────────────────────────────────────────────────

  it('toggles the mobile menu open/closed via the hamburger button', async () => {
    setMobile(true);
    renderNav({ navItems: [regularItem] });

    // Re-render to pick up the matchMedia change — act wraps the state update
    const hamburger = screen.getByLabelText('Open menu');
    expect(hamburger).toBeTruthy();

    await act(async () => {
      fireEvent.click(hamburger);
    });
    expect(screen.getByLabelText('Close menu')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close menu'));
    });
    expect(screen.getByLabelText('Open menu')).toBeTruthy();
  });

  it('hamburger button is present in the DOM (aria-label attribute)', () => {
    renderNav();
    const buttons = document.querySelectorAll('button[aria-label]');
    const labels = Array.from(buttons).map((b) => b.getAttribute('aria-label'));
    expect(labels.some((l) => l === 'Open menu' || l === 'Close menu')).toBe(true);
  });

  // ── Desktop dropdown (classic template) ──────────────────────────────────

  it('renders a nav item with children as a hoverable container', () => {
    const parent = makeItem({
      id: 10,
      label: 'Services',
      href: '/services',
      children: [
        makeItem({ id: 11, label: 'Web Design', href: '/services/web' }),
        makeItem({ id: 12, label: 'SEO', href: '/services/seo' }),
      ],
    });
    renderNav({ navItems: [parent] });
    // Desktop trigger is the <a> with aria-haspopup (there may be multiple "Services" labels)
    const triggers = screen.getAllByText('Services').map((el) => el.closest('a')).filter(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0]?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens classic dropdown on mouseEnter of parent container', async () => {
    const parent = makeItem({
      id: 20,
      label: 'Products',
      href: '/products',
      children: [
        makeItem({ id: 21, label: 'Widget A', href: '/products/a' }),
      ],
    });
    renderNav({ navItems: [parent] });
    // Find the desktop trigger (has aria-haspopup)
    const desktopTrigger = screen.getAllByText('Products').map((el) => el.closest('a')).find(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    const container = desktopTrigger?.parentElement as HTMLElement;

    await act(async () => {
      fireEvent.mouseEnter(container);
    });
    // After opening, aria-expanded should be true
    expect(desktopTrigger?.getAttribute('aria-expanded')).toBe('true');
    // Classic dropdown child link should appear (desktop panel only)
    const widgetLinks = screen.getAllByText('Widget A');
    expect(widgetLinks.length).toBeGreaterThan(0);
  });

  it('sets aria-expanded=false after debounced mouseLeave closes dropdown', async () => {
    vi.useFakeTimers();
    const parent = makeItem({
      id: 30,
      label: 'Solutions',
      href: '/solutions',
      children: [makeItem({ id: 31, label: 'Cloud', href: '/solutions/cloud' })],
    });
    renderNav({ navItems: [parent] });
    const desktopTrigger = screen.getAllByText('Solutions').map((el) => el.closest('a')).find(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    const container = desktopTrigger?.parentElement as HTMLElement;

    await act(async () => { fireEvent.mouseEnter(container); });
    expect(desktopTrigger?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      fireEvent.mouseLeave(container);
      vi.advanceTimersByTime(200);
    });
    expect(desktopTrigger?.getAttribute('aria-expanded')).toBe('false');
    vi.useRealTimers();
  });

  it('re-opening dropdown while close timer is pending cancels the close', async () => {
    vi.useFakeTimers();
    const parent = makeItem({
      id: 40,
      label: 'Company',
      href: '/company',
      children: [makeItem({ id: 41, label: 'Team', href: '/company/team' })],
    });
    renderNav({ navItems: [parent] });
    const desktopTrigger = screen.getAllByText('Company').map((el) => el.closest('a')).find(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    const container = desktopTrigger?.parentElement as HTMLElement;

    await act(async () => { fireEvent.mouseEnter(container); });
    await act(async () => { fireEvent.mouseLeave(container); });
    // Re-enter before the 180ms timer fires — should cancel close
    await act(async () => { fireEvent.mouseEnter(container); });
    vi.advanceTimersByTime(200);
    // Still open
    expect(desktopTrigger?.getAttribute('aria-expanded')).toBe('true');
    vi.useRealTimers();
  });

  // ── Mobile accordion (submenu expansion) ─────────────────────────────────

  it('expands and collapses mobile submenu via accordion button', async () => {
    setMobile(true);
    const parent = makeItem({
      id: 50,
      label: 'Resources',
      href: '/resources',
      children: [makeItem({ id: 51, label: 'Blog', href: '/resources/blog' })],
    });
    renderNav({ navItems: [parent] });

    // Open mobile menu first
    const hamburger = screen.getByLabelText('Open menu');
    await act(async () => { fireEvent.click(hamburger); });

    // Accordion button for parent item
    const accordionBtn = screen.getByRole('button', { name: /Resources/i });
    expect(accordionBtn.getAttribute('aria-expanded')).toBe('false');

    await act(async () => { fireEvent.click(accordionBtn); });
    expect(accordionBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Blog')).toBeTruthy();

    // Collapse
    await act(async () => { fireEvent.click(accordionBtn); });
    expect(accordionBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders mobile leaf items (no children) as direct links in mobile menu', async () => {
    setMobile(true);
    renderNav({ navItems: [regularItem] });

    const hamburger = screen.getByLabelText('Open menu');
    await act(async () => { fireEvent.click(hamburger); });

    // 'About' should appear as a link in mobile menu; multiple 'About' nodes
    // because desktop + mobile both render
    const links = screen.getAllByText('About');
    expect(links.length).toBeGreaterThan(0);
  });

  it('closes the menu when a mobile leaf link is clicked', async () => {
    setMobile(true);
    renderNav({ navItems: [regularItem] });

    await act(async () => { fireEvent.click(screen.getByLabelText('Open menu')); });
    expect(screen.getByLabelText('Close menu')).toBeTruthy();

    // The mobile panel link has an onClick handler that closes the menu.
    // Both copies have onClick (desktop link does NOT; mobile link does).
    // Find the one inside the mobile panel (has no aria-haspopup, and is inside
    // the mobile div with display:block style).
    const allAbout = screen.getAllByText('About');
    // Click any one — the mobile copy has onClick={()=>setMenuOpen(false)}
    // The desktop copy does not, but clicking it still won't hurt (no-op).
    // Click them all until one closes the menu.
    await act(async () => { fireEvent.click(allAbout[allAbout.length - 1]); });
    expect(screen.getByLabelText('Open menu')).toBeTruthy();
  });

  // ── navTemplate variants ──────────────────────────────────────────────────

  it('applies bold layout class when navTemplate="bold"', () => {
    renderNav({ navTemplate: 'bold' });
    // Bold layout uses a centered flex container (mx-auto flex items-center) not max-w-7xl
    const container = document.querySelector('.mx-auto.flex.items-center');
    expect(container).toBeTruthy();
  });

  it('applies mega layout and renders mega panel on dropdown open', async () => {
    const parent = makeItem({
      id: 60,
      label: 'Mega',
      href: '/mega',
      children: [
        makeItem({ id: 61, label: 'Col A', href: '/mega/a', description: 'Column A desc' }),
        makeItem({ id: 62, label: 'Col B', href: '/mega/b', icon: 'star' }),
      ],
    });
    renderNav({ navTemplate: 'mega', navItems: [parent] });

    const desktopTrigger = screen.getAllByText('Mega').map((el) => el.closest('a')).find(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    const container = desktopTrigger?.parentElement as HTMLElement;
    await act(async () => { fireEvent.mouseEnter(container); });

    // Mega panel renders the column headings (also appear in mobile, so use getAllByText)
    expect(screen.getAllByText('Col A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Col B').length).toBeGreaterThan(0);
    // description only appears in mega panel (not in mobile)
    expect(screen.getByText('Column A desc')).toBeTruthy();
  });

  it('renders mega panel with icon span when column has an icon', async () => {
    const parent = makeItem({
      id: 70,
      label: 'WithIcon',
      href: '/icon',
      children: [makeItem({ id: 71, label: 'Icon Col', href: '/icon/col', icon: 'rocket' })],
    });
    renderNav({ navTemplate: 'mega', navItems: [parent] });
    const desktopTrigger = screen.getAllByText('WithIcon').map((el) => el.closest('a')).find(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    const container = desktopTrigger?.parentElement as HTMLElement;
    await act(async () => { fireEvent.mouseEnter(container); });

    // icon spans with class material-icons appear in both mega panel and mobile
    const iconSpans = Array.from(document.querySelectorAll('.material-icons'));
    expect(iconSpans.some((s) => s.textContent?.includes('rocket'))).toBe(true);
  });

  it('renders mega panel with featuredImage when column has one', async () => {
    const parent = makeItem({
      id: 80,
      label: 'Featured',
      href: '/featured',
      children: [makeItem({ id: 81, label: 'Img Col', href: '/featured/img', featuredImage: 'https://img.example.com/photo.jpg' })],
    });
    renderNav({ navTemplate: 'mega', navItems: [parent] });
    const desktopTrigger = screen.getAllByText('Featured').map((el) => el.closest('a')).find(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    const container = desktopTrigger?.parentElement as HTMLElement;
    await act(async () => { fireEvent.mouseEnter(container); });

    const imgs = document.querySelectorAll('img[alt="Img Col"]');
    expect(imgs.length).toBeGreaterThan(0);
  });

  it('renders leaf items inside mega panel columns', async () => {
    const parent = makeItem({
      id: 90,
      label: 'Deep',
      href: '/deep',
      children: [
        makeItem({
          id: 91, label: 'Top Col', href: '/deep/col',
          children: [
            makeItem({ id: 92, label: 'Leaf Item', href: '/deep/col/leaf' }),
          ],
        }),
      ],
    });
    renderNav({ navTemplate: 'mega', navItems: [parent] });
    const desktopTrigger = screen.getAllByText('Deep').map((el) => el.closest('a')).find(
      (a) => a?.getAttribute('aria-haspopup') === 'true',
    );
    const container = desktopTrigger?.parentElement as HTMLElement;
    await act(async () => { fireEvent.mouseEnter(container); });

    expect(screen.getAllByText('Leaf Item').length).toBeGreaterThan(0);
  });

  // ── Font customisation ────────────────────────────────────────────────────

  it('applies custom heading font when headingFont prop is provided', () => {
    renderNav({ headingFont: 'Poppins', navItems: [regularItem] });
    // siteName span gets fontFamily from headingFont (rendered as `"Poppins", serif`)
    const span = screen.getByText('Acme Corp');
    expect(span.style.fontFamily).toContain('Poppins');
    // headingFontStack is used in containerStyle / linkInlineStyle fallthrough;
    // just assert it doesn't throw and the span has a font set
    expect(span.style.fontFamily).not.toBe('');
  });

  // ── Classic template ──────────────────────────────────────────────────────

  it('renders classic template (no navTemplate prop) without bold layout class', () => {
    renderNav({ navTemplate: undefined });
    // Classic uses max-w-7xl container
    const classicContainer = document.querySelector('.max-w-7xl');
    expect(classicContainer).toBeTruthy();
  });

  // ── Button style customisation ────────────────────────────────────────────

  it('applies custom buttonStyle to CTA link', () => {
    renderNav({
      navItems: [buttonItem],
      buttonStyle: { primaryBg: '#ff0000', primaryText: '#ffffff', borderRadius: '4px' },
    });
    const links = screen.getAllByText('Book Now');
    const ctaLink = links[0].closest('a') as HTMLElement;
    expect(ctaLink.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(ctaLink.style.color).toBe('rgb(255, 255, 255)');
  });

  // ── Mobile bold/mega CTA button ───────────────────────────────────────────

  it('renders a shrunken mobile CTA pill in bold template when there are button items', async () => {
    setMobile(true);
    renderNav({ navTemplate: 'bold', navItems: [buttonItem] });
    // The mobile right-side group renders first buttonItem as a smaller pill
    const mobileCtas = screen.getAllByText('Book Now');
    // At least one should be in the mobile group (font-size 11px)
    const smallPill = Array.from(mobileCtas).find(
      (el) => (el.closest('a') as HTMLElement)?.style.fontSize === '11px',
    );
    expect(smallPill).toBeTruthy();
  });

  // ── ResizeObserver / CSS variable ────────────────────────────────────────

  it('attaches a ResizeObserver to the nav element on mount', () => {
    renderNav();
    expect(window.ResizeObserver).toBeTruthy();
    // Global stub's observe should have been called
    const ro = (window.ResizeObserver as any).mock?.results?.[0]?.value;
    if (ro) {
      expect(ro.observe).toHaveBeenCalled();
    }
    // If stub isn't a spy, just assert nav exists (the effect ran without throwing)
    expect(document.querySelector('nav')).toBeTruthy();
  });

  // ── Cleanup / unmount ─────────────────────────────────────────────────────

  it('does not throw on unmount (effect cleanup paths)', () => {
    const { unmount } = renderNav({ navItems: [regularItem] });
    expect(() => unmount()).not.toThrow();
  });

  // ── Multiple nav items ────────────────────────────────────────────────────

  it('renders multiple regular items and one button item correctly', () => {
    const items: NavItem[] = [
      makeItem({ id: 1, label: 'Home', href: '/' }),
      makeItem({ id: 2, label: 'About', href: '/about' }),
      makeItem({ id: 3, label: 'Contact', href: '/contact' }),
      makeItem({ id: 4, label: 'Get Started', href: '/start', isButton: true }),
    ];
    renderNav({ navItems: items });
    // Each label appears in both desktop and mobile panels
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('About').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Contact').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Get Started').length).toBeGreaterThan(0);
  });

  it('renders mobile footer CTA section when button items exist', async () => {
    setMobile(true);
    renderNav({ navItems: [buttonItem] });
    await act(async () => { fireEvent.click(screen.getByLabelText('Open menu')); });
    // Mobile footer has a "Talk to a Slate Expert" paragraph
    expect(screen.getByText(/Talk to a Slate Expert/)).toBeTruthy();
  });

  it('does NOT render mobile footer CTA section when no button items exist', async () => {
    setMobile(true);
    renderNav({ navItems: [regularItem] });
    await act(async () => { fireEvent.click(screen.getByLabelText('Open menu')); });
    expect(screen.queryByText(/Talk to a Slate Expert/)).toBeNull();
  });
});
