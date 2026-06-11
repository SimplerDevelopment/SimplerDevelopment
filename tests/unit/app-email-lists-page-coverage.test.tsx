/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/email/lists/page.tsx` — the Subscriber Lists
 * page. Covers: initial load, create-list form, open-list / subscriber
 * pane, add-subscriber form, search/status filters (with debounce),
 * CSV import, pagination, remove-subscriber, delete-list.
 *
 * next/navigation and next/link are mocked; fetch, window.confirm, and
 * window.alert are stubbed globally.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/email/lists',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch stub helpers ───────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };

function makeRes(body: any, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

const alertMock = vi.fn();
const confirmMock = vi.fn();

// ─── Fixture data ─────────────────────────────────────────────────────────────

const baseLists = [
  { id: 1, name: 'Newsletter', description: 'Monthly updates', subscriberCount: 42 },
  { id: 2, name: 'VIP', description: null, subscriberCount: 1 },
];

const baseSubscribers = [
  { id: 10, email: 'alice@example.com', name: 'Alice', status: 'active', subscribedAt: '2025-01-01T00:00:00Z' },
  { id: 11, email: 'bob@example.com', name: null, status: 'unsubscribed', subscribedAt: '2025-01-02T00:00:00Z' },
  { id: 12, email: 'carol@example.com', name: 'Carol', status: 'bounced', subscribedAt: '2025-01-03T00:00:00Z' },
  { id: 13, email: 'dan@example.com', name: 'Dan', status: 'complained', subscribedAt: '2025-01-04T00:00:00Z' },
  { id: 14, email: 'eve@example.com', name: 'Eve', status: 'unknown', subscribedAt: '2025-01-05T00:00:00Z' },
];

function defaultFetch(url: string, init?: any): FetchResp {
  if (url === '/api/portal/email/lists' && !init) {
    return makeRes({ data: baseLists });
  }
  if (url === '/api/portal/email/lists' && init?.method === 'POST') {
    return makeRes({ success: true, data: { id: 99, name: 'New List', description: '' } });
  }
  if (/^\/api\/portal\/email\/lists\/\d+(\?.*)?$/.test(url) && !init) {
    return makeRes({ data: baseSubscribers, total: baseSubscribers.length });
  }
  if (/^\/api\/portal\/email\/lists\/\d+$/.test(url) && init?.method === 'DELETE') {
    return makeRes({ success: true });
  }
  if (url === '/api/portal/email/subscribers' && init?.method === 'POST') {
    return makeRes({ success: true, data: { id: 99, email: 'new@example.com', name: 'New', status: 'active' } });
  }
  if (url === '/api/portal/email/subscribers' && init?.method === 'PUT') {
    return makeRes({ success: true, data: { imported: 2, total: 2 } });
  }
  if (/^\/api\/portal\/email\/subscribers\?id=\d+$/.test(url) && init?.method === 'DELETE') {
    return makeRes({ success: true });
  }
  return makeRes({});
}

beforeEach(() => {
  fetchMock.mockReset();
  alertMock.mockReset();
  confirmMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: any) => defaultFetch(url, init));
  // @ts-ignore
  global.fetch = fetchMock;
  vi.stubGlobal('alert', alertMock);
  vi.stubGlobal('confirm', confirmMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Page under test (imported AFTER mocks)
import PortalEmailListsPage from '@/app/portal/email/lists/page';

async function renderPage() {
  const result = render(<PortalEmailListsPage />);
  await waitFor(() => {
    expect(result.container.textContent).toContain('Newsletter');
  });
  return result;
}

// ─── Initial render ───────────────────────────────────────────────────────────

describe('PortalEmailListsPage — initial render', () => {
  it('renders the page heading', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Subscriber Lists');
  });

  it('renders all list names', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Newsletter');
    expect(container.textContent).toContain('VIP');
  });

  it('renders subscriber counts including singular form', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('42 subscribers');
    expect(container.textContent).toContain('1 subscriber');
  });

  it('renders the list description when present', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Monthly updates');
  });

  it('renders New List button', async () => {
    await renderPage();
    expect(screen.getByText('New List')).toBeTruthy();
  });

  it('renders the back link to /portal/email', async () => {
    const { container } = await renderPage();
    const link = container.querySelector('a[href="/portal/email"]');
    expect(link).toBeTruthy();
  });

  it('shows loading state before fetch resolves', () => {
    let resolve: (v: any) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((res) => { resolve = res; }));
    const { container } = render(<PortalEmailListsPage />);
    expect(container.textContent).toContain('Loading');
    resolve(makeRes({ data: baseLists }));
  });

  it('shows empty state when no lists', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/email/lists' && !init) return makeRes({ data: [] });
      return defaultFetch(url, init);
    });
    const { container } = render(<PortalEmailListsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain('No lists yet');
    });
  });

  it('handles missing data property gracefully', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/email/lists' && !init) return makeRes({});
      return defaultFetch(url, init);
    });
    const { container } = render(<PortalEmailListsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain('No lists yet');
    });
  });

  it('shows "Select a list" prompt in subscriber pane before selection', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Select a list');
    expect(container.textContent).toContain('Click a list to view');
  });
});

// ─── Create list form ─────────────────────────────────────────────────────────

describe('PortalEmailListsPage — create list form', () => {
  it('toggles create form open when New List is clicked', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('New List'));
    // The heading h3 "Create List" appears inside the form
    const heading = container.querySelector('h3');
    expect(heading?.textContent).toContain('Create List');
    expect(screen.getByPlaceholderText('e.g. Newsletter')).toBeTruthy();
  });

  it('Cancel button closes the form', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('New List'));
    fireEvent.click(screen.getByText('Cancel'));
    // After cancel the form's h3 heading is gone
    const headings = Array.from(container.querySelectorAll('h3'));
    expect(headings.every(h => !h.textContent?.includes('Create List'))).toBe(true);
  });

  it('typing in name/description updates the inputs', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('New List'));
    const nameInput = container.querySelector('input[placeholder="e.g. Newsletter"]') as HTMLInputElement;
    const descInput = container.querySelector('input[placeholder="Optional"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My List' } });
    fireEvent.change(descInput, { target: { value: 'A desc' } });
    expect(nameInput.value).toBe('My List');
    expect(descInput.value).toBe('A desc');
  });

  it('successful create adds the list to the UI and closes the form', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('New List'));
    const nameInput = container.querySelector('input[placeholder="e.g. Newsletter"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My List' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.queryByText('Create List')).toBeNull();
    });
    // The newly created list appears (with subscriberCount 0)
    expect(container.textContent).toContain('New List');
  });

  it('shows error message when create fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/email/lists' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Name already taken' });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('New List'));
    const nameInput = container.querySelector('input[placeholder="e.g. Newsletter"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Newsletter' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Name already taken');
    });
    // Form stays open — heading still present
    expect(container.querySelector('h3')?.textContent).toContain('Create List');
  });

  it('falls back to generic error message when API returns no message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/email/lists' && init?.method === 'POST') {
        return makeRes({ success: false });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('New List'));
    const nameInput = container.querySelector('input[placeholder="e.g. Newsletter"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Failed');
    });
  });
});

// ─── Subscriber pane — open list ─────────────────────────────────────────────

describe('PortalEmailListsPage — subscriber pane', () => {
  it('clicking a list opens the subscriber pane with its name', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      // Selected list name appears in subscriber pane header
      const headers = container.querySelectorAll('h2');
      const paneHeader = Array.from(headers).find(h => h.textContent === 'Newsletter');
      expect(paneHeader).toBeTruthy();
    });
  });

  it('fetches subscribers for the selected list', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeTruthy();
    });
  });

  it('renders subscriber names when present', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      expect(container.textContent).toContain('Alice');
      expect(container.textContent).toContain('Carol');
    });
  });

  it('renders all status badges with correct colors', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      expect(container.textContent).toContain('active');
      expect(container.textContent).toContain('unsubscribed');
      expect(container.textContent).toContain('bounced');
      expect(container.textContent).toContain('complained');
      // unknown status falls back to default color
      expect(container.textContent).toContain('unknown');
    });
  });

  it('shows loading state in subscriber pane while fetching', async () => {
    let resolve: (v: any) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (/\/api\/portal\/email\/lists\/\d+/.test(url) && !init) {
        return new Promise((res) => { resolve = res; });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    // While pending the pane shows Loading
    expect(container.textContent).toContain('Loading');
    resolve(makeRes({ data: baseSubscribers, total: 5 }));
  });

  it('shows empty-state message when list has no subscribers', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (/\/api\/portal\/email\/lists\/\d+/.test(url) && !init) {
        return makeRes({ data: [], total: 0 });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      expect(container.textContent).toContain('No subscribers yet');
    });
  });

  it('shows empty-state message when filter matches nothing', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (/\/api\/portal\/email\/lists\/\d+/.test(url) && !init) {
        return makeRes({ data: [], total: 0 });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    // Set a search so the "no match" branch fires
    await waitFor(() => expect(container.textContent).toContain('No subscribers yet'));
    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'xyz' } });
    await waitFor(() => {
      expect(container.textContent).toContain('No subscribers match');
    });
  });

  it('shows the Import CSV button when a list is selected', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      expect(screen.getByText('Import CSV')).toBeTruthy();
    });
  });

  it('renders the selected list with a highlighted background style', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      const highlighted = container.querySelector('.bg-accent');
      expect(highlighted).toBeTruthy();
    });
  });

  it('uses data.total for subTotal when numeric', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (/\/api\/portal\/email\/lists\/\d+/.test(url) && !init) {
        // total > subLimit (50) triggers pagination
        return makeRes({ data: baseSubscribers, total: 120 });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of');
      expect(container.textContent).toContain('120');
    });
  });
});

// ─── Add subscriber form ──────────────────────────────────────────────────────

describe('PortalEmailListsPage — add subscriber', () => {
  it('renders the add-subscriber email/name inputs', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    expect(screen.getByPlaceholderText('Email address')).toBeTruthy();
    expect(screen.getByPlaceholderText('Name')).toBeTruthy();
  });

  it('typing updates the subscriber form inputs', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const emailInput = screen.getByPlaceholderText('Email address') as HTMLInputElement;
    const nameInput = screen.getByPlaceholderText('Name') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'new@test.com' } });
    fireEvent.change(nameInput, { target: { value: 'New Person' } });
    expect(emailInput.value).toBe('new@test.com');
    expect(nameInput.value).toBe('New Person');
  });

  it('submitting the form calls POST /api/portal/email/subscribers', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const emailInput = screen.getByPlaceholderText('Email address') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'new@test.com' } });
    const form = emailInput.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => u === '/api/portal/email/subscribers' && init?.method === 'POST',
      );
      expect(call).toBeTruthy();
    });
  });

  it('successful add bumps the subscriber count in the list row', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const emailInput = screen.getByPlaceholderText('Email address') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'new@test.com' } });
    fireEvent.submit(emailInput.closest('form') as HTMLFormElement);
    await waitFor(() => {
      expect(container.textContent).toContain('43 subscribers');
    });
  });

  it('shows error message when add subscriber fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/email/subscribers' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Already subscribed' });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const emailInput = screen.getByPlaceholderText('Email address') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'dup@test.com' } });
    fireEvent.submit(emailInput.closest('form') as HTMLFormElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Already subscribed');
    });
  });

  it('falls back to generic sub error when message is absent', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/email/subscribers' && init?.method === 'POST') {
        return makeRes({ success: false });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const emailInput = screen.getByPlaceholderText('Email address') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'x@test.com' } });
    fireEvent.submit(emailInput.closest('form') as HTMLFormElement);
    await waitFor(() => {
      expect(container.textContent).toContain('Failed');
    });
  });
});

// ─── Search + status filter ───────────────────────────────────────────────────

describe('PortalEmailListsPage — search and status filter', () => {
  it('renders the search input and status dropdown', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    expect(container.querySelector('input[type="search"]')).toBeTruthy();
    const statusSelect = container.querySelector('select') as HTMLSelectElement;
    expect(statusSelect).toBeTruthy();
    expect(Array.from(statusSelect.options).map(o => o.value)).toContain('active');
    expect(Array.from(statusSelect.options).map(o => o.value)).toContain('unsubscribed');
    expect(Array.from(statusSelect.options).map(o => o.value)).toContain('bounced');
    expect(Array.from(statusSelect.options).map(o => o.value)).toContain('complained');
  });

  it('typing in the search fires a debounced fetch after 200ms', async () => {
    // Render and open list with real timers first
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());

    // Switch to fake timers only after the async setup is complete
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fetchMock.mockClear();

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'alice' } });
    // Advance past the 200ms debounce
    await act(async () => { vi.advanceTimersByTime(300); });

    const callsAfter = fetchMock.mock.calls.filter(
      ([u]) => typeof u === 'string' && u.includes('search=alice'),
    );
    expect(callsAfter.length).toBeGreaterThan(0);
  });

  it('changing the status filter re-fetches with status param', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const statusSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: 'active' } });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u]) => typeof u === 'string' && u.includes('status=active'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('search and status filter reset page to 1', async () => {
    // Seed with > 50 total so pagination renders
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (/\/api\/portal\/email\/lists\/\d+/.test(url) && !init) {
        return makeRes({ data: baseSubscribers, total: 120 });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(container.textContent).toContain('Page 1 of'));
    // Advance to page 2
    const nextBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Next',
    ) as HTMLButtonElement;
    fireEvent.click(nextBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u]) => typeof u === 'string' && u.includes('page=2'),
      );
      expect(call).toBeTruthy();
    });
    // Now change status — should reset to page 1
    const statusSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: 'active' } });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u]) => typeof u === 'string' && u.includes('status=active') && u.includes('page=1'),
      );
      expect(call).toBeTruthy();
    });
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('PortalEmailListsPage — subscriber pagination', () => {
  function seedPaginated() {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (/\/api\/portal\/email\/lists\/\d+/.test(url) && !init) {
        return makeRes({ data: baseSubscribers, total: 120 });
      }
      return defaultFetch(url, init);
    });
  }

  it('renders Prev/Next controls when total > 50', async () => {
    seedPaginated();
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      expect(container.textContent).toContain('Prev');
      expect(container.textContent).toContain('Next');
    });
  });

  it('Prev button is disabled on page 1', async () => {
    seedPaginated();
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(container.textContent).toContain('Prev'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Prev',
    ) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('Next advances to page 2', async () => {
    seedPaginated();
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(container.textContent).toContain('Next'));
    const nextBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Next',
    ) as HTMLButtonElement;
    fireEvent.click(nextBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u]) => typeof u === 'string' && u.includes('page=2'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('does not render pagination when total <= 50', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    expect(container.textContent).not.toContain('Prev');
    expect(container.textContent).not.toContain('Next');
  });

  it('shows the correct page count', async () => {
    seedPaginated();
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => {
      // 120 total / 50 limit = 3 pages (Math.ceil)
      expect(container.textContent).toContain('Page 1 of 3');
    });
  });
});

// ─── CSV import ───────────────────────────────────────────────────────────────

describe('PortalEmailListsPage — CSV import', () => {
  async function openCsvPane(container: HTMLElement) {
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Import CSV'));
    await waitFor(() => {
      expect(container.textContent).toContain('email,name');
    });
  }

  it('toggling Import CSV shows the textarea and import button', async () => {
    const { container } = await renderPage();
    await openCsvPane(container);
    expect(container.querySelector('textarea')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
  });

  it('Cancel button inside CSV pane closes it and clears text', async () => {
    const { container } = await renderPage();
    await openCsvPane(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'email,name\nfoo@bar.com,Foo' } });
    // Find the Cancel button in the CSV pane
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeNull();
    });
  });

  it('Import button is disabled when csv text is empty', async () => {
    const { container } = await renderPage();
    await openCsvPane(container);
    const importBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
  });

  it('successful import calls PUT and shows alert with count', async () => {
    const { container } = await renderPage();
    await openCsvPane(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'email,name\nfoo@bar.com,Foo\nbaz@bar.com,Baz' } });
    const importBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => u === '/api/portal/email/subscribers' && init?.method === 'PUT',
      );
      expect(call).toBeTruthy();
    });
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Imported 2'));
  });

  it('skips rows without a valid @ email', async () => {
    const { container } = await renderPage();
    await openCsvPane(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    // Only one valid email
    fireEvent.change(textarea, { target: { value: 'email,name\nvalid@test.com,V\nnotemail,X' } });
    const importBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => u === '/api/portal/email/subscribers' && init?.method === 'PUT',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1]!.body);
      expect(body.subscribers).toHaveLength(1);
      expect(body.subscribers[0].email).toBe('valid@test.com');
    });
  });

  it('shows error when import fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/email/subscribers' && init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Import failed bad data' });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    await openCsvPane(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'email,name\nfoo@bar.com,Foo' } });
    const importBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Import failed bad data');
    });
  });

  it('bumps subscriber count and closes CSV pane after successful import', async () => {
    const { container } = await renderPage();
    await openCsvPane(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'email,name\nfoo@bar.com,Foo\nbaz@bar.com,Baz' } });
    const importBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.trim() === 'Import',
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeNull();
    });
    // Count bumped by imported=2 (was 42)
    expect(container.textContent).toContain('44 subscribers');
  });
});

// ─── Remove subscriber ────────────────────────────────────────────────────────

describe('PortalEmailListsPage — remove subscriber', () => {
  it('confirms before deleting and removes the row on success', async () => {
    confirmMock.mockReturnValue(true);
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    // The remove button is the close icon button next to each subscriber
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(removeBtns[0]);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => typeof u === 'string' && u.includes('/api/portal/email/subscribers?id=') && init?.method === 'DELETE',
      );
      expect(call).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText('alice@example.com')).toBeNull();
    });
  });

  it('does not delete when confirm returns false', async () => {
    confirmMock.mockReturnValue(false);
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(removeBtns[0]);
    // alice should still be in the list
    expect(screen.getByText('alice@example.com')).toBeTruthy();
  });

  it('decrements the subscriber count and subTotal after removal', async () => {
    confirmMock.mockReturnValue(true);
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const before = container.textContent ?? '';
    expect(before).toContain('42 subscribers');
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(removeBtns[0]);
    await waitFor(() => {
      expect(screen.queryByText('alice@example.com')).toBeNull();
    });
    expect(container.textContent).toContain('41 subscribers');
  });
});

// ─── Delete list ──────────────────────────────────────────────────────────────

describe('PortalEmailListsPage — delete list', () => {
  it('confirms before deleting a list', async () => {
    confirmMock.mockReturnValue(true);
    const { container } = await renderPage();
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    );
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) =>
          typeof u === 'string' &&
          u.startsWith('/api/portal/email/lists/') &&
          init?.method === 'DELETE',
      );
      expect(call).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText('Newsletter')).toBeNull();
    });
  });

  it('does not delete when confirm returns false', async () => {
    confirmMock.mockReturnValue(false);
    await renderPage();
    expect(screen.getByText('Newsletter')).toBeTruthy();
    const { container } = render(<PortalEmailListsPage />);
    await waitFor(() => expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0));
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    );
    fireEvent.click(deleteBtns[0]);
    expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0);
  });

  it('closes the subscriber pane when the selected list is deleted', async () => {
    confirmMock.mockReturnValue(true);
    const { container } = await renderPage();
    // Open the first list
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    // Delete the first list (stop propagation prevents openList from firing)
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    );
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => {
      expect(screen.queryByText('Newsletter')).toBeNull();
    });
    // Subscriber pane should show "Select a list" again
    expect(container.textContent).toContain('Select a list');
  });

  it('does not clear subscriber pane when a different (non-selected) list is deleted', async () => {
    confirmMock.mockReturnValue(true);
    const { container } = await renderPage();
    // Open the first list
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    // Delete the SECOND list (VIP)
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'delete',
    );
    fireEvent.click(deleteBtns[1]);
    await waitFor(() => {
      expect(screen.queryByText('VIP')).toBeNull();
    });
    // Newsletter subscriber pane should still be open
    const headers = container.querySelectorAll('h2');
    const paneHeader = Array.from(headers).find(h => h.textContent === 'Newsletter');
    expect(paneHeader).toBeTruthy();
  });
});

// ─── statusColor constant ─────────────────────────────────────────────────────

describe('PortalEmailListsPage — statusColor map', () => {
  it('renders known status colours via className (active = green)', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    const badge = Array.from(container.querySelectorAll('span')).find(
      s => s.textContent === 'active',
    );
    expect(badge?.className).toContain('bg-green-100');
  });

  it('renders bounced with red badge', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('carol@example.com')).toBeTruthy());
    const badge = Array.from(container.querySelectorAll('span')).find(
      s => s.textContent === 'bounced',
    );
    expect(badge?.className).toContain('bg-red-100');
  });

  it('renders complained with orange badge', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('dan@example.com')).toBeTruthy());
    const badge = Array.from(container.querySelectorAll('span')).find(
      s => s.textContent === 'complained',
    );
    expect(badge?.className).toContain('bg-orange-100');
  });

  it('unknown status falls back to gray', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Newsletter'));
    await waitFor(() => expect(screen.getByText('eve@example.com')).toBeTruthy());
    const badge = Array.from(container.querySelectorAll('span')).find(
      s => s.textContent === 'unknown',
    );
    expect(badge?.className).toContain('bg-gray-100');
  });
});
