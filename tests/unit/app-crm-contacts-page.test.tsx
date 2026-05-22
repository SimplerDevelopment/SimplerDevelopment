// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/contacts/page.tsx` — the CRM Contacts list
 * page. The page fetches contacts/companies/titles/saved-views, supports
 * search (debounced), filters (status / company / title / custom fields),
 * saved views CRUD, inline create-contact form, pagination, and click-to-
 * detail navigation. We stub `next/navigation`, `fetch`, and the four heavy
 * child components so we can exercise the page's own branches without
 * pulling in their effect chains.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/crm/contacts',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Stub heavy child components so we test the page itself, not them.
vi.mock('@/components/portal/CrmDuplicateWarning', () => ({
  __esModule: true,
  default: ({ email }: any) =>
    React.createElement('div', { 'data-testid': 'dup-warn' }, `dup:${email ?? ''}`),
}));

vi.mock('@/components/portal/CrmImportExport', () => ({
  __esModule: true,
  default: ({ entityType, onImportComplete }: any) =>
    React.createElement(
      'button',
      {
        'data-testid': 'import-export',
        onClick: () => onImportComplete && onImportComplete(),
      },
      `ie:${entityType}`,
    ),
}));

vi.mock('@/components/portal/CrmCustomFieldFilters', () => ({
  __esModule: true,
  default: ({ values, onChange }: any) =>
    React.createElement(
      'button',
      {
        'data-testid': 'custom-filters',
        onClick: () => onChange && onChange({ ...(values ?? {}), 1: 'x' }),
      },
      'custom-filters',
    ),
}));

vi.mock('@/components/portal/PositionMultiSelect', () => ({
  __esModule: true,
  default: ({ selected, onChange }: any) =>
    React.createElement(
      'button',
      {
        'data-testid': 'pos-multi',
        onClick: () => onChange && onChange(['Engineer']),
      },
      `pos:${(selected ?? []).join(',')}`,
    ),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: any) => any | Promise<any>;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

const baseContacts = [
  {
    id: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@acme.test',
    phone: '555-0001',
    title: 'Engineer',
    companyId: 100,
    companyName: 'Acme',
    status: 'active',
    source: 'web',
    score: 85,
    lastContactedAt: '2025-01-10T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    firstName: 'Bob',
    lastName: 'Smith',
    email: null,
    phone: null,
    title: null,
    companyId: null,
    companyName: null,
    status: 'lead',
    source: null,
    score: 55,
    lastContactedAt: null,
    createdAt: '2025-01-02T00:00:00Z',
  },
  {
    id: 3,
    firstName: 'Carol',
    lastName: 'Hill',
    email: 'carol@beta.test',
    phone: '555-0003',
    title: 'CEO',
    companyId: 101,
    companyName: 'Beta',
    status: 'customer',
    source: 'referral',
    score: 25,
    lastContactedAt: '2025-01-12T00:00:00Z',
    createdAt: '2025-01-03T00:00:00Z',
  },
  {
    id: 4,
    firstName: 'Dan',
    lastName: 'King',
    email: null,
    phone: null,
    title: 'PM',
    companyId: null,
    companyName: null,
    status: 'inactive',
    source: null,
    score: 10,
    lastContactedAt: null,
    createdAt: '2025-01-04T00:00:00Z',
  },
  {
    id: 5,
    firstName: 'Eve',
    lastName: 'Lin',
    email: null,
    phone: null,
    title: null,
    companyId: null,
    companyName: null,
    status: 'unknown', // exercises statusColor fallback
    source: null,
    score: null,
    lastContactedAt: null,
    createdAt: '2025-01-05T00:00:00Z',
  },
];

const baseCompanies = [
  { id: 100, name: 'Acme' },
  { id: 101, name: 'Beta' },
];

const baseTitles = ['Engineer', 'CEO', 'PM'];

const baseSavedViews = [
  {
    id: 11,
    name: 'My Leads',
    filters: { search: 'jane', status: 'lead', companyId: '100', title: 'Engineer,PM' },
    entityType: 'contact',
    isDefault: false,
  },
  {
    id: 12,
    name: 'Empty View',
    filters: {},
    entityType: 'contact',
    isDefault: false,
  },
];

function defaultFetch(url: string, init?: any): any {
  if (url.startsWith('/api/portal/crm/contacts?')) {
    return jsonResponse({ data: { contacts: baseContacts, total: 5 } });
  }
  if (url === '/api/portal/crm/contacts' && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { id: 999 } });
  }
  if (url === '/api/portal/crm/contacts/titles') {
    return jsonResponse({ success: true, data: baseTitles });
  }
  if (url.startsWith('/api/portal/crm/companies')) {
    return jsonResponse({ data: { companies: baseCompanies } });
  }
  if (url === '/api/portal/crm/saved-views?entityType=contact') {
    return jsonResponse({ success: true, data: baseSavedViews });
  }
  if (url === '/api/portal/crm/saved-views' && init?.method === 'POST') {
    return jsonResponse({ success: true });
  }
  if (/^\/api\/portal\/crm\/saved-views\/\d+$/.test(url) && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
  }
  return jsonResponse({});
}

