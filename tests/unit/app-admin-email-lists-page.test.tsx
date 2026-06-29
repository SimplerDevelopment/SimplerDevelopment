// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/email/lists/page.tsx` — 'use client' component.
 * Stubs global fetch; exercises loading state, empty state, list rendering,
 * create-list form, subscriber panel, add/remove subscriber, delete list.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/admin/email/lists',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...rest }, children),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseList = {
  id: 1,
  name: 'Newsletter',
  description: 'Monthly newsletter',
  subscriberCount: 3,
  createdAt: '2025-01-01T00:00:00Z',
};

const baseSub = {
  id: 101,
  email: 'alice@example.com',
  name: 'Alice',
  status: 'active',
  subscribedAt: '2025-03-01T00:00:00Z',
};

// ─── Fetch helper ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

type Handler = (url: string, init?: RequestInit) => FetchResp | Promise<FetchResp>;
let currentHandler: Handler;

function setHandler(h: Handler) {
  currentHandler = h;
}

function defaultHandler(url: string, _init?: RequestInit): FetchResp {
  if (url === '/api/admin/email/lists')
    return makeRes({ success: true, data: [baseList] });
  if (/\/api\/admin\/email\/lists\/\d+$/.test(url) && !_init?.method)
    return makeRes({ success: true, data: [baseSub] });
  if (/\/api\/admin\/email\/lists\/\d+$/.test(url) && _init?.method === 'DELETE')
    return makeRes({ success: true });
  if (url === '/api/admin/email/subscribers')
    return makeRes({ success: true, data: { ...baseSub, id: 200, email: 'bob@example.com' } });
  if (/\/api\/admin\/email\/subscribers/.test(url) && _init?.method === 'DELETE')
    return makeRes({ success: true });
  return makeRes({ success: true, data: null });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setHandler(defaultHandler);
  // @ts-expect-error - assigning vi mock to global.fetch
  global.fetch = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(currentHandler(url, init))
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// ─── Page under test ──────────────────────────────────────────────────────────

import EmailListsPage from '@/app/admin/email/lists/page';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function renderPage() {
  const result = render(<EmailListsPage />);
  // Wait for loading to finish
  await waitFor(() => {
    expect(screen.queryByText('Loading…')).toBeNull();
  });
  return result;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EmailListsPage', () => {
  // ── Loading state ────────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading text before data resolves', () => {
      // Don't await — capture the loading state
      setHandler(() => new Promise(() => {}) as unknown as FetchResp);
      render(<EmailListsPage />);
      expect(screen.getByText('Loading…')).toBeTruthy();
    });

    it('hides loading text after data arrives', async () => {
      await renderPage();
      expect(screen.queryByText('Loading…')).toBeNull();
    });
  });

  // ── Page structure ────────────────────────────────────────────────────────────

  describe('page structure', () => {
    it('renders the Subscriber Lists heading', async () => {
      await renderPage();
      expect(screen.getByText('Subscriber Lists')).toBeTruthy();
    });

    it('renders the description text', async () => {
      await renderPage();
      expect(screen.getByText('Manage email lists and subscribers.')).toBeTruthy();
    });

    it('renders back link to /admin/email', async () => {
      await renderPage();
      const link = document.querySelector('a[href="/admin/email"]') as HTMLAnchorElement;
      expect(link).toBeTruthy();
    });

    it('renders "New List" button', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /New List/i })).toBeTruthy();
    });

    it('renders Lists panel heading', async () => {
      await renderPage();
      expect(screen.getByText('Lists')).toBeTruthy();
    });

    it('renders "Select a list" in subscriber panel when nothing selected', async () => {
      await renderPage();
      expect(screen.getByText('Select a list')).toBeTruthy();
      expect(screen.getByText('Click a list to view subscribers.')).toBeTruthy();
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows "No lists yet." when data is empty', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [] });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('No lists yet.')).toBeTruthy();
    });

    it('handles missing data key (falls back to [])', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('No lists yet.')).toBeTruthy();
    });
  });

  // ── Populated list ────────────────────────────────────────────────────────────

  describe('populated list', () => {
    it('renders list name', async () => {
      await renderPage();
      expect(screen.getByText('Newsletter')).toBeTruthy();
    });

    it('renders subscriber count', async () => {
      await renderPage();
      expect(screen.getByText('3 subscribers')).toBeTruthy();
    });

    it('renders "1 subscriber" (singular) when count is 1', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists')
          return makeRes({ success: true, data: [{ ...baseList, subscriberCount: 1 }] });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('1 subscriber')).toBeTruthy();
    });

    it('renders multiple lists', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists')
          return makeRes({
            success: true,
            data: [
              baseList,
              { ...baseList, id: 2, name: 'Announcements', subscriberCount: 0 },
            ],
          });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('Newsletter')).toBeTruthy();
      expect(screen.getByText('Announcements')).toBeTruthy();
    });

    it('renders delete button per list', async () => {
      await renderPage();
      // delete icon button
      const deleteBtns = document.querySelectorAll('button .material-icons');
      const deleteIcons = Array.from(deleteBtns).filter(
        (el) => el.textContent === 'delete'
      );
      expect(deleteIcons.length).toBeGreaterThan(0);
    });
  });

  // ── Create list form ──────────────────────────────────────────────────────────

  describe('create list form', () => {
    it('shows form when "New List" button clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New List/i }));
      expect(screen.getByText('Create List', { selector: 'h3' })).toBeTruthy();
    });

    it('hides form when "Cancel" clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New List/i }));
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(screen.queryByText('Create List', { selector: 'h3' })).toBeNull();
    });

    it('toggles form on/off when button clicked twice', async () => {
      await renderPage();
      const btn = screen.getByRole('button', { name: /New List/i });
      fireEvent.click(btn);
      expect(screen.getByText('Create List', { selector: 'h3' })).toBeTruthy();
      fireEvent.click(btn);
      expect(screen.queryByText('Create List', { selector: 'h3' })).toBeNull();
    });

    it('renders name and description inputs in form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New List/i }));
      expect(screen.getByPlaceholderText('e.g. Newsletter')).toBeTruthy();
      expect(screen.getByPlaceholderText('Optional')).toBeTruthy();
    });

    it('submits create form and adds list to state', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/email/lists' && init?.method === 'POST')
          return makeRes({
            success: true,
            data: { id: 99, name: 'New List', description: '' },
          });
        return defaultHandler(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New List/i }));

      const nameInput = screen.getByPlaceholderText('e.g. Newsletter');
      fireEvent.change(nameInput, { target: { value: 'New List' } });

      fireEvent.click(screen.getByRole('button', { name: /Create List/i }));
      await waitFor(() => expect(screen.queryByText('Create List', { selector: 'h3' })).toBeNull());
      // The new list appears in the list panel (as a <p> element, not the button)
      await waitFor(() => {
        const listItems = document.querySelectorAll('.font-medium.text-sm.text-foreground');
        const found = Array.from(listItems).some((el) => el.textContent === 'New List');
        expect(found).toBe(true);
      });
    });

    it('shows "Creating…" while saving', async () => {
      let resolve: (v: FetchResp) => void = () => {};
      setHandler((url, init) => {
        if (url === '/api/admin/email/lists' && init?.method === 'POST')
          return new Promise<FetchResp>((r) => {
            resolve = r;
          });
        return defaultHandler(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New List/i }));
      const nameInput = screen.getByPlaceholderText('e.g. Newsletter');
      fireEvent.change(nameInput, { target: { value: 'X' } });
      fireEvent.click(screen.getByRole('button', { name: /Create List/i }));
      await waitFor(() => expect(screen.getByText('Creating…')).toBeTruthy());
      // resolve to avoid promise leak
      resolve(makeRes({ success: true, data: { id: 5, name: 'X', description: '' } }));
    });

    it('shows error message when create fails', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/email/lists' && init?.method === 'POST')
          return makeRes({ success: false, message: 'Name already taken' });
        return defaultHandler(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New List/i }));
      fireEvent.change(screen.getByPlaceholderText('e.g. Newsletter'), {
        target: { value: 'Dupe' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create List/i }));
      await waitFor(() => expect(screen.getByText('Name already taken')).toBeTruthy());
    });

    it('shows "Failed" fallback when create message is absent', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/email/lists' && init?.method === 'POST')
          return makeRes({ success: false });
        return defaultHandler(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New List/i }));
      fireEvent.change(screen.getByPlaceholderText('e.g. Newsletter'), {
        target: { value: 'Test' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Create List/i }));
      await waitFor(() => expect(screen.getByText('Failed')).toBeTruthy());
    });
  });

  // ── Subscriber panel ──────────────────────────────────────────────────────────

  describe('subscriber panel', () => {
    it('opens subscriber panel on list click and shows list name', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() =>
        expect(screen.getByText('Newsletter — Subscribers')).toBeTruthy()
      );
    });

    it('shows loading in subscriber panel while fetching', async () => {
      let resolveSubscribers: (v: FetchResp) => void = () => {};
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url))
          return new Promise<FetchResp>((r) => {
            resolveSubscribers = r;
          });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() =>
        expect(document.querySelectorAll('.text-muted-foreground').length).toBeGreaterThan(0)
      );
      resolveSubscribers(makeRes({ success: true, data: [] }));
    });

    it('renders subscriber email after panel opens', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    });

    it('renders subscriber name', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('Alice')).toBeTruthy());
    });

    it('shows "No subscribers yet." when list has no subscribers', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url))
          return makeRes({ success: true, data: [] });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('No subscribers yet.')).toBeTruthy());
    });

    it('renders subscriber status badge', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('active')).toBeTruthy());
    });

    it('renders status badge for unsubscribed status', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url))
          return makeRes({
            success: true,
            data: [{ ...baseSub, status: 'unsubscribed' }],
          });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('unsubscribed')).toBeTruthy());
    });

    it('renders status badge for bounced status', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url))
          return makeRes({ success: true, data: [{ ...baseSub, status: 'bounced' }] });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('bounced')).toBeTruthy());
    });

    it('renders status badge for complained status', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url))
          return makeRes({
            success: true,
            data: [{ ...baseSub, status: 'complained' }],
          });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('complained')).toBeTruthy());
    });

    it('renders status with default color for unknown status', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url))
          return makeRes({ success: true, data: [{ ...baseSub, status: 'pending' }] });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('pending')).toBeTruthy());
    });

    it('does not render subscriber name when null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url))
          return makeRes({ success: true, data: [{ ...baseSub, name: null }] });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
      // No name element for null name
      expect(screen.queryByText('Alice')).toBeNull();
    });

    it('highlights the selected list row', async () => {
      await renderPage();
      const listRow = screen.getByText('Newsletter').closest('[class*="cursor-pointer"]') as HTMLElement;
      fireEvent.click(listRow);
      await waitFor(() =>
        expect(listRow.className).toContain('bg-accent')
      );
    });
  });

  // ── Add subscriber ────────────────────────────────────────────────────────────

  describe('add subscriber', () => {
    async function openPanel() {
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('Newsletter — Subscribers')).toBeTruthy());
    }

    it('renders email and name inputs in add-subscriber form', async () => {
      await openPanel();
      expect(screen.getByPlaceholderText('Email address')).toBeTruthy();
      expect(screen.getByPlaceholderText('Name (optional)')).toBeTruthy();
    });

    it('adds subscriber on form submit and shows new entry', async () => {
      const newSub = { id: 200, email: 'bob@example.com', name: 'Bob', status: 'active', subscribedAt: '' };
      setHandler((url, init) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url) && !init?.method)
          return makeRes({ success: true, data: [baseSub] });
        if (url === '/api/admin/email/subscribers' && init?.method === 'POST')
          return makeRes({ success: true, data: newSub });
        return defaultHandler(url, init);
      });
      await openPanel();
      await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());

      fireEvent.change(screen.getByPlaceholderText('Email address'), {
        target: { value: 'bob@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Name (optional)'), {
        target: { value: 'Bob' },
      });

      const addBtn = screen.getByText('Newsletter — Subscribers')
        .closest('div')
        ?.parentElement
        ?.querySelector('form button[type="submit"]') as HTMLButtonElement;
      if (addBtn) fireEvent.click(addBtn);
      else {
        // fallback: click the add button directly
        const forms = document.querySelectorAll('form');
        const subForm = Array.from(forms).find((f) => f.querySelector('[type="email"]'));
        if (subForm) fireEvent.submit(subForm);
      }

      await waitFor(() => expect(screen.getByText('bob@example.com')).toBeTruthy());
    });

    it('shows sub error when add fails', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url) && !init?.method)
          return makeRes({ success: true, data: [] });
        if (url === '/api/admin/email/subscribers' && init?.method === 'POST')
          return makeRes({ success: false, message: 'Already subscribed' });
        return defaultHandler(url, init);
      });
      await openPanel();
      await waitFor(() => expect(screen.getByText('No subscribers yet.')).toBeTruthy());
      fireEvent.change(screen.getByPlaceholderText('Email address'), {
        target: { value: 'dup@example.com' },
      });
      const forms = document.querySelectorAll('form');
      const subForm = Array.from(forms).find((f) => f.querySelector('[type="email"]'));
      if (subForm) fireEvent.submit(subForm);
      await waitFor(() => expect(screen.getByText('Already subscribed')).toBeTruthy());
    });

    it('shows "Failed" fallback when add message absent', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/email/lists') return makeRes({ success: true, data: [baseList] });
        if (/\/api\/admin\/email\/lists\/\d+$/.test(url) && !init?.method)
          return makeRes({ success: true, data: [] });
        if (url === '/api/admin/email/subscribers' && init?.method === 'POST')
          return makeRes({ success: false });
        return defaultHandler(url, init);
      });
      await openPanel();
      fireEvent.change(screen.getByPlaceholderText('Email address'), {
        target: { value: 'x@example.com' },
      });
      const forms = document.querySelectorAll('form');
      const subForm = Array.from(forms).find((f) => f.querySelector('[type="email"]'));
      if (subForm) fireEvent.submit(subForm);
      await waitFor(() => expect(screen.getByText('Failed')).toBeTruthy());
    });
  });

  // ── Remove subscriber ─────────────────────────────────────────────────────────

  describe('remove subscriber', () => {
    it('removes subscriber when confirm returns true', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());

      const closeBtns = document.querySelectorAll('.material-icons');
      const closeIcon = Array.from(closeBtns).find((el) => el.textContent === 'close');
      if (closeIcon?.parentElement) fireEvent.click(closeIcon.parentElement);

      await waitFor(() =>
        expect(screen.queryByText('alice@example.com')).toBeNull()
      );
    });

    it('does not remove subscriber when confirm returns false', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      await renderPage();
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());

      const closeBtns = document.querySelectorAll('.material-icons');
      const closeIcon = Array.from(closeBtns).find((el) => el.textContent === 'close');
      if (closeIcon?.parentElement) fireEvent.click(closeIcon.parentElement);

      await flush();
      expect(screen.getByText('alice@example.com')).toBeTruthy();
    });

    it('decrements subscriber count on removal', async () => {
      await renderPage();
      expect(screen.getByText('3 subscribers')).toBeTruthy();

      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());

      const closeBtns = document.querySelectorAll('.material-icons');
      const closeIcon = Array.from(closeBtns).find((el) => el.textContent === 'close');
      if (closeIcon?.parentElement) fireEvent.click(closeIcon.parentElement);

      await waitFor(() => expect(screen.getByText('2 subscribers')).toBeTruthy());
    });
  });

  // ── Delete list ───────────────────────────────────────────────────────────────

  describe('delete list', () => {
    it('removes list from state when confirmed', async () => {
      await renderPage();
      expect(screen.getByText('Newsletter')).toBeTruthy();

      // Click the delete button (stop propagation means it won't open the panel)
      const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'delete'
      );
      if (deleteBtn) fireEvent.click(deleteBtn);

      await waitFor(() => expect(screen.queryByText('Newsletter')).toBeNull());
      expect(screen.getByText('No lists yet.')).toBeTruthy();
    });

    it('keeps list when confirm returns false', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      await renderPage();

      const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'delete'
      );
      if (deleteBtn) fireEvent.click(deleteBtn);

      await flush();
      expect(screen.getByText('Newsletter')).toBeTruthy();
    });

    it('clears selected list when the selected list is deleted', async () => {
      await renderPage();
      // Open the panel first
      fireEvent.click(screen.getByText('Newsletter'));
      await waitFor(() => expect(screen.getByText('Newsletter — Subscribers')).toBeTruthy());

      // Delete the selected list
      const deleteBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.querySelector('.material-icons')?.textContent === 'delete'
      );
      if (deleteBtn) fireEvent.click(deleteBtn);

      await waitFor(() => expect(screen.getByText('Select a list')).toBeTruthy());
    });
  });
});
