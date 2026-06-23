// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that pull in the component.
// ---------------------------------------------------------------------------

const mockPathname = vi.fn(() => '/portal/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...rest }: any) =>
    React.createElement('a', { href, onClick, ...rest }, children),
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(() => Promise.resolve()),
}));

// Stub CompanySwitcher — it has its own heavy fetch logic
vi.mock('@/components/portal/CompanySwitcher', () => ({
  default: () => React.createElement('div', { 'data-testid': 'company-switcher' }, 'CompanySwitcher'),
}));

// AgencyChromeProvider hook — return controllable values
const mockBrandName = { value: 'Simpler Development' };
const mockBrandLogoUrl = { value: 'https://example.com/logo.png' };

vi.mock('@/components/portal/AgencyChromeProvider', () => ({
  useAgencyChrome: () => ({
    brandName: mockBrandName.value,
    brandLogoUrl: mockBrandLogoUrl.value,
  }),
}));

// portal-nav — return a minimal but realistic nav tree
const MOCK_NAV_ITEMS = [
  {
    href: '/portal/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    exact: true,
  },
  {
    href: '/portal/brain',
    label: 'Company Brain',
    icon: 'psychology',
    children: [
      { href: '/portal/brain/knowledge', label: 'Knowledge Base', icon: 'book' },
      { href: '/portal/brain/notes', label: 'Notes', icon: 'sticky_note_2' },
    ],
  },
  {
    href: '/portal/websites',
    label: 'Websites',
    icon: 'web',
    children: [
      { href: '/portal/websites/1/posts', label: 'Posts', icon: 'article' },
    ],
  },
  { href: '/portal/settings', label: 'Settings', icon: 'settings' },
  { href: '/portal/approvals', label: 'Approvals', icon: 'approval' },
];

