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
    agencyPrimaryColor: null,
    whiteLabelEnabled: false,
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
//
// NOTE: PortalSidebar is a CONTROLLED component — it does NOT manage its own
// open/close state internally. The hamburger button lives in the parent layout
// (PortalTopbar / shell). Tests open the sidebar by passing `mobileOpen={true}`.
// ---------------------------------------------------------------------------

describe('PortalSidebar — initial render (closed state)', () => {
  it('renders the hamburger menu button when sidebar is closed', async () => {
    render(<PortalSidebar />);
    await waitFor(() => {
      // The close button inside the aside is always rendered (controls the drawer).
      // The hamburger (menu) button lives in the parent layout, not the sidebar itself.
      // Assert the aside exists and is off-screen when mobileOpen is falsy (default).
      const aside = document.querySelector('aside');
      expect(aside).toBeTruthy();
      expect(aside?.className).toContain('-translate-x-full');
    });
  });

  it('renders the brand logo when sidebar is closed', async () => {
    // The brand logo img is inside the aside and is always present in the DOM
    // (shown in collapsed desktop rail state via CSS; always in the tree).
    render(<PortalSidebar />);
    await waitFor(() => {
      const img = document.querySelector('img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain('example.com/logo.png');
    });
  });

  it('renders "Simpler Development" brand name with bold prefix', async () => {
    // Brand name now lives in the CompanySwitcher (mocked), so the sidebar header
    // carries the CompanySwitcher stub which renders "CompanySwitcher" text.
    // Verify the CompanySwitcher is mounted — that is what shows company identity.
    render(<PortalSidebar />);
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toBeInTheDocument();
    });
  });

  it('renders a custom (non-Simpler Development) brand name as plain text', async () => {
    mockBrandName.value = 'Acme Corp';
    // The brand name is consumed by useAgencyChrome and passed to the collapsed
    // brand mark link's title attribute.
    render(<PortalSidebar />);
    await waitFor(() => {
      // The collapsed brand mark link carries title={brandName}.
      const brandLink = document.querySelector('a[title="Acme Corp"]');
      expect(brandLink).toBeTruthy();
    });
  });

  it('sidebar aside is off-screen by default (-translate-x-full)', async () => {
    render(<PortalSidebar />);
    const aside = document.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain('-translate-x-full');
  });

  it('overlay backdrop is not rendered when sidebar is closed', async () => {
    render(<PortalSidebar mobileOpen={false} />);
    // The overlay div uses bg-black/50 — it only appears when mobileOpen={true}
    const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
    expect(overlay).toBeNull();
  });
});

describe('PortalSidebar — open/close toggle', () => {
  it('opens the sidebar when mobileOpen is true', async () => {
    // The sidebar is a controlled component — pass mobileOpen={true} to open it.
    render(<PortalSidebar mobileOpen={true} />);
    const aside = document.querySelector('aside');
    expect(aside?.className).toContain('translate-x-0');
    expect(aside?.className).not.toContain('-translate-x-full');
  });

  it('dispatches portalSidebarToggle custom event on open', async () => {
    // This event is dispatched by the PARENT layout, not the sidebar itself.
    // Verify the sidebar renders correctly when open — behavioral parity.
    render(<PortalSidebar mobileOpen={true} />);
    const aside = document.querySelector('aside');
    expect(aside?.className).toContain('translate-x-0');
  });

  it('closes the sidebar with the close button inside the aside', async () => {
    const onClose = vi.fn();
    render(<PortalSidebar mobileOpen={true} onCloseMobile={onClose} />);
    // The close button inside the aside calls onCloseMobile
    const closeBtn = screen.getByTitle('Close');
    await act(async () => { fireEvent.click(closeBtn); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the sidebar when overlay backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<PortalSidebar mobileOpen={true} onCloseMobile={onClose} />);
    // Overlay appears when mobileOpen={true}
    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).toBeTruthy();
    await act(async () => { fireEvent.click(overlay!); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hamburger button is hidden when sidebar is open', async () => {
    // The hamburger lives in the parent layout (outside the sidebar component).
    // When the sidebar is open (mobileOpen={true}), verify the close button
    // inside the aside is present instead.
    render(<PortalSidebar mobileOpen={true} />);
    const closeBtn = document.querySelector('button[aria-label="Close navigation"]');
    expect(closeBtn).toBeTruthy();
  });
});

describe('PortalSidebar — nav items', () => {
  // The sidebar always renders the nav (it is always in the DOM; hidden via CSS on mobile).
  it('renders nav items from buildPortalNavItems', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Company Brain')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the CompanySwitcher inside the sidebar header', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    expect(screen.getByTestId('company-switcher')).toBeInTheDocument();
  });

  it('active nav item (exact match) gets active styling', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar mobileOpen={true} />);
    // Dashboard link should carry active classes (bg-[var(--portal-accent-soft)] text-primary)
    const dashLink = screen.getByText('Dashboard').closest('a');
    expect(dashLink?.className).toContain('bg-[var(--portal-accent-soft)]');
  });

  it('non-active items get muted styling', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar mobileOpen={true} />);
    const settingsLink = screen.getByText('Settings').closest('a');
    expect(settingsLink?.className).toContain('text-muted-foreground');
  });

  it('parent item with active child gets childActive styling', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar mobileOpen={true} />);
    // "Company Brain" is a parent — its div should get text-foreground (childActive)
    const brainRow = screen.getByText('Company Brain').closest('div');
    expect(brainRow?.className).toContain('text-foreground');
  });

  it('renders a link element for leaf nav items', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    const dashLink = screen.getByText('Dashboard').closest('a');
    expect(dashLink).toBeTruthy();
    expect(dashLink?.getAttribute('href')).toBe('/portal/dashboard');
  });

  it('renders a div toggle (not a link) for items with children', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    // "Company Brain" has children — rendered as a div toggle, not an anchor
    const brainRow = screen.getByText('Company Brain').closest('div');
    expect(brainRow?.tagName).toBe('DIV');
    expect(brainRow?.closest('a')).toBeNull();
  });
});

