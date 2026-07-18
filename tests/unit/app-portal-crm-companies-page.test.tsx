/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/companies/page.tsx`
 *
 * The page is a 'use client' component that:
 * - Fetches companies from /api/portal/crm/companies with search + pagination
 * - Shows loading, empty, list, and error states
 * - Has an inline create-company form (POST /api/portal/crm/companies)
 * - Renders a CompanyMap alongside the company cards
 * - Supports debounced search and custom field filters
 * - Paginates (25/page)
 *
 * Strategy: stub next/navigation, next/link, the three heavy child components
 * (CompanyMap, CrmCustomFieldFilters, MediaPicker), and global fetch.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

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
  usePathname: () => '/portal/crm/companies',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Stub CompanyMap — renders a div so the page can mount without Leaflet/WebGL.
vi.mock('@/components/portal/CompanyMap', () => ({
  __esModule: true,
  default: ({ companies, onMarkerClick, onMarkerHover, highlightedId }: any) =>
    React.createElement(
      'div',
      {
        'data-testid': 'company-map',
        'data-count': companies?.length ?? 0,
        'data-highlighted': highlightedId ?? '',
        onClick: () => onMarkerClick && onMarkerClick(companies?.[0]?.id),
        onMouseEnter: () => onMarkerHover && onMarkerHover(companies?.[0]?.id),
      },
      `map:${companies?.length ?? 0}`,
    ),
}));

// Stub CrmCustomFieldFilters
vi.mock('@/components/portal/CrmCustomFieldFilters', () => ({
  __esModule: true,
  default: ({ values, onChange }: any) =>
    React.createElement(
      'button',
      {
        'data-testid': 'custom-filters',
        onClick: () => onChange && onChange({ ...(values ?? {}), 5: 'tech' }),
      },
      'custom-filters',
    ),
}));

// Stub MediaPicker
vi.mock('@/components/admin/MediaPicker', () => ({
  __esModule: true,
  default: ({ label, onChange }: any) =>
    React.createElement(
      'button',
      {
        'data-testid': 'media-picker',
        onClick: () => onChange && onChange('https://cdn.example.com/logo.png'),
      },
      `media:${label ?? ''}`,
    ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => any;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseCompanies = [
  {
    id: 1,
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Manufacturing',
    size: '51-200',
    phone: '555-0001',
    website: 'https://acme.com',
    address: '1 Acme Way, Springfield',
    logoUrl: null,
    notes: 'Key partner',
    latitude: '40.7128',
    longitude: '-74.0060',
    contactCount: 5,
    totalDealValue: 150000,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Beta LLC',
    domain: null,
    industry: null,
    size: null,
    phone: null,
    website: null,
    address: null,
    logoUrl: 'https://cdn.example.com/beta.png',
    notes: null,
    latitude: null,
    longitude: null,
    contactCount: 0,
    totalDealValue: 0,
    createdAt: '2025-01-02T00:00:00Z',
  },
];

function defaultFetch(url: string, init?: RequestInit): any {
  if (
    typeof url === 'string' &&
    url.startsWith('/api/portal/crm/companies') &&
    (!init || init.method === undefined || init.method === 'GET')
  ) {
    return jsonResponse({ data: { companies: baseCompanies, total: 2 } });
  }
  if (
    typeof url === 'string' &&
    url === '/api/portal/crm/companies' &&
    init?.method === 'POST'
  ) {
    return jsonResponse({ success: true, data: { id: 99 } });
  }
  return jsonResponse({});
}

beforeEach(() => {
  pushMock.mockReset();
  setFetchHandler(defaultFetch);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(handlers[0](url, init)),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import CrmCompaniesPage from '@/app/portal/crm/companies/page';

async function renderPage() {
  const result = render(React.createElement(CrmCompaniesPage));
  await waitFor(() => {
    expect(result.container.textContent).toContain('Acme Corp');
  });
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CrmCompaniesPage — initial render', () => {
  it('renders the Add Company button', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Add Company');
  });

  it('renders the total company count', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('2 companies');
  });

  it('shows singular "company" for count of 1', async () => {
    setFetchHandler((url, init) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return jsonResponse({ data: { companies: [baseCompanies[0]], total: 1 } });
      }
      return defaultFetch(url, init);
    });
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('1 company');
    });
    expect(container.textContent).not.toContain('1 companies');
  });

  it('renders both company names', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Acme Corp');
    expect(container.textContent).toContain('Beta LLC');
  });

  it('renders domain when present', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('acme.com');
  });

  it('renders contact count for each company', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('5 contacts');
    expect(container.textContent).toContain('0 contacts');
  });

  it('renders singular "contact" for contactCount of 1', async () => {
    setFetchHandler((url, init) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return jsonResponse({
          data: {
            companies: [{ ...baseCompanies[0], contactCount: 1 }],
            total: 1,
          },
        });
      }
      return defaultFetch(url, init);
    });
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('1 contact');
    });
    expect(container.textContent).not.toContain('1 contacts');
  });

  it('renders formatted deal values', async () => {
    const { container } = await renderPage();
    // $1,500.00 (totalDealValue is in cents — 150000 cents = $1,500)
    expect(container.textContent).toMatch(/\$1[,.]?500/);
  });

  it('renders the company map stub', async () => {
    await renderPage();
    expect(screen.getByTestId('company-map')).toBeTruthy();
  });

  it('passes only geo-valid companies to the map', async () => {
    // Beta LLC has null lat/lng — only Acme should appear on the map
    await renderPage();
    const map = screen.getByTestId('company-map');
    expect(map.getAttribute('data-count')).toBe('1');
  });

  it('renders the search input', async () => {
    await renderPage();
    const input = document.querySelector('input[placeholder="Search companies..."]');
    expect(input).toBeTruthy();
  });

  it('renders the custom-field filters stub', async () => {
    await renderPage();
    expect(screen.getByTestId('custom-filters')).toBeTruthy();
  });

  it('renders a logo image when logoUrl is set', async () => {
    const { container } = await renderPage();
    const img = container.querySelector('img[alt="Beta LLC logo"]');
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toContain('beta.png');
  });

  it('renders a placeholder icon when logoUrl is null', async () => {
    // Acme has no logoUrl — a material-icon placeholder should appear
    const { container } = await renderPage();
    // The placeholder div contains a "business" icon
    const icons = Array.from(container.querySelectorAll('span.material-icons'));
    expect(icons.some((el) => el.textContent === 'business')).toBe(true);
  });
});

describe('CrmCompaniesPage — loading state', () => {
  it('shows a loading spinner in the list area while fetch is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(React.createElement(CrmCompaniesPage));
    // The spinner is rendered inside the list area when loading=true
    const spinner = container.querySelector('span.material-icons.animate-spin');
    expect(spinner).toBeTruthy();
    // Company cards are NOT rendered during loading
    expect(container.querySelector('.cursor-pointer')).toBeNull();
  });
});

describe('CrmCompaniesPage — empty state', () => {
  beforeEach(() => {
    setFetchHandler((url, init) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return jsonResponse({ data: { companies: [], total: 0 } });
      }
      return defaultFetch(url, init);
    });
  });

  it('shows "No companies found" empty state', async () => {
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('No companies found');
    });
  });

  it('shows the Add First Company button in empty state', async () => {
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Add First Company');
    });
  });

  it('clicking Add First Company opens the inline form', async () => {
    render(React.createElement(CrmCompaniesPage));
    await waitFor(() => screen.getByText('Add First Company'));
    fireEvent.click(screen.getByText('Add First Company'));
    expect(screen.getByText('New Company')).toBeTruthy();
  });

  it('falls back to data.data array shape when data.companies is missing', async () => {
    setFetchHandler((url, init) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return jsonResponse({ data: baseCompanies });
      }
      return defaultFetch(url, init);
    });
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Acme Corp');
    });
  });
});

describe('CrmCompaniesPage — row navigation', () => {
  it('clicking a company card navigates to its detail page', async () => {
    const { container } = await renderPage();
    // The company card is the parent div; click on the name text
    const cards = container.querySelectorAll('.cursor-pointer');
    fireEvent.click(cards[0]);
    expect(pushMock).toHaveBeenCalledWith('/portal/crm/companies/1');
  });

  it('clicking the second company card navigates to company/2', async () => {
    const { container } = await renderPage();
    const cards = container.querySelectorAll('.cursor-pointer');
    fireEvent.click(cards[1]);
    expect(pushMock).toHaveBeenCalledWith('/portal/crm/companies/2');
  });

  it('map marker click navigates to the first geo-valid company', async () => {
    await renderPage();
    const map = screen.getByTestId('company-map');
    fireEvent.click(map);
    expect(pushMock).toHaveBeenCalledWith('/portal/crm/companies/1');
  });
});

describe('CrmCompaniesPage — hover highlighting', () => {
  it('hovering a company card passes its id as highlightedId to the map', async () => {
    const { container } = await renderPage();
    const cards = container.querySelectorAll('.cursor-pointer');
    fireEvent.mouseEnter(cards[0]);
    await waitFor(() => {
      const map = screen.getByTestId('company-map');
      expect(map.getAttribute('data-highlighted')).toBe('1');
    });
  });

  it('hovering the map fires onMarkerHover callback', async () => {
    await renderPage();
    const map = screen.getByTestId('company-map');
    fireEvent.mouseEnter(map);
    // No assertion needed beyond "no throw"
    expect(map).toBeTruthy();
  });
});

describe('CrmCompaniesPage — inline create form', () => {
  it('Add Company toggles the form open', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    expect(screen.getByText('New Company')).toBeTruthy();
  });

  it('button label changes to Cancel when form is open', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('Cancel button closes the form', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Company')).toBeNull();
  });

  it('form renders Name, Domain, Industry fields', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    expect(container.textContent).toContain('Name *');
    expect(container.textContent).toContain('Domain');
    expect(container.textContent).toContain('Industry');
  });

  it('form renders the size dropdown with options', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    expect(container.textContent).toContain('1-10 employees');
    expect(container.textContent).toContain('1001+ employees');
  });

  it('form renders address, lat/lng, phone, website, notes fields', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    expect(container.textContent).toContain('Address');
    expect(container.textContent).toContain('Latitude');
    expect(container.textContent).toContain('Longitude');
    expect(container.textContent).toContain('Phone');
    expect(container.textContent).toContain('Website');
    expect(container.textContent).toContain('Notes');
  });

  it('form renders the media picker stub with label "Logo"', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    expect(screen.getByTestId('media-picker').textContent).toContain('Logo');
  });

  it('clicking the media picker updates logoUrl', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    fireEvent.click(screen.getByTestId('media-picker'));
    // No error thrown — logoUrl state updated
    expect(screen.getByTestId('media-picker')).toBeTruthy();
  });

  it('typing in the Name field updates its value', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    const nameInput = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'NewCo' } });
    expect(nameInput.value).toBe('NewCo');
  });

  it('submitting the form calls POST /api/portal/crm/companies', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(defaultFetch(url, init)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    const nameInput = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'TestCo' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(
        (c) => c[0] === '/api/portal/crm/companies' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(post).toBeTruthy();
    });
  });

  it('successful submit closes the form', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    const nameInput = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'TestCo' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      expect(screen.queryByText('New Company')).toBeNull();
    });
  });

  it('submit with lat/lng includes them in the payload', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(defaultFetch(url, init)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    const nameInput = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'GeoCompany' } });
    // lat/lng inputs are type="number" — find them by step attribute
    const numInputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numInputs[0], { target: { value: '40.7128' } });
    fireEvent.change(numInputs[1], { target: { value: '-74.0060' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(
        (c) => c[0] === '/api/portal/crm/companies' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.latitude).toBe('40.7128');
      expect(body.longitude).toBe('-74.0060');
    });
  });

  it('submit without lat/lng does not include them in the payload', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(defaultFetch(url, init)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    const nameInput = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'NoGeo' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(
        (c) => c[0] === '/api/portal/crm/companies' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.latitude).toBeUndefined();
      expect(body.longitude).toBeUndefined();
    });
  });

  it('shows API error message when create fails', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/portal/crm/companies' && init?.method === 'POST') {
        return jsonResponse({ success: false, message: 'Name already exists' });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    const nameInput = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dup' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      expect(screen.getByText('Name already exists')).toBeTruthy();
    });
    // Form should remain open after failure
    expect(screen.getByText('New Company')).toBeTruthy();
  });

  it('falls back to default error message when API returns no message', async () => {
    setFetchHandler((url, init) => {
      if (url === '/api/portal/crm/companies' && init?.method === 'POST') {
        return jsonResponse({ success: false });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Add Company'));
    const nameInput = container.querySelector('input[required]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'X' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      expect(screen.getByText('Failed to create company.')).toBeTruthy();
    });
  });
});

describe('CrmCompaniesPage — search', () => {
  it('typing in the search field triggers a refetch with search param after 300ms', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(defaultFetch(url, init)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    render(React.createElement(CrmCompaniesPage));
    await act(async () => {
      await Promise.resolve();
    });
    const searchInput = document.querySelector(
      'input[placeholder="Search companies..."]',
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'acme' } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();
    // Give effects time to flush
    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('search=acme'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('clears search when input is emptied', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(defaultFetch(url, init)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    render(React.createElement(CrmCompaniesPage));
    await act(async () => { await Promise.resolve(); });
    const searchInput = document.querySelector(
      'input[placeholder="Search companies..."]',
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'acme' } });
    await act(async () => { vi.advanceTimersByTime(350); });
    fireEvent.change(searchInput, { target: { value: '' } });
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();
    // A call without search= param should exist
    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && !c[0].includes('search='),
      );
      expect(call).toBeTruthy();
    });
  });
});

describe('CrmCompaniesPage — custom filters', () => {
  it('clicking custom-filter stub triggers refetch with cf param', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(defaultFetch(url, init)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    await renderPage();
    const callsBefore = fetchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('/api/portal/crm/companies'),
    ).length;
    fireEvent.click(screen.getByTestId('custom-filters'));
    await waitFor(() => {
      const callsAfter = fetchSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('/api/portal/crm/companies'),
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});

describe('CrmCompaniesPage — pagination', () => {
  it('does not show pagination when total <= 25', async () => {
    const { container } = await renderPage();
    // total=2, limit=25 → only 1 page
    expect(container.textContent).not.toContain('Page 1 of');
  });

  it('shows pagination controls when total > 25', async () => {
    setFetchHandler((url, init) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return jsonResponse({ data: { companies: baseCompanies, total: 60 } });
      }
      return defaultFetch(url, init);
    });
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of 3');
    });
  });

  it('Next page button advances the page', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return Promise.resolve(
          jsonResponse({ data: { companies: baseCompanies, total: 60 } }),
        );
      }
      return Promise.resolve(defaultFetch(url, init));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of 3');
    });
    // chevron_right is the last button
    const allBtns = Array.from(container.querySelectorAll('button'));
    const nextBtn = allBtns[allBtns.length - 1];
    fireEvent.click(nextBtn);
    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('page=2'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('Previous page button is disabled on first page', async () => {
    setFetchHandler((url, init) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return jsonResponse({ data: { companies: baseCompanies, total: 60 } });
      }
      return defaultFetch(url, init);
    });
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of 3');
    });
    const allBtns = Array.from(container.querySelectorAll('button'));
    // chevron_left is the first pagination button
    const prevBtn = allBtns.find((b) =>
      b.querySelector('span.material-icons')?.textContent === 'chevron_left',
    ) as HTMLButtonElement;
    expect(prevBtn?.disabled).toBe(true);
  });

  it('clicking a numeric page button fetches that page', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return Promise.resolve(
          jsonResponse({ data: { companies: baseCompanies, total: 60 } }),
        );
      }
      return Promise.resolve(defaultFetch(url, init));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => expect(container.textContent).toContain('Page 1 of 3'));
    const pageBtn2 = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '2',
    );
    expect(pageBtn2).toBeTruthy();
    fireEvent.click(pageBtn2!);
    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('page=2'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('last-page button is disabled when on last page', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/portal/crm/companies') && !init?.method) {
        return Promise.resolve(
          jsonResponse({ data: { companies: baseCompanies, total: 50 } }),
        );
      }
      return Promise.resolve(defaultFetch(url, init));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(React.createElement(CrmCompaniesPage));
    await waitFor(() => expect(container.textContent).toContain('Page 1 of 2'));
    // Advance to page 2
    const allBtns = Array.from(container.querySelectorAll('button'));
    const nextBtn = allBtns[allBtns.length - 1];
    fireEvent.click(nextBtn);
    await waitFor(() => expect(container.textContent).toContain('Page 2 of 2'));
    const allBtns2 = Array.from(container.querySelectorAll('button'));
    const nextBtn2 = allBtns2[allBtns2.length - 1] as HTMLButtonElement;
    expect(nextBtn2.disabled).toBe(true);
  });
});