vi.mock('@/lib/portal-nav', () => ({
  buildPortalNavItems: vi.fn((_siteId: any, _siteName: any, _apps: any) => MOCK_NAV_ITEMS),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks are declared
// ---------------------------------------------------------------------------
import PortalSidebar from '@/components/portal/PortalSidebar';
import { signOut } from 'next-auth/react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function setupFetch() {
  global.fetch = vi.fn((url: string) => {
    if (typeof url === 'string' && url.includes('/api/portal/cms/websites')) {
      return makeFetchOk({ success: true, data: [{ id: 1, name: 'My Site' }] });
    }
    if (typeof url === 'string' && url.includes('/api/portal/services/nav')) {
      return makeFetchOk({ success: true, data: [] });
    }
    if (typeof url === 'string' && url.includes('/api/portal/approvals')) {
      return makeFetchOk({ success: true, data: { count: 0 } });
    }
    if (typeof url === 'string' && url.includes('/api/portal/sign-out')) {
      return makeFetchOk({ success: true });
    }
    return makeFetchOk({ success: true, data: [] });
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname.mockReturnValue('/portal/dashboard');
  mockBrandName.value = 'Simpler Development';
  mockBrandLogoUrl.value = 'https://example.com/logo.png';
  localStorage.clear();
  setupFetch();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PortalSidebar — initial render (closed state)', () => {
  it('renders the hamburger menu button when sidebar is closed', async () => {
    render(<PortalSidebar />);
    await waitFor(() => {
      // The menu icon button appears in closed state
      const menuBtn = document.querySelector('button span.material-icons');
      expect(menuBtn?.textContent).toBe('menu');
    });
  });

  it('renders the brand logo when sidebar is closed', async () => {
    render(<PortalSidebar />);
    await waitFor(() => {
      const img = document.querySelector('img.nav-logo-icon') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain('example.com/logo.png');
    });
  });

  it('renders "Simpler Development" brand name with bold prefix', async () => {
    render(<PortalSidebar />);
    await waitFor(() => {
      expect(screen.getByText('Simpler')).toBeInTheDocument();
      expect(screen.getByText('Development')).toBeInTheDocument();
    });
  });

  it('renders a custom (non-Simpler Development) brand name as plain text', async () => {
    mockBrandName.value = 'Acme Corp';
    render(<PortalSidebar />);
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
  });

  it('sidebar aside is off-screen by default (-translate-x-full)', async () => {
    render(<PortalSidebar />);
    const aside = document.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain('-translate-x-full');
  });

  it('overlay backdrop is not rendered when sidebar is closed', async () => {
    render(<PortalSidebar />);
    // The overlay div uses bg-black/50 — it only appears when open
    const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
    expect(overlay).toBeNull();
  });
});

describe('PortalSidebar — open/close toggle', () => {
  it('opens the sidebar when hamburger is clicked', async () => {
    render(<PortalSidebar />);
    // Find the outermost hamburger button (contains "menu" icon)
    const menuBtns = Array.from(document.querySelectorAll('button')).filter(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    expect(menuBtns.length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(menuBtns[0]); });
    const aside = document.querySelector('aside');
    expect(aside?.className).toContain('translate-x-0');
  });

  it('dispatches portalSidebarToggle custom event on open', async () => {
    render(<PortalSidebar />);
    const events: CustomEvent[] = [];
    window.addEventListener('portalSidebarToggle', (e) => events.push(e as CustomEvent));
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
    expect(events.length).toBe(1);
    expect(events[0].detail).toEqual({ open: true });
  });

  it('closes the sidebar with the close button inside the aside', async () => {
    render(<PortalSidebar />);
    // Open first
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
    // Now find the close button (title="Close sidebar")
    const closeBtn = screen.getByTitle('Close sidebar');
    await act(async () => { fireEvent.click(closeBtn); });
    const aside = document.querySelector('aside');
    expect(aside?.className).toContain('-translate-x-full');
  });

  it('closes the sidebar when overlay backdrop is clicked', async () => {
    render(<PortalSidebar />);
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
    // Overlay appears
    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).toBeTruthy();
    await act(async () => { fireEvent.click(overlay!); });
    const aside = document.querySelector('aside');
    expect(aside?.className).toContain('-translate-x-full');
  });

  it('hamburger button is hidden when sidebar is open', async () => {
    render(<PortalSidebar />);
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
    // After open, the hamburger button (which is outside the aside) should not be in DOM
    const outerMenuBtns = Array.from(document.querySelectorAll('button')).filter(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    expect(outerMenuBtns.length).toBe(0);
  });
});

describe('PortalSidebar — nav items', () => {
  async function openSidebar() {
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
  }

  it('renders nav items from buildPortalNavItems', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Company Brain')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the CompanySwitcher inside the sidebar header', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    expect(screen.getByTestId('company-switcher')).toBeInTheDocument();
  });

  it('active nav item (exact match) gets active styling', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar />);
    await openSidebar();
    // Dashboard link should carry active classes (bg-primary text-primary-foreground)
    const dashLink = screen.getByText('Dashboard').closest('a');
    expect(dashLink?.className).toContain('bg-primary');
  });

  it('non-active items get muted styling', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar />);
    await openSidebar();
    const settingsLink = screen.getByText('Settings').closest('a');
    expect(settingsLink?.className).toContain('text-muted-foreground');
  });

  it('parent item with active child gets childActive styling', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar />);
    await openSidebar();
    // "Company Brain" is a parent — its div should get bg-accent/50
    const brainRow = screen.getByText('Company Brain').closest('div');
    expect(brainRow?.className).toContain('bg-accent/50');
  });

  it('renders a link element for leaf nav items', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    const dashLink = screen.getByText('Dashboard').closest('a');
    expect(dashLink).toBeTruthy();
    expect(dashLink?.getAttribute('href')).toBe('/portal/dashboard');
  });

  it('renders a div toggle (not a link) for items with children', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    // "Company Brain" has children — rendered as a div toggle, not an anchor
    const brainRow = screen.getByText('Company Brain').closest('div');
    expect(brainRow?.tagName).toBe('DIV');
    expect(brainRow?.closest('a')).toBeNull();
  });
});