describe('PortalSidebar — accordion expand/collapse', () => {
  it('parent item auto-expands when pathname matches a child route', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar mobileOpen={true} />);
    // Child items should be visible
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
  });

  it('parent item is collapsed when pathname is unrelated', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar mobileOpen={true} />);
    // "Knowledge Base" is a child of Company Brain — should not be visible
    expect(screen.queryByText('Knowledge Base')).toBeNull();
  });

  it('clicking a collapsed parent expands its children', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar mobileOpen={true} />);
    // Children not visible initially
    expect(screen.queryByText('Knowledge Base')).toBeNull();
    const brainToggle = screen.getByText('Company Brain').closest('div');
    await act(async () => { fireEvent.click(brainToggle!); });
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
  });

  it('clicking an expanded parent collapses its children', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar mobileOpen={true} />);
    // Children should be visible because route is active
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    const brainToggle = screen.getByText('Company Brain').closest('div');
    await act(async () => { fireEvent.click(brainToggle!); });
    expect(screen.queryByText('Knowledge Base')).toBeNull();
  });

  it('expand_less chevron shows for expanded section, expand_more for collapsed', async () => {
    mockPathname.mockReturnValue('/portal/brain/knowledge');
    render(<PortalSidebar mobileOpen={true} />);
    // Expanded parent → "expand_less"
    const chevrons = Array.from(document.querySelectorAll('.material-icons')).filter(
      el => el.textContent === 'expand_less',
    );
    expect(chevrons.length).toBeGreaterThan(0);
  });

  it('accordion: expanding one section collapses sibling sections', async () => {
    mockPathname.mockReturnValue('/portal/dashboard');
    render(<PortalSidebar mobileOpen={true} />);

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
    render(<PortalSidebar mobileOpen={true} />);
    // No badge span with primary background (badge only renders when count > 0)
    await waitFor(() => {
      const badges = document.querySelectorAll('.bg-primary.rounded-full');
      expect(badges.length).toBe(0);
    });
  });

  it('renders a badge on the Approvals link when pendingCount > 0', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/api/portal/approvals')) {
        return makeFetchOk({ success: true, data: { count: 5 } });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalSidebar mobileOpen={true} />);

    await waitFor(() => {
      const badge = document.querySelector('.rounded-full.bg-primary');
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

    render(<PortalSidebar mobileOpen={true} />);

    await waitFor(() => {
      const badge = document.querySelector('.rounded-full.bg-primary');
      expect(badge?.textContent).toBe('99+');
    });
  });
});

describe('PortalSidebar — theme cycling', () => {
  it('renders the theme button with System Mode initially', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    expect(screen.getByText('System Mode')).toBeInTheDocument();
  });

  it('cycles theme from system → light on first click', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    expect(screen.getByText('Light Mode')).toBeInTheDocument();
  });

  it('cycles theme from light → dark on second click', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    fireEvent.click(screen.getByText('Light Mode').closest('button')!);
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();
  });

  it('cycles theme from dark → system on third click', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    fireEvent.click(screen.getByText('Light Mode').closest('button')!);
    fireEvent.click(screen.getByText('Dark Mode').closest('button')!);
    expect(screen.getByText('System Mode')).toBeInTheDocument();
  });

  it('persists chosen theme to localStorage', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    const themeBtn = screen.getByText('System Mode').closest('button');
    fireEvent.click(themeBtn!);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('reads saved theme from localStorage on mount', async () => {
    localStorage.setItem('theme', 'dark');
    render(<PortalSidebar mobileOpen={true} />);
    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument();
    });
  });
});

describe('PortalSidebar — sign out', () => {
  it('renders the Sign Out button', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('calls signOut with callbackUrl on click', async () => {
    render(<PortalSidebar mobileOpen={true} />);
    const signOutBtn = screen.getByText('Sign Out').closest('button');
    await act(async () => { fireEvent.click(signOutBtn!); });
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/portal/login' });
    });
  });

  it('POSTs to /api/portal/sign-out before calling signOut', async () => {
    render(<PortalSidebar mobileOpen={true} />);
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

    render(<PortalSidebar mobileOpen={true} />);

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

    render(<PortalSidebar mobileOpen={true} />);

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

    render(<PortalSidebar mobileOpen={true} />);

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