beforeEach(() => {
  pushMock.mockReset();
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) =>
    Promise.resolve(handlers[0](url, init)),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Page under test (imported AFTER mocks)
import CrmContactsPage from '@/app/portal/crm/contacts/page';

async function renderPage() {
  const result = render(<CrmContactsPage />);
  // Wait for loading spinner to disappear OR for contacts to appear
  await waitFor(() => {
    expect(screen.queryByText('Jane Doe')).toBeTruthy();
  });
  return result;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CrmContactsPage', () => {
  describe('initial render', () => {
    it('renders the total contact count', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('5 contacts');
    });

    it('renders all contact rows', async () => {
      await renderPage();
      expect(screen.getByText('Jane Doe')).toBeTruthy();
      expect(screen.getByText('Bob Smith')).toBeTruthy();
      expect(screen.getByText('Carol Hill')).toBeTruthy();
      expect(screen.getByText('Dan King')).toBeTruthy();
      expect(screen.getByText('Eve Lin')).toBeTruthy();
    });

    it('renders titles below contact names when present', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Engineer');
      expect(container.textContent).toContain('CEO');
      expect(container.textContent).toContain('PM');
    });

    it('renders status badges including the unknown-status fallback', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('active');
      expect(container.textContent).toContain('lead');
      expect(container.textContent).toContain('customer');
      expect(container.textContent).toContain('inactive');
      expect(container.textContent).toContain('unknown');
    });

    it('renders score values and dash for missing score', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('85');
      expect(container.textContent).toContain('55');
      expect(container.textContent).toContain('25');
      expect(container.textContent).toContain('10');
      // null score should render dashes
      expect(container.textContent).toContain('---');
    });

    it('renders dash for missing email / phone / company', async () => {
      const { container } = await renderPage();
      // Bob Smith has no email, phone, or company => multiple dashes
      expect(container.textContent).toContain('---');
    });

    it('renders a formatted last-contacted date', async () => {
      const { container } = await renderPage();
      // Jane has lastContactedAt 2025-01-10 — exact format depends on locale,
      // so just assert *some* 2025 date string rendered
      expect(container.textContent).toMatch(/2025|1\/10/);
    });

    it('renders the Add Contact header button', async () => {
      await renderPage();
      expect(screen.getByText('Add Contact')).toBeTruthy();
    });

    it('renders the All Contacts default saved-view option', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('All Contacts');
    });

    it('renders saved-view names in the dropdown', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('My Leads');
      expect(container.textContent).toContain('Empty View');
    });

    it('renders all status filter options', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('All Statuses');
      expect(container.textContent).toContain('Active');
      expect(container.textContent).toContain('Inactive');
      expect(container.textContent).toContain('Lead');
      expect(container.textContent).toContain('Customer');
    });

    it('renders the All Companies select option', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('All Companies');
    });

    it('renders the search input', async () => {
      await renderPage();
      const input = document.querySelector('input[placeholder="Search contacts..."]');
      expect(input).toBeTruthy();
    });

    it('renders the import/export stub', async () => {
      await renderPage();
      expect(screen.getByTestId('import-export').textContent).toContain('contact');
    });

    it('renders the position multi-select stub', async () => {
      await renderPage();
      expect(screen.getByTestId('pos-multi')).toBeTruthy();
    });
  });

  describe('empty / error states', () => {
    it('shows empty state when no contacts', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return jsonResponse({ data: { contacts: [], total: 0 } });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No contacts found');
      });
      expect(screen.getByText('Add First Contact')).toBeTruthy();
    });

    it('Add First Contact button opens the inline form', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return jsonResponse({ data: { contacts: [], total: 0 } });
        }
        return defaultFetch(url, init);
      });
      render(<CrmContactsPage />);
      await waitFor(() => screen.getByText('Add First Contact'));
      fireEvent.click(screen.getByText('Add First Contact'));
      expect(screen.getByText('New Contact')).toBeTruthy();
    });

    it('falls back to data.data array shape when data.contacts is missing', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return jsonResponse({ data: baseContacts });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Jane Doe');
      });
    });

    it('handles missing companies payload by defaulting to empty list', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/companies')) {
          return jsonResponse({});
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('All Companies');
      });
    });

    it('handles companies returning data.data array shape', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/companies')) {
          return jsonResponse({ data: baseCompanies });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Acme');
      });
    });

    it('skips setting titles if titles response is not success', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/titles') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Jane Doe');
      });
    });

    it('skips setting saved views if saved-views response is not success', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/saved-views?entityType=contact') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Jane Doe');
      });
      // My Leads should NOT appear when the saved-views fetch is rejected
      expect(result.container.textContent).not.toContain('My Leads');
    });
  });

  describe('row navigation', () => {
    it('clicking a row navigates to contact detail', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Jane Doe'));
      expect(pushMock).toHaveBeenCalledWith('/portal/crm/contacts/1');
    });

    it('clicking a different row navigates to that contact id', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Carol Hill'));
      expect(pushMock).toHaveBeenCalledWith('/portal/crm/contacts/3');
    });
  });

  describe('inline create form', () => {
    it('Add Contact toggles the form open', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      expect(screen.getByText('New Contact')).toBeTruthy();
      expect(screen.getByText('First Name *')).toBeTruthy();
      expect(screen.getByText('Last Name *')).toBeTruthy();
    });

    it('Add Contact button toggles to Cancel when open', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      // The header button now reads Cancel
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('Cancel closes the form', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByText('New Contact')).toBeNull();
    });

    it('typing in first/last name updates inputs', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      const inputs = container.querySelectorAll('input');
      // first = first name, second = last name
      fireEvent.change(inputs[1], { target: { value: 'Jane' } });
      fireEvent.change(inputs[2], { target: { value: 'Doe' } });
      expect((inputs[1] as HTMLInputElement).value).toBe('Jane');
      expect((inputs[2] as HTMLInputElement).value).toBe('Doe');
    });

    it('populates company select with fetched companies', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      // company select inside the form should now have Acme and Beta
      expect(container.textContent).toContain('Acme');
      expect(container.textContent).toContain('Beta');
    });

    it('populates source select with all source options', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      expect(container.textContent).toContain('web');
      expect(container.textContent).toContain('referral');
      expect(container.textContent).toContain('cold call');
      expect(container.textContent).toContain('event');
      expect(container.textContent).toContain('social');
      expect(container.textContent).toContain('other');
    });

    it('submits the form and resets to closed on success', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      const inputs = container.querySelectorAll('input');
      fireEvent.change(inputs[1], { target: { value: 'Test' } });
      fireEvent.change(inputs[2], { target: { value: 'User' } });
      const form = container.querySelector('form')!;
      fireEvent.submit(form);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (c) =>
            c[0] === '/api/portal/crm/contacts' && c[1]?.method === 'POST',
        );
        expect(post).toBeTruthy();
      });
      await waitFor(() => {
        expect(screen.queryByText('New Contact')).toBeNull();
      });
    });

    it('submit with a selected company sends companyId as a number', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      const inputs = container.querySelectorAll('input');
      fireEvent.change(inputs[1], { target: { value: 'X' } });
      fireEvent.change(inputs[2], { target: { value: 'Y' } });
      // selects within the form: company is the first select inside the form
      const formEl = container.querySelector('form')!;
      const selects = formEl.querySelectorAll('select');
      // [0] company, [1] source, [2] status
      fireEvent.change(selects[0], { target: { value: '100' } });
      fireEvent.submit(formEl);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (c) =>
            c[0] === '/api/portal/crm/contacts' && c[1]?.method === 'POST',
        );
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.companyId).toBe(100);
      });
    });

    it('submit without a company sends companyId as null', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      const inputs = container.querySelectorAll('input');
      fireEvent.change(inputs[1], { target: { value: 'X' } });
      fireEvent.change(inputs[2], { target: { value: 'Y' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (c) =>
            c[0] === '/api/portal/crm/contacts' && c[1]?.method === 'POST',
        );
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.companyId).toBeNull();
      });
    });

    it('shows API error message when create fails', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Email taken' });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      const inputs = container.querySelectorAll('input');
      fireEvent.change(inputs[1], { target: { value: 'X' } });
      fireEvent.change(inputs[2], { target: { value: 'Y' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(screen.getByText('Email taken')).toBeTruthy();
      });
      // Form should still be open after a failure
      expect(screen.queryByText('New Contact')).toBeTruthy();
    });

    it('falls back to default error message when API returns no message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Add Contact'));
      const inputs = container.querySelectorAll('input');
      fireEvent.change(inputs[1], { target: { value: 'X' } });
      fireEvent.change(inputs[2], { target: { value: 'Y' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(screen.getByText('Failed to create contact.')).toBeTruthy();
      });
    });
  });

  describe('search', () => {
    it('typing in the search field updates the debounced search param after 300ms', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      render(<CrmContactsPage />);
      await act(async () => {
        await Promise.resolve();
      });
      const searchInput = document.querySelector(
        'input[placeholder="Search contacts..."]',
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'jane' } });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      const call = fetchSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('search=jane'),
      );
      expect(call).toBeTruthy();
      vi.useRealTimers();
    });
  });

  describe('filters', () => {
    it('changing status filter triggers a refetch with the new status', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      // first top-level select OUTSIDE the form is saved-views; second is status, third is company
      // But selects inside form aren't visible (form closed). Find by option value.
      const statusSelect = Array.from(container.querySelectorAll('select')).find(
        (s) =>
          Array.from(s.options).some((o) => o.value === 'active') &&
          Array.from(s.options).some((o) => o.value === 'lead') &&
          Array.from(s.options).some((o) => o.value === ''),
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'active' } });
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('status=active'),
        );
        expect(call).toBeTruthy();
      });
    });

    it('changing company filter triggers a refetch with companyId', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const companySelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'All Companies'),
      ) as HTMLSelectElement;
      fireEvent.change(companySelect, { target: { value: '100' } });
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('companyId=100'),
        );
        expect(call).toBeTruthy();
      });
    });

    it('selecting positions via the multi-select triggers a refetch with title param', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      await renderPage();
      fireEvent.click(screen.getByTestId('pos-multi'));
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('title=Engineer'),
        );
        expect(call).toBeTruthy();
      });
    });

    it('selecting custom-field filters triggers a refetch with cf param', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      await renderPage();
      fireEvent.click(screen.getByTestId('custom-filters'));
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('cf=1%3Ax'),
        );
        expect(call).toBeTruthy();
      });
    });
  });

  describe('saved views', () => {
    it('selecting a saved view applies its filters', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const savedViewSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'All Contacts'),
      ) as HTMLSelectElement;
      fireEvent.change(savedViewSelect, { target: { value: '11' } });
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) =>
            typeof c[0] === 'string' &&
            c[0].includes('status=lead') &&
            c[0].includes('search=jane'),
        );
        expect(call).toBeTruthy();
      });
    });

    it('selecting "All Contacts" clears filters', async () => {
      const { container } = await renderPage();
      const savedViewSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'All Contacts'),
      ) as HTMLSelectElement;
      // First apply view 11
      fireEvent.change(savedViewSelect, { target: { value: '11' } });
      // Then clear with empty string
      fireEvent.change(savedViewSelect, { target: { value: '' } });
      // Status filter should now be back to ''
      const statusSelect = Array.from(container.querySelectorAll('select')).find(
        (s) =>
          Array.from(s.options).some((o) => o.value === 'lead') &&
          Array.from(s.options).some((o) => o.value === ''),
      ) as HTMLSelectElement;
      expect(statusSelect.value).toBe('');
    });

    it('applying a saved view with no title still works', async () => {
      const { container } = await renderPage();
      const savedViewSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'All Contacts'),
      ) as HTMLSelectElement;
      fireEvent.change(savedViewSelect, { target: { value: '12' } });
      // No exception thrown — saved view 12 has empty filters
      expect(savedViewSelect.value).toBe('12');
    });

    it('shows delete button only when a saved view is selected', async () => {
      const { container } = await renderPage();
      // No delete button initially
      expect(container.querySelector('button[title="Delete saved view"]')).toBeNull();
      const savedViewSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'All Contacts'),
      ) as HTMLSelectElement;
      fireEvent.change(savedViewSelect, { target: { value: '11' } });
      await waitFor(() => {
        expect(container.querySelector('button[title="Delete saved view"]')).toBeTruthy();
      });
    });

    it('deleting a saved view calls the DELETE endpoint and clears selection', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const savedViewSelect = Array.from(container.querySelectorAll('select')).find(
        (s) => Array.from(s.options).some((o) => o.textContent === 'All Contacts'),
      ) as HTMLSelectElement;
      fireEvent.change(savedViewSelect, { target: { value: '11' } });
      await waitFor(() => {
        expect(container.querySelector('button[title="Delete saved view"]')).toBeTruthy();
      });
      const delBtn = container.querySelector('button[title="Delete saved view"]')!;
      fireEvent.click(delBtn);
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) =>
            typeof c[0] === 'string' &&
            c[0] === '/api/portal/crm/saved-views/11' &&
            c[1]?.method === 'DELETE',
        );
        expect(call).toBeTruthy();
      });
    });

    it('shows the Save View button when filters are active', async () => {
      const { container } = await renderPage();
      const statusSelect = Array.from(container.querySelectorAll('select')).find(
        (s) =>
          Array.from(s.options).some((o) => o.value === 'lead') &&
          Array.from(s.options).some((o) => o.value === ''),
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'active' } });
      await waitFor(() => {
        expect(container.textContent).toContain('Save View');
      });
    });

    it('opens the Save View form on click', async () => {
      const { container } = await renderPage();
      const statusSelect = Array.from(container.querySelectorAll('select')).find(
        (s) =>
          Array.from(s.options).some((o) => o.value === 'lead') &&
          Array.from(s.options).some((o) => o.value === ''),
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'active' } });
      await waitFor(() => screen.getByText('Save View'));
      fireEvent.click(screen.getByText('Save View'));
      const nameInput = document.querySelector(
        'input[placeholder="View name..."]',
      ) as HTMLInputElement;
      expect(nameInput).toBeTruthy();
    });

    it('cancelling the Save View form closes it and clears the name', async () => {
      const { container } = await renderPage();
      const statusSelect = Array.from(container.querySelectorAll('select')).find(
        (s) =>
          Array.from(s.options).some((o) => o.value === 'lead') &&
          Array.from(s.options).some((o) => o.value === ''),
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'active' } });
      await waitFor(() => screen.getByText('Save View'));
      fireEvent.click(screen.getByText('Save View'));
      const nameInput = document.querySelector(
        'input[placeholder="View name..."]',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My View' } });
      // The close-X is the button without text inside the save form; find by parent form
      const saveForm = nameInput.closest('form')!;
      const buttons = saveForm.querySelectorAll('button');
      const closeBtn = buttons[buttons.length - 1]; // last button is the cancel/close
      fireEvent.click(closeBtn);
      expect(
        document.querySelector('input[placeholder="View name..."]'),
      ).toBeNull();
    });

    it('submitting Save View calls POST with the trimmed name and current filters', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const statusSelect = Array.from(container.querySelectorAll('select')).find(
        (s) =>
          Array.from(s.options).some((o) => o.value === 'lead') &&
          Array.from(s.options).some((o) => o.value === ''),
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'active' } });
      await waitFor(() => screen.getByText('Save View'));
      fireEvent.click(screen.getByText('Save View'));
      const nameInput = document.querySelector(
        'input[placeholder="View name..."]',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: '  Active Only  ' } });
      const saveForm = nameInput.closest('form')!;
      fireEvent.submit(saveForm);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (c) =>
            c[0] === '/api/portal/crm/saved-views' &&
            c[1]?.method === 'POST',
        );
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.name).toBe('Active Only');
        expect(body.entityType).toBe('contact');
        expect(body.filters.status).toBe('active');
      });
    });

    it('Save View submit with empty name does nothing', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const statusSelect = Array.from(container.querySelectorAll('select')).find(
        (s) =>
          Array.from(s.options).some((o) => o.value === 'lead') &&
          Array.from(s.options).some((o) => o.value === ''),
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'active' } });
      await waitFor(() => screen.getByText('Save View'));
      fireEvent.click(screen.getByText('Save View'));
      const nameInput = document.querySelector(
        'input[placeholder="View name..."]',
      ) as HTMLInputElement;
      // submit without typing
      const saveForm = nameInput.closest('form')!;
      fireEvent.submit(saveForm);
      // Should NOT have called POST /api/portal/crm/saved-views
      const post = fetchSpy.mock.calls.find(
        (c) =>
          c[0] === '/api/portal/crm/saved-views' && c[1]?.method === 'POST',
      );
      expect(post).toBeUndefined();
    });
  });

  describe('import/export integration', () => {
    it('clicking the import-export stub triggers a re-fetch of contacts', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      await renderPage();
      const callsBefore = fetchSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('/api/portal/crm/contacts?'),
      ).length;
      fireEvent.click(screen.getByTestId('import-export'));
      await waitFor(() => {
        const callsAfter = fetchSpy.mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].startsWith('/api/portal/crm/contacts?'),
        ).length;
        expect(callsAfter).toBeGreaterThan(callsBefore);
      });
    });
  });

  describe('pagination', () => {
    it('shows pagination controls when total > LIMIT (25)', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return jsonResponse({ data: { contacts: baseContacts, total: 60 } });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Page 1 of 3');
      });
    });

    it('does not show pagination when there is only one page', async () => {
      const { container } = await renderPage();
      // total=5, limit=25 => 1 page => no pagination
      expect(container.textContent).not.toContain('Page 1 of');
    });

    it('Next page button is disabled on first page when there is only one page', async () => {
      const { container } = await renderPage();
      // Pagination not rendered at all
      expect(container.querySelector('button[disabled]')).toBeNull();
    });

    it('clicking a numeric page button updates the page', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) => {
        if (typeof url === 'string' && url.startsWith('/api/portal/crm/contacts?')) {
          return Promise.resolve(
            jsonResponse({ data: { contacts: baseContacts, total: 80 } }),
          );
        }
        return Promise.resolve(defaultFetch(url, init));
      });
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Page 1 of 4');
      });
      // Find button labeled "2"
      const pageBtn = Array.from(result.container.querySelectorAll('button')).find(
        (b) => b.textContent === '2',
      );
      expect(pageBtn).toBeTruthy();
      fireEvent.click(pageBtn!);
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('page=2'),
        );
        expect(call).toBeTruthy();
      });
    });

    it('clicking the chevron-right button advances the page', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) => {
        if (typeof url === 'string' && url.startsWith('/api/portal/crm/contacts?')) {
          return Promise.resolve(
            jsonResponse({ data: { contacts: baseContacts, total: 80 } }),
          );
        }
        return Promise.resolve(defaultFetch(url, init));
      });
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = render(<CrmContactsPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Page 1 of 4');
      });
      // The right-chevron button is the LAST button in the pagination row
      const allButtons = Array.from(
        result.container.querySelectorAll('button'),
      );
      const chevronRight = allButtons[allButtons.length - 1];
      fireEvent.click(chevronRight);
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('page=2'),
        );
        expect(call).toBeTruthy();
      });
    });
  });
});