describe('PortalSidebar — accordion expand/collapse', () => {
  async function openSidebar() {
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
  }

  it('parent item auto-expands when pathname matches a child route', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar />);
    await openSidebar();
    // Child items should be visible
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
  });

  it('parent item is collapsed when pathname is unrelated', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar />);
    await openSidebar();
    // "Knowledge Base" is a child of Company Brain — should not be visible
    expect(screen.queryByText('Knowledge Base')).toBeNull();
  });

  it('clicking a collapsed parent expands its children', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar />);
    await openSidebar();
    // Children not visible initially
    expect(screen.queryByText('Knowledge Base')).toBeNull();
    const brainToggle = screen.getByText('Company Brain').closest('div');
    await act(async () => { fireEvent.click(brainToggle!); });
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
  });

  it('clicking an expanded parent collapses its children', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar />);
    await openSidebar();
    // Children should be visible because route is active
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    const brainToggle = screen.getByText('Company Brain').closest('div');
    await act(async () => { fireEvent.click(brainToggle!); });
    expect(screen.queryByText('Knowledge Base')).toBeNull();
  });

  it('expand_less chevron shows for expanded section, expand_more for collapsed', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar />);
    await openSidebar();
    // Expanded parent → "expand_less"
    const chevrons = Array.from(document.querySelectorAll('.material-icons')).filter(
      el => el.textContent === 'expand_less',
    );
    expect(chevrons.length).toBeGreaterThan(0);
  });

  it('accordion: expanding one section collapses sibling sections', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar />);
    await openSidebar();

    // Expand Company Brain
    const brainToggle = screen.getByText('Company Brain').closest('div');
    await act(async () => { fireEvent.click(brainToggle!); });
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();

    // Expand Websites — should collapse Company Brain
    const websitesToggle = screen.getByText('Websites').closest('div');
    await act(async () => { fireEvent.click(websitesToggle!); });
    expect(screen.queryByText('Knowledge Base')).toBeNull();
    expect(screen.getByText('Posts')).toBeInTheDocument();
  });
});

describe('PortalSidebar — approvals badge', () => {
  it('does not render badge when pending count is 0', async () => {
    render(<PortalSidebar />);
    // Open sidebar to check nav links
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
    // No badge span with amber-500 background
    const badges = document.querySelectorAll('.bg-amber-500');
    expect(badges.length).toBe(0);
  });

  it('renders a badge on the Approvals link when pendingCount > 0', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/api/portal/approvals')) {
        return makeFetchOk({ success: true, data: { count: 5 } });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalSidebar />);
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });

    await waitFor(() => {
      const badge = document.querySelector('.bg-amber-500');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('5');
    });
  });

  it('caps badge display at "99+" when count exceeds 99', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/api/portal/approvals')) {
        return makeFetchOk({ success: true, data: { count: 150 } });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalSidebar />);
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });

    await waitFor(() => {
      const badge = document.querySelector('.bg-amber-500');
      expect(badge?.textContent).toBe('99+');
    });
  });
});

describe('PortalSidebar — theme cycling', () => {
  async function openSidebar() {
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
  }

  it('renders the theme button with System Mode initially', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    expect(screen.getByText('System Mode')).toBeInTheDocument();
  });

  it('cycles theme from system → light on first click', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    expect(screen.getByText('Light Mode')).toBeInTheDocument();
  });

  it('cycles theme from light → dark on second click', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    fireEvent.click(screen.getByText('Light Mode').closest('button')!);
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();
  });

  it('cycles theme from dark → system on third click', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    fireEvent.click(screen.getByText('Light Mode').closest('button')!);
    fireEvent.click(screen.getByText('Dark Mode').closest('button')!);
    expect(screen.getByText('System Mode')).toBeInTheDocument();
  });

  it('persists chosen theme to localStorage', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('reads saved theme from localStorage on mount', async () => {
    localStorage.setItem('theme', 'dark');
    render(<PortalSidebar />);
    await openSidebar();
    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument();
    });
  });
});

describe('PortalSidebar — sign out', () => {
  async function openSidebar() {
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });
  }

  it('renders the Sign Out button', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('calls signOut with callbackUrl on click', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    const signOutBtn = screen.getByText('Sign Out').closest('button');
    await act(async () => { fireEvent.click(signOutBtn!); });
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/portal/login' });
    });
  });

  it('POSTs to /api/portal/sign-out before calling signOut', async () => {
    render(<PortalSidebar />);
    await openSidebar();
    const signOutBtn = screen.getByText('Sign Out').closest('button');
    await act(async () => { fireEvent.click(signOutBtn!); });
    await waitFor(() => {
      const call = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[0] === '/api/portal/sign-out' && c[1]?.method === 'POST',
      );
      expect(call).toBeTruthy();
    });
  });
});

