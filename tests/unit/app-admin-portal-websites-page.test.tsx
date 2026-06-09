// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/portal-websites/page.tsx`
 * Client component — render directly; stub fetch + window globals.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
    back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/portal-websites',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseSite = {
  id: 1,
  clientId: 10,
  name: 'Acme Site',
  domain: 'acme.example.com',
  description: 'Main site',
  active: true,
  createdAt: '2025-01-15T00:00:00Z',
  clientCompany: 'Acme Corp',
  clientUserName: 'alice',
  clientUserEmail: 'alice@acme.example.com',
  storeSettings: {
    stripeByokAllowed: false,
    stripeMode: 'connect',
    stripeSecretKeyConfigured: false,
    hasStoreSettingsRow: false,
  },
};

const baseClient = {
  id: 10,
  company: 'Acme Corp',
  userName: 'alice',
  userEmail: 'alice@acme.example.com',
};

// ─── Fetch helpers ───────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => { ok: boolean; json: () => Promise<unknown> };

const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body } as ReturnType<FetchHandler>;
}

function defaultFetch(url: string, init?: RequestInit): ReturnType<FetchHandler> {
  if (url === '/api/admin/portal/websites' && (!init || init.method === undefined || init.method === 'GET')) {
    return jsonOk({ success: true, data: [baseSite] });
  }
  if (url === '/api/admin/portal/clients') {
    return jsonOk({ success: true, data: [baseClient] });
  }
  if (/^\/api\/admin\/portal\/websites\/\d+$/.test(url)) {
    return jsonOk({ success: true, data: { ...baseSite } });
  }
  return jsonOk({ success: true, data: null });
}

let confirmMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setFetchHandler(defaultFetch);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(handlers[0](url, init)),
    ),
  );
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import AdminPortalWebsitesPage from '@/app/admin/portal-websites/page';

async function renderPage() {
  const result = render(<AdminPortalWebsitesPage />);
  // Wait until the main heading is visible (loading complete)
  await waitFor(() => {
    expect(result.container.textContent).toContain('Client Websites');
  }, { timeout: 10000 });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AdminPortalWebsitesPage — loading state', () => {
  it('shows a spinner before data loads', async () => {
    let resolveWebsites!: (v: unknown) => void;
    let resolveClients!: (v: unknown) => void;
    setFetchHandler((url) => {
      if (url === '/api/admin/portal/websites') {
        return new Promise((res) => { resolveWebsites = res; }) as unknown as ReturnType<FetchHandler>;
      }
      return new Promise((res) => { resolveClients = res; }) as unknown as ReturnType<FetchHandler>;
    });
    const { container } = render(<AdminPortalWebsitesPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    // Resolve to allow cleanup
    resolveWebsites(jsonOk({ success: true, data: [] }));
    resolveClients(jsonOk({ success: true, data: [] }));
  });
});

describe('AdminPortalWebsitesPage — page header', () => {
  it('renders the heading and add-website button', async () => {
    await renderPage();
    expect(screen.getByText('Client Websites')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Website/ })).toBeTruthy();
  });

  it('renders the search input', async () => {
    await renderPage();
    expect(screen.getByPlaceholderText('Search websites or clients...')).toBeTruthy();
  });
});

describe('AdminPortalWebsitesPage — websites list', () => {
  it('renders website rows after fetch', async () => {
    await renderPage();
    expect(screen.getByText('Acme Site')).toBeTruthy();
    expect(screen.getByText('acme.example.com')).toBeTruthy();
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(screen.getByText('alice@acme.example.com')).toBeTruthy();
  });

  it('shows description when present', async () => {
    await renderPage();
    expect(screen.getByText('Main site')).toBeTruthy();
  });

  it('shows "Not set" for null domain', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({ success: true, data: [{ ...baseSite, domain: null }] });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    expect(screen.getByText('Not set')).toBeTruthy();
  });

  it('falls back to clientUserName when clientCompany is null', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({ success: true, data: [{ ...baseSite, clientCompany: null }] });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    expect(screen.getByText('alice')).toBeTruthy();
  });

  it('shows empty state when no websites and no search', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({ success: true, data: [] });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    expect(screen.getByText('No client websites yet.')).toBeTruthy();
  });

  it('shows active badge for active site', async () => {
    await renderPage();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows inactive badge for inactive site', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({ success: true, data: [{ ...baseSite, active: false }] });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });
});

