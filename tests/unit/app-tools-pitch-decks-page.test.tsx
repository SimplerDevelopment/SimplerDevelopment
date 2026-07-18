/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/tools/pitch-decks/page.tsx` — the standalone
 * Pitch Decks list page (split out from the old shared Proposals+Decks tabbed
 * page). It fetches decks on mount from GET /api/portal/tools/pitch-decks,
 * and exposes client-side search/status-filter/sort and a delete-deck dialog.
 * We stub `next/navigation` and `fetch` and drive every branch from the test.
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
  usePathname: () => '/portal/tools/pitch-decks',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
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

const baseDecks = [
  {
    id: 1, title: 'Sales Deck', description: 'Top of funnel', status: 'published',
    slides: [{}, {}, {}], updatedAt: '2025-02-01', createdAt: '2025-01-01',
  },
  {
    id: 2, title: 'Onboarding', description: null, status: 'draft',
    slides: [], updatedAt: '2025-01-10', createdAt: '2025-01-05',
  },
  {
    id: 3, title: 'Archived Pitch', description: 'old stuff', status: 'archived',
    slides: [{}], updatedAt: '2024-12-01', createdAt: '2024-11-01',
  },
];

function defaultFetch(url: string, init?: any): any {
  if (url === '/api/portal/tools/pitch-decks') {
    return jsonResponse({ data: baseDecks });
  }
  if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ data: [] });
}

beforeEach(() => {
  pushMock.mockReset();
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(handlers[0](url, init)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Import under test (after mocks)
import PitchDecksPage from '@/app/portal/tools/pitch-decks/page';

async function renderPage() {
  const result = render(<PitchDecksPage />);
  await waitFor(() => {
    expect(result.container.textContent).not.toContain('Loading pitch decks...');
  });
  return result;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PitchDecksPage', () => {
  describe('initial load', () => {
    it('renders the header title + subtitle', async () => {
      await renderPage();
      expect(screen.getAllByText('Pitch Decks').length).toBeGreaterThan(0);
      expect(screen.getByText('Create and send AI-powered pitch decks to clients')).toBeTruthy();
    });

    it('renders deck cards from the fetched list', async () => {
      await renderPage();
      expect(screen.getByText('Sales Deck')).toBeTruthy();
      expect(screen.getByText('Onboarding')).toBeTruthy();
      expect(screen.getByText('Archived Pitch')).toBeTruthy();
    });

    it('renders deck cards with slide counts (plural & singular)', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('3 slides');
      expect(container.textContent).toContain('0 slides');
      expect(container.textContent).toContain('1 slide');
    });

    it('renders status pills (published, draft, archived)', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('published');
      expect(container.textContent).toContain('draft');
      expect(container.textContent).toContain('archived');
    });

    it('clicking a deck card navigates to deck detail', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Sales Deck'));
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks/1');
    });

    it('New Deck button navigates to the new-deck route', async () => {
      await renderPage();
      const headerNewDeck = screen.getAllByText('New Deck')[0];
      fireEvent.click(headerNewDeck);
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks/new');
    });

    it('handles fetch error gracefully', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/tools/pitch-decks') {
          return Promise.reject(new Error('boom'));
        }
        return defaultFetch(url, init);
      });
      const result = render(<PitchDecksPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No pitch decks yet');
      });
    });

    it('handles missing data field by defaulting to an empty array', async () => {
      setFetchHandler((url) => {
        if (url === '/api/portal/tools/pitch-decks') return jsonResponse({});
        return jsonResponse({});
      });
      const result = render(<PitchDecksPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No pitch decks yet');
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state when no decks at all, and Create Your First Deck navigates', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/tools/pitch-decks') {
          return jsonResponse({ data: [] });
        }
        return defaultFetch(url, init);
      });
      const result = render(<PitchDecksPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No pitch decks yet');
      });
      fireEvent.click(screen.getByText('Create Your First Deck'));
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks/new');
    });

    it('does not render the toolbar when there are no decks', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/tools/pitch-decks') {
          return jsonResponse({ data: [] });
        }
        return defaultFetch(url, init);
      });
      const result = render(<PitchDecksPage />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No pitch decks yet');
      });
      expect(result.container.querySelector('input[placeholder="Search decks by title or description..."]')).toBeNull();
    });
  });

  describe('search / filter / sort', () => {
    it('filters decks by status (draft only)', async () => {
      const { container } = await renderPage();
      const draftPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Draft'));
      expect(draftPill).toBeTruthy();
      fireEvent.click(draftPill!);
      expect(container.textContent).toContain('Onboarding');
      expect(container.textContent).not.toContain('Sales Deck');
    });

    it('filters decks by status (published only)', async () => {
      const { container } = await renderPage();
      const pubPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Published'));
      fireEvent.click(pubPill!);
      expect(container.textContent).toContain('Sales Deck');
      expect(container.textContent).not.toContain('Onboarding');
    });

    it('filters decks by status (archived only)', async () => {
      const { container } = await renderPage();
      const archPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Archived'));
      fireEvent.click(archPill!);
      expect(container.textContent).toContain('Archived Pitch');
      expect(container.textContent).not.toContain('Sales Deck');
    });

    it('searches decks by title (debounced)', async () => {
      const { container } = await renderPage();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'sales' } });
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Sales Deck');
      expect(container.textContent).not.toContain('Onboarding');
    });

    it('searches decks by description', async () => {
      const { container } = await renderPage();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'funnel' } });
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Sales Deck');
    });

    it('shows "no decks match" state when search yields no results', async () => {
      const { container } = await renderPage();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'zzz-no-match' } });
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('No decks match your filters');
    });

    it('Reset filters button clears search + status filter', async () => {
      const { container } = await renderPage();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'zzz' } });
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      const reset = screen.getByText('Reset filters');
      fireEvent.click(reset);
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Sales Deck');
    });

    it('Clear filters link at top of result list clears filters', async () => {
      const { container } = await renderPage();
      const draftPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Draft'));
      fireEvent.click(draftPill!);
      await act(async () => { await Promise.resolve(); });
      const clear = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent === 'clear filters');
      expect(clear).toBeTruthy();
      fireEvent.click(clear!);
      expect(container.textContent).toContain('Sales Deck');
    });

    it('Clear search button (x) clears the search input', async () => {
      const { container } = await renderPage();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'sales' } });
      const clearBtn = container.querySelector('button[title="Clear search"]')!;
      fireEvent.click(clearBtn);
      expect(searchInput.value).toBe('');
    });

    it('sorts decks by title ascending', async () => {
      const { container } = await renderPage();
      const sortSelect = Array.from(container.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'title-asc')) as HTMLSelectElement;
      fireEvent.change(sortSelect, { target: { value: 'title-asc' } });
      const titles = Array.from(container.querySelectorAll('h3')).map(h => h.textContent || '');
      const filtered = titles.filter(t => ['Sales Deck', 'Onboarding', 'Archived Pitch'].includes(t));
      expect(filtered[0]).toBe('Archived Pitch');
    });

    it('sorts decks by title descending', async () => {
      const { container } = await renderPage();
      const sortSelect = Array.from(container.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'title-desc')) as HTMLSelectElement;
      fireEvent.change(sortSelect, { target: { value: 'title-desc' } });
      const titles = Array.from(container.querySelectorAll('h3')).map(h => h.textContent || '');
      const filtered = titles.filter(t => ['Sales Deck', 'Onboarding', 'Archived Pitch'].includes(t));
      expect(filtered[0]).toBe('Sales Deck');
    });

    it('sorts decks by updated date ascending', async () => {
      const { container } = await renderPage();
      const sortSelect = Array.from(container.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'updated-asc')) as HTMLSelectElement;
      fireEvent.change(sortSelect, { target: { value: 'updated-asc' } });
      const titles = Array.from(container.querySelectorAll('h3')).map(h => h.textContent || '');
      const filtered = titles.filter(t => ['Sales Deck', 'Onboarding', 'Archived Pitch'].includes(t));
      expect(filtered[0]).toBe('Archived Pitch');
    });
  });

  describe('delete deck', () => {
    it('opens delete dialog when delete icon clicked', async () => {
      const { container } = await renderPage();
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      expect(screen.getByText('Delete Pitch Deck')).toBeTruthy();
      expect(screen.getAllByText('Sales Deck').length).toBeGreaterThan(0);
    });

    it('Cancel button on delete dialog closes it without deleting', async () => {
      const { container } = await renderPage();
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const cancelButtons = screen.getAllByText('Cancel');
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);
      expect(screen.queryByText('Delete Pitch Deck')).toBeNull();
    });

    it('Delete button removes deck from list on success', async () => {
      const { container } = await renderPage();
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.queryByText('Sales Deck')).toBeNull();
      });
    });

    it('Delete shows error message when API returns failure', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
          return jsonResponse({ success: false, message: 'cannot delete' });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.getByText('cannot delete')).toBeTruthy();
      });
    });

    it('Delete falls back to default error message when no message in response', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.getByText('Failed to delete deck.')).toBeTruthy();
      });
    });

    it('Delete handles fetch throw with default error message', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
          return Promise.reject(new Error('network'));
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.getByText('Failed to delete deck.')).toBeTruthy();
      });
    });

    it('falls back to "this deck" if id not found in decks list', async () => {
      const { container } = await renderPage();
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      expect(screen.getAllByText('Sales Deck').length).toBeGreaterThan(0);
    });
  });
});