describe('PortalSidebar — CMS site context', () => {
  it('fetches site name when pathname matches a CMS site route', async () => {
    mockPathname.mockReturnValue('/portal/websites/1/posts');
    render(<PortalSidebar />);
    await waitFor(() => {
      expect((global.fetch as any).mock.calls.some(
        (c: any[]) => c[0].includes('/api/portal/cms/websites'),
      )).toBe(true);
    });
  });

  it('does not fetch site name when pathname has no siteId', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar />);
    // Wait for mount effects
    await waitFor(() => {
      expect((global.fetch as any).mock.calls.some(
        (c: any[]) => c[0].includes('/api/portal/services/nav'),
      )).toBe(true);
    });
    const websiteCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[0].includes('/api/portal/cms/websites'),
    );
    expect(websiteCalls.length).toBe(0);
  });
});

describe('PortalSidebar — service nav injection', () => {
  it('injects non-excluded services before the settings item', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/api/portal/services/nav')) {
        return makeFetchOk({
          success: true,
          data: [
            { id: 1, name: 'SEO Tools', category: 'marketing', icon: 'search', href: '/portal/services/seo', subscribed: true },
          ],
        });
      }
      if (typeof url === 'string' && url.includes('/api/portal/approvals')) {
        return makeFetchOk({ success: true, data: { count: 0 } });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalSidebar />);
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });

    await waitFor(() => {
      expect(screen.getByText('SEO Tools')).toBeInTheDocument();
    });
  });

  it('excludes services in the EXCLUDED_SERVICES set', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/api/portal/services/nav')) {
        return makeFetchOk({
          success: true,
          data: [
            { id: 1, name: 'Chat Bot', category: 'ai', icon: 'chat', href: '/portal/services/chatbot', subscribed: true },
            { id: 2, name: 'Websites', category: 'web', icon: 'web', href: '/portal/services/websites', subscribed: true },
          ],
        });
      }
      if (typeof url === 'string' && url.includes('/api/portal/approvals')) {
        return makeFetchOk({ success: true, data: { count: 0 } });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalSidebar />);
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });

    await waitFor(() => {
      // Wait for the services fetch to complete
      expect((global.fetch as any).mock.calls.some(
        (c: any[]) => c[0].includes('/api/portal/services/nav'),
      )).toBe(true);
    });

    // These should not appear — both are in EXCLUDED_SERVICES
    expect(screen.queryAllByText('Chat Bot').length).toBe(0);
  });

  it('excludes services whose name starts with double-underscore', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/api/portal/services/nav')) {
        return makeFetchOk({
          success: true,
          data: [
            { id: 1, name: '__internal_service', category: 'system', icon: 'build', href: '/portal/services/__internal', subscribed: true },
          ],
        });
      }
      if (typeof url === 'string' && url.includes('/api/portal/approvals')) {
        return makeFetchOk({ success: true, data: { count: 0 } });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalSidebar />);
    const menuBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.querySelector('span.material-icons')?.textContent === 'menu',
    );
    await act(async () => { fireEvent.click(menuBtn!); });

    await waitFor(() => {
      expect((global.fetch as any).mock.calls.some(
        (c: any[]) => c[0].includes('/api/portal/services/nav'),
      )).toBe(true);
    });

    expect(screen.queryByText('__internal_service')).toBeNull();
  });
});

describe('PortalSidebar — apps prop', () => {
  it('passes apps through to buildPortalNavItems', async () => {
    const { buildPortalNavItems } = await import('@/lib/portal-nav');
    const mockApps = [{ id: 'app-1', name: 'Test App', href: '/portal/apps/test', icon: 'apps', nav: [] }] as any;
    // Pathname has no siteId, so activeSiteId and activeSiteName are both null
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar apps={mockApps} />);
    await waitFor(() => {
      // 4th arg is the reconstructed entitlement set — undefined when the
      // sidebar is rendered without an entitlements prop.
      expect(buildPortalNavItems).toHaveBeenCalledWith(null, null, mockApps, undefined);
    });
  });

  it('renders without apps prop (default undefined)', async () => {
    render(<PortalSidebar />);
    // Should not throw
    expect(document.querySelector('aside')).toBeTruthy();
  });
});