describe('AdminPortalWebsitesPage — stripe BYOK column', () => {
  it('shows "Connect" pill when BYOK is not allowed', async () => {
    await renderPage();
    expect(screen.getByText('Connect')).toBeTruthy();
  });

  it('shows "BYOK Allowed" pill when byokAllowed=true and mode=connect', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({
          success: true,
          data: [{
            ...baseSite,
            storeSettings: { stripeByokAllowed: true, stripeMode: 'connect', stripeSecretKeyConfigured: false, hasStoreSettingsRow: true },
          }],
        });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    expect(screen.getByText('BYOK Allowed')).toBeTruthy();
  });

  it('shows "BYOK Active" pill when stripeMode=byok', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({
          success: true,
          data: [{
            ...baseSite,
            storeSettings: { stripeByokAllowed: true, stripeMode: 'byok', stripeSecretKeyConfigured: true, hasStoreSettingsRow: true },
          }],
        });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    expect(screen.getByText('BYOK Active')).toBeTruthy();
  });

  it('renders the "Allow BYOK" checkbox', async () => {
    await renderPage();
    expect(screen.getByText('Allow BYOK')).toBeTruthy();
  });
});

describe('AdminPortalWebsitesPage — search filter', () => {
  it('filters by site name', async () => {
    const site2 = { ...baseSite, id: 2, name: 'Beta Site', clientUserEmail: 'beta@x.com', clientUserName: 'beta' };
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({ success: true, data: [baseSite, site2] });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    const searchInput = screen.getByPlaceholderText('Search websites or clients...');
    fireEvent.change(searchInput, { target: { value: 'Beta' } });
    expect(screen.queryByText('Acme Site')).toBeNull();
    expect(screen.getByText('Beta Site')).toBeTruthy();
  });

  it('filters by domain', async () => {
    await renderPage();
    const searchInput = screen.getByPlaceholderText('Search websites or clients...');
    fireEvent.change(searchInput, { target: { value: 'acme.example' } });
    expect(screen.getByText('Acme Site')).toBeTruthy();
  });

  it('shows "No websites match your search." when no results', async () => {
    await renderPage();
    const searchInput = screen.getByPlaceholderText('Search websites or clients...');
    fireEvent.change(searchInput, { target: { value: 'zzznomatch' } });
    expect(screen.getByText('No websites match your search.')).toBeTruthy();
  });

  it('filters case-insensitively by clientUserName', async () => {
    await renderPage();
    const searchInput = screen.getByPlaceholderText('Search websites or clients...');
    fireEvent.change(searchInput, { target: { value: 'ALICE' } });
    expect(screen.getByText('Acme Site')).toBeTruthy();
  });

  it('filters by clientCompany', async () => {
    await renderPage();
    const searchInput = screen.getByPlaceholderText('Search websites or clients...');
    fireEvent.change(searchInput, { target: { value: 'Acme Corp' } });
    expect(screen.getByText('Acme Site')).toBeTruthy();
  });
});

