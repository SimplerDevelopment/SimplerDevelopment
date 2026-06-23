// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / framework deps
// ---------------------------------------------------------------------------

// next/link -> plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// next/navigation -> stateful pathname + spy router
let currentPathname = '/account';
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: routerPush }),
}));

// Mock Navigation / Footer used by LayoutContent so we can assert on them.
vi.mock('@/components/ui/Navigation', () => ({
  Navigation: () => React.createElement('nav', { 'data-testid': 'mock-nav' }, 'NAV'),
}));
vi.mock('@/components/ui/Footer', () => ({
  Footer: () => React.createElement('footer', { 'data-testid': 'mock-footer' }, 'FOOT'),
}));

// SelfDestruct is lazy-loaded by LayoutContent — provide a stub module so
// React.lazy can resolve without hitting animate.css.
vi.mock('@/components/easter-eggs/SelfDestruct', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'mock-self-destruct' }),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { AccountLayout } from '@/components/storefront/account/AccountLayout';
import {
  CustomerAuthProvider,
  useCustomerAuth,
} from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { LayoutContent } from '@/components/LayoutContent';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeFetch(
  responder: (url: string, init: RequestInit) => { ok?: boolean; payload: any },
) {
  return vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    const out = responder(url, init);
    return {
      ok: out.ok ?? true,
      json: async () => out.payload,
    };
  });
}