describe('AdminPortalWebsitesPage — create modal', () => {
  it('opens Add Website modal when button is clicked', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Website/ }));
    expect(screen.getByText('Add Website', { selector: 'h2' })).toBeTruthy();
  });

  it('closes modal via the close (X) button', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Website/ }));
    await waitFor(() => expect(screen.getByText('Add Website', { selector: 'h2' })).toBeTruthy());
    const closeBtn = Array.from(document.querySelectorAll('button')).find(b =>
      b.querySelector('.material-icons')?.textContent === 'close',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Add Website', { selector: 'h2' })).toBeNull();
  });

  it('closes modal via Cancel button', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Website/ }));
    await waitFor(() => expect(screen.getByText('Add Website', { selector: 'h2' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Add Website', { selector: 'h2' })).toBeNull();
  });

  it('shows error if client or name is missing on save', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Website/ }));
    await waitFor(() => expect(screen.getByText('Add Website', { selector: 'h2' })).toBeTruthy());
    // Submit without filling anything
    fireEvent.click(screen.getByRole('button', { name: 'Add Website', hidden: true }));
    await waitFor(() => expect(screen.getByText('Client and name are required.')).toBeTruthy());
  });

  it('populates clients in the select dropdown', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Website/ }));
    await waitFor(() => expect(screen.getByText('Add Website', { selector: 'h2' })).toBeTruthy());
    const sel = document.querySelector('select') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(sel.textContent).toContain('Acme Corp');
  });

  it('creates a new site successfully and adds it to the list', async () => {
    const newSite = { ...baseSite, id: 99, name: 'New Site', domain: '', description: '' };
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && init?.method === 'POST') {
        return jsonOk({ success: true, data: newSite });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Website/ }));
    await waitFor(() => expect(screen.getByText('Add Website', { selector: 'h2' })).toBeTruthy());
    // Select a client
    const sel = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '10' } });
    // Fill name
    const nameInput = screen.getByPlaceholderText('e.g. Acme Corp Main Site') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Site' } });
    // Save
    fireEvent.click(screen.getByRole('button', { name: 'Add Website', hidden: true }));
    await waitFor(() => expect(screen.queryByText('Add Website', { selector: 'h2' })).toBeNull());
    expect(screen.getByText('New Site')).toBeTruthy();
  });

  it('shows server error message when POST fails', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && init?.method === 'POST') {
        return jsonOk({ success: false, message: 'Name already taken' });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Website/ }));
    await waitFor(() => expect(screen.getByText('Add Website', { selector: 'h2' })).toBeTruthy());
    const sel = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '10' } });
    const nameInput = screen.getByPlaceholderText('e.g. Acme Corp Main Site') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dupe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Website', hidden: true }));
    await waitFor(() => expect(screen.getByText('Name already taken')).toBeTruthy());
  });
});

describe('AdminPortalWebsitesPage — edit modal', () => {
  it('opens edit modal with pre-populated values', async () => {
    await renderPage();
    // Click the Edit (pencil) button
    const editBtn = screen.getByTitle('Edit');
    fireEvent.click(editBtn);
    await waitFor(() => expect(screen.getByText('Edit Website')).toBeTruthy());
    const nameInput = screen.getByPlaceholderText('e.g. Acme Corp Main Site') as HTMLInputElement;
    expect(nameInput.value).toBe('Acme Site');
  });

  it('client select is disabled in edit mode', async () => {
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => expect(screen.getByText('Edit Website')).toBeTruthy());
    const sel = document.querySelector('select') as HTMLSelectElement;
    expect(sel.disabled).toBe(true);
  });

  it('saves edits and updates the site in the list', async () => {
    setFetchHandler((url, init) => {
      if (/^\/api\/admin\/portal\/websites\/\d+$/.test(url) && init?.method === 'PATCH') {
        return jsonOk({ success: true, data: { ...baseSite, name: 'Updated Site' } });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => expect(screen.getByText('Edit Website')).toBeTruthy());
    const nameInput = screen.getByPlaceholderText('e.g. Acme Corp Main Site') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Updated Site' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByText('Edit Website')).toBeNull());
    expect(screen.getByText('Updated Site')).toBeTruthy();
  });

  it('shows error when save fails', async () => {
    setFetchHandler((url, init) => {
      if (/^\/api\/admin\/portal\/websites\/\d+$/.test(url) && init?.method === 'PATCH') {
        return jsonOk({ success: false, message: 'Forbidden' });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => expect(screen.getByText('Edit Website')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeTruthy());
  });
});

describe('AdminPortalWebsitesPage — delete flow', () => {
  it('opens delete confirmation dialog when Delete button clicked', async () => {
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText('Delete website?')).toBeTruthy();
  });

  it('cancels deletion via Cancel button', async () => {
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('Delete website?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete website?')).toBeNull();
    // Site still present
    expect(screen.getByText('Acme Site')).toBeTruthy();
  });

  it('confirms deletion and removes the site from the list', async () => {
    let deleteCalled = false;
    setFetchHandler((url, init) => {
      if (/^\/api\/admin\/portal\/websites\/\d+$/.test(url) && init?.method === 'DELETE') {
        deleteCalled = true;
        return jsonOk({ success: true });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('Delete website?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleteCalled).toBe(true);
      expect(screen.queryByText('Acme Site')).toBeNull();
    });
  });
});

describe('AdminPortalWebsitesPage — toggle active', () => {
  it('toggles active status when badge button is clicked', async () => {
    let patched = false;
    setFetchHandler((url, init) => {
      if (/^\/api\/admin\/portal\/websites\/\d+$/.test(url) && init?.method === 'PATCH') {
        patched = true;
        return jsonOk({ success: true, data: { ...baseSite, active: false } });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    // Active badge button
    const activeBtn = screen.getByText('Active').closest('button') as HTMLButtonElement;
    fireEvent.click(activeBtn);
    await waitFor(() => expect(patched).toBe(true));
  });
});

describe('AdminPortalWebsitesPage — toggle BYOK', () => {
  it('enables BYOK without confirm when toggling ON', async () => {
    let patched = false;
    setFetchHandler((url, init) => {
      if (/^\/api\/admin\/portal\/websites\/\d+$/.test(url) && init?.method === 'PATCH') {
        patched = true;
        return jsonOk({
          success: true,
          data: {
            ...baseSite,
            storeSettings: { stripeByokAllowed: true, stripeMode: 'connect', stripeSecretKeyConfigured: false, hasStoreSettingsRow: true },
          },
        });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    // Confirm not needed when enabling
    fireEvent.click(checkbox);
    await waitFor(() => expect(patched).toBe(true));
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('shows confirm dialog when disabling BYOK and cancelling aborts the patch', async () => {
    confirmMock.mockReturnValue(false);
    setFetchHandler((url, init) => {
      if (url === '/api/admin/portal/websites' && !init?.method) {
        return jsonOk({
          success: true,
          data: [{
            ...baseSite,
            storeSettings: { stripeByokAllowed: true, stripeMode: 'connect', stripeSecretKeyConfigured: false, hasStoreSettingsRow: true },
          }],
        });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    // BYOK is allowed, so unchecking will disable — should prompt
    fireEvent.click(checkbox);
    await flush();
    expect(confirmMock).toHaveBeenCalled();
    // Patch should NOT have been called because confirm returned false
    const fetchMockFn = global.fetch as ReturnType<typeof vi.fn>;
    const patchCalls = fetchMockFn.mock.calls.filter(
      ([, init]) => init?.method === 'PATCH',
    );
    expect(patchCalls.length).toBe(0);
  });

  it('updates storeSettings when BYOK toggle PATCH succeeds', async () => {
    setFetchHandler((url, init) => {
      if (/^\/api\/admin\/portal\/websites\/\d+$/.test(url) && init?.method === 'PATCH') {
        return jsonOk({
          success: true,
          data: {
            storeSettings: { stripeByokAllowed: true, stripeMode: 'connect', stripeSecretKeyConfigured: false, hasStoreSettingsRow: true },
          },
        });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.getByText('BYOK Allowed')).toBeTruthy());
  });
});