beforeEach(() => {
  currentPathname = '/account';
  routerPush.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// CustomerAuthContext / CustomerAuthProvider
// ---------------------------------------------------------------------------

describe('CustomerAuthContext', () => {
  it('throws when useCustomerAuth is called outside the provider', () => {
    // Render a component that calls the hook with no provider.
    function Bare() {
      useCustomerAuth();
      return null;
    }
    // Swallow React's expected error overlay for this test
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/useCustomerAuth must be used within/i);
    errSpy.mockRestore();
  });

  it('starts with no token and finishes loading when localStorage is empty', async () => {
    // No token in storage -> refreshCustomer should short-circuit and clear loading.
    (globalThis as any).fetch = vi.fn(); // should NOT be called

    function Probe() {
      const { customer, token, loading } = useCustomerAuth();
      return (
        <div data-testid="probe">
          <span data-testid="customer">{customer ? 'yes' : 'no'}</span>
          <span data-testid="token">{token ?? 'null'}</span>
          <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
        </div>
      );
    }

    render(
      <CustomerAuthProvider siteId={42}>
        <Probe />
      </CustomerAuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });
    expect(screen.getByTestId('customer').textContent).toBe('no');
    expect(screen.getByTestId('token').textContent).toBe('null');
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('restores an existing token from localStorage and populates customer via "me"', async () => {
    localStorage.setItem('customer_token_99', 'cached-token');

    (globalThis as any).fetch = makeFetch((_url, init) => {
      const body = JSON.parse((init.body as string) ?? '{}');
      if (body.action === 'me') {
        return {
          payload: {
            success: true,
            data: { id: 1, email: 'a@b.com', firstName: 'A', lastName: 'B' },
          },
        };
      }
      return { payload: { success: false } };
    });

    function Probe() {
      const { customer, token } = useCustomerAuth();
      return (
        <div>
          <span data-testid="email">{customer?.email ?? '-'}</span>
          <span data-testid="token">{token ?? '-'}</span>
        </div>
      );
    }

    render(
      <CustomerAuthProvider siteId={99}>
        <Probe />
      </CustomerAuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('email').textContent).toBe('a@b.com');
    });
    expect(screen.getByTestId('token').textContent).toBe('cached-token');
  });

  it('clears storage when "me" reports failure', async () => {
    localStorage.setItem('customer_token_7', 'bad-token');

    (globalThis as any).fetch = makeFetch(() => ({
      payload: { success: false, message: 'expired' },
    }));

    function Probe() {
      const { customer, token, loading } = useCustomerAuth();
      return (
        <div>
          <span data-testid="customer">{customer ? 'yes' : 'no'}</span>
          <span data-testid="token">{token ?? 'null'}</span>
          <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
        </div>
      );
    }

    render(
      <CustomerAuthProvider siteId={7}>
        <Probe />
      </CustomerAuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });
    expect(screen.getByTestId('customer').textContent).toBe('no');
    expect(localStorage.getItem('customer_token_7')).toBeNull();
  });

  it('login stores the token and customer on success', async () => {
    (globalThis as any).fetch = makeFetch((_url, init) => {
      const body = JSON.parse((init.body as string) ?? '{}');
      if (body.action === 'login') {
        return {
          payload: {
            success: true,
            data: { token: 'fresh-tkn', customer: { id: 2, email: 'x@y.com' } },
          },
        };
      }
      return { payload: { success: false } };
    });

    let captured: any = null;
    function Probe() {
      const ctx = useCustomerAuth();
      captured = ctx;
      return <span data-testid="email">{ctx.customer?.email ?? '-'}</span>;
    }

    render(
      <CustomerAuthProvider siteId={5}>
        <Probe />
      </CustomerAuthProvider>,
    );

    // Wait for initial loading to settle (no token -> instant ready)
    await waitFor(() => expect(captured).not.toBeNull());

    let result: any;
    await act(async () => {
      result = await captured!.login('x@y.com', 'pw');
    });
    expect(result).toEqual({ success: true, message: undefined });
    expect(localStorage.getItem('customer_token_5')).toBe('fresh-tkn');

    await waitFor(() => {
      expect(screen.getByTestId('email').textContent).toBe('x@y.com');
    });
  });

  it('login returns the server message when it fails and does not store a token', async () => {
    (globalThis as any).fetch = makeFetch(() => ({
      payload: { success: false, message: 'nope' },
    }));

    let captured: any = null;
    function Probe() {
      captured = useCustomerAuth();
      return null;
    }

    render(
      <CustomerAuthProvider siteId={3}>
        <Probe />
      </CustomerAuthProvider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    let result: any;
    await act(async () => {
      result = await captured!.login('x@y.com', 'pw');
    });
    expect(result).toEqual({ success: false, message: 'nope' });
    expect(localStorage.getItem('customer_token_3')).toBeNull();
  });

  it('register stores the token on success', async () => {
    (globalThis as any).fetch = makeFetch(() => ({
      payload: {
        success: true,
        data: { token: 'reg-tkn', customer: { id: 9, email: 'r@r.com' } },
      },
    }));

    let captured: any = null;
    function Probe() {
      captured = useCustomerAuth();
      return null;
    }

    render(
      <CustomerAuthProvider siteId={11}>
        <Probe />
      </CustomerAuthProvider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    let result: any;
    await act(async () => {
      result = await captured!.register({ email: 'r@r.com', password: 'pw' });
    });
    expect(result.success).toBe(true);
    expect(localStorage.getItem('customer_token_11')).toBe('reg-tkn');
  });

  it('logout clears the token and customer', async () => {
    localStorage.setItem('customer_token_8', 'pre-tkn');

    (globalThis as any).fetch = makeFetch((_url, init) => {
      const body = JSON.parse((init.body as string) ?? '{}');
      if (body.action === 'me') {
        return {
          payload: { success: true, data: { id: 1, email: 'a@a.com' } },
        };
      }
      // logout
      return { payload: { success: true } };
    });

    let captured: any = null;
    function Probe() {
      captured = useCustomerAuth();
      return <span data-testid="email">{captured.customer?.email ?? '-'}</span>;
    }

    render(
      <CustomerAuthProvider siteId={8}>
        <Probe />
      </CustomerAuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('email').textContent).toBe('a@a.com'),
    );

    await act(async () => {
      await captured!.logout();
    });

    expect(localStorage.getItem('customer_token_8')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('email').textContent).toBe('-'),
    );
  });
});

// ---------------------------------------------------------------------------
// AccountLayout
// ---------------------------------------------------------------------------

// Helper: render AccountLayout with the real provider, but pre-seed storage and
// fetch so we get a known customer.
function renderAccountLayout({
  pathname,
  customer,
}: {
  pathname: string;
  customer: any | null;
}) {
  currentPathname = pathname;

  if (customer) {
    localStorage.setItem('customer_token_1', 'tkn');
    (globalThis as any).fetch = makeFetch(() => ({
      payload: { success: true, data: customer },
    }));
  } else {
    (globalThis as any).fetch = vi.fn();
  }

  return render(
    <CustomerAuthProvider siteId={1}>
      <AccountLayout siteId={1} domain="shop.example.com">
        <div data-testid="account-child">child content</div>
      </AccountLayout>
    </CustomerAuthProvider>,
  );
}

describe('AccountLayout', () => {
  it('renders all primary nav items and the children', async () => {
    renderAccountLayout({ pathname: '/account', customer: null });

    // Children always render
    expect(screen.getByTestId('account-child')).toBeTruthy();

    // Each label exists in both desktop and mobile nav -> use getAllByText
    for (const label of ['Dashboard', 'Orders', 'Wishlist', 'Support', 'Profile']) {
      const matches = screen.getAllByText(label);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    }

    // Sign Out is desktop-only
    expect(screen.getByText('Sign Out')).toBeTruthy();
  });

  it('marks the Dashboard link as active when pathname is exactly /account', async () => {
    renderAccountLayout({ pathname: '/account', customer: null });

    // Multiple "Dashboard" texts (desktop + mobile). The desktop one wraps in
    // an <a> with the active class set.
    const dashLinks = screen
      .getAllByText('Dashboard')
      .map(node => node.closest('a'))
      .filter(Boolean) as HTMLAnchorElement[];
    expect(dashLinks.length).toBeGreaterThan(0);
    // At least one should carry the active styling
    expect(dashLinks.some(a => a.className.includes('bg-gray-100'))).toBe(true);
  });

  it('marks Orders as active when pathname starts with /account/orders', async () => {
    renderAccountLayout({ pathname: '/account/orders/123', customer: null });

    const ordersLinks = screen
      .getAllByText('Orders')
      .map(node => node.closest('a'))
      .filter(Boolean) as HTMLAnchorElement[];
    expect(ordersLinks.some(a => a.className.includes('bg-gray-100'))).toBe(true);

    // Dashboard should NOT be active for /account/orders
    const dashLinks = screen
      .getAllByText('Dashboard')
      .map(node => node.closest('a'))
      .filter(Boolean) as HTMLAnchorElement[];
    expect(dashLinks.every(a => !a.className.includes('bg-gray-100'))).toBe(true);
  });

  it('shows full name when first/last are present', async () => {
    renderAccountLayout({
      pathname: '/account',
      customer: {
        id: 1,
        email: 'jane@x.com',
        firstName: 'Jane',
        lastName: 'Doe',
      },
    });

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    expect(screen.getByText('jane@x.com')).toBeTruthy();
  });

  it('falls back to email when name fields are blank', async () => {
    renderAccountLayout({
      pathname: '/account',
      customer: {
        id: 1,
        email: 'only@x.com',
        firstName: null,
        lastName: null,
      },
    });

    // The "name" line is the first <p>; it should equal the email when no name set.
    await waitFor(() => {
      const matches = screen.getAllByText('only@x.com');
      // Once as the name fallback and once as the email subtext.
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('invokes logout when the Sign Out button is clicked', async () => {
    let logoutFetchCalled = false;
    localStorage.setItem('customer_token_1', 'tkn');
    (globalThis as any).fetch = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse((init.body as string) ?? '{}');
      if (body.action === 'me') {
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 1, email: 'a@a.com' } }),
        };
      }
      if (body.action === 'logout') {
        logoutFetchCalled = true;
      }
      return { ok: true, json: async () => ({ success: true }) };
    });

    currentPathname = '/account';
    render(
      <CustomerAuthProvider siteId={1}>
        <AccountLayout siteId={1} domain="shop.example.com">
          <div />
        </AccountLayout>
      </CustomerAuthProvider>,
    );

    await waitFor(() => {
      // Multiple matches expected (name fallback + email subtext).
      expect(screen.getAllByText('a@a.com').length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign Out'));
    });
    expect(logoutFetchCalled).toBe(true);
    expect(localStorage.getItem('customer_token_1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RequireAuth
// ---------------------------------------------------------------------------

describe('RequireAuth', () => {
  it('shows the spinner while loading', () => {
    // Token exists but fetch never resolves -> stays "loading" indefinitely
    localStorage.setItem('customer_token_1', 'tkn');
    (globalThis as any).fetch = vi
      .fn()
      .mockImplementation(() => new Promise(() => {})); // never resolves

    const { container } = render(
      <CustomerAuthProvider siteId={1}>
        <RequireAuth>
          <div data-testid="protected">secret</div>
        </RequireAuth>
      </CustomerAuthProvider>,
    );

    // Should NOT render protected content
    expect(screen.queryByTestId('protected')).toBeNull();
    // Should render the loading spinner (animate-spin class on icon)
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('pushes to /account/login when not authenticated', async () => {
    (globalThis as any).fetch = vi.fn();

    render(
      <CustomerAuthProvider siteId={1}>
        <RequireAuth>
          <div data-testid="protected">secret</div>
        </RequireAuth>
      </CustomerAuthProvider>,
    );

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/account/login'));
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('renders children when authenticated', async () => {
    localStorage.setItem('customer_token_1', 'tkn');
    (globalThis as any).fetch = makeFetch(() => ({
      payload: { success: true, data: { id: 1, email: 'a@a.com' } },
    }));

    render(
      <CustomerAuthProvider siteId={1}>
        <RequireAuth>
          <div data-testid="protected">secret</div>
        </RequireAuth>
      </CustomerAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('protected')).toBeTruthy());
    expect(routerPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LayoutContent
// ---------------------------------------------------------------------------

describe('LayoutContent', () => {
  function renderAt(pathname: string, props: { isClientSite?: boolean } = {}) {
    currentPathname = pathname;
    return render(
      <LayoutContent isClientSite={props.isClientSite}>
        <div data-testid="page-body">body</div>
      </LayoutContent>,
    );
  }

  it('renders nav + footer for a normal marketing route', () => {
    renderAt('/about');
    expect(screen.getByTestId('mock-nav')).toBeTruthy();
    expect(screen.getByTestId('mock-footer')).toBeTruthy();
    expect(screen.getByTestId('page-body')).toBeTruthy();
  });

  it('skips chrome when pathname starts with /admin', () => {
    renderAt('/admin/dashboard');
    expect(screen.queryByTestId('mock-nav')).toBeNull();
    expect(screen.queryByTestId('mock-footer')).toBeNull();
    expect(screen.getByTestId('page-body')).toBeTruthy();
  });

  it('skips chrome on /portal routes', () => {
    renderAt('/portal/inbox');
    expect(screen.queryByTestId('mock-nav')).toBeNull();
  });

  it('skips chrome on /pitch-deck routes', () => {
    renderAt('/pitch-deck/foo');
    expect(screen.queryByTestId('mock-nav')).toBeNull();
  });

  it('skips chrome on /book routes', () => {
    renderAt('/book/discovery');
    expect(screen.queryByTestId('mock-nav')).toBeNull();
  });

  it('skips chrome on /s/ survey routes', () => {
    renderAt('/s/abc');
    expect(screen.queryByTestId('mock-nav')).toBeNull();
  });

  it('skips chrome on /sites/ routes', () => {
    renderAt('/sites/abc/edit');
    expect(screen.queryByTestId('mock-nav')).toBeNull();
  });

  it('skips chrome when isClientSite prop is true', () => {
    renderAt('/some-public-page', { isClientSite: true });
    expect(screen.queryByTestId('mock-nav')).toBeNull();
    expect(screen.getByTestId('page-body')).toBeTruthy();
  });
});
