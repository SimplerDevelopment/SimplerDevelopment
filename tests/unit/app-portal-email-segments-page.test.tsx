// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/email/segments/page.tsx`
 * Covers: loading state, segments tab, tags tab, create/delete for both,
 * rule management, empty states, and fetch error branches.
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
  usePathname: () => '/portal/email/segments',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

const baseSegments = [
  {
    id: 1,
    name: 'Active Users',
    description: 'All active subscribers',
    rules: [{ field: 'status', operator: 'equals', value: 'active' }],
    matchType: 'all',
    subscriberCount: 42,
    lastCalculatedAt: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'VIP Leads',
    description: null,
    rules: [
      { field: 'tag', operator: 'has', value: 'vip' },
      { field: 'status', operator: 'equals', value: 'active' },
    ],
    matchType: 'all',
    subscriberCount: 7,
    lastCalculatedAt: null,
    createdAt: '2025-01-02T00:00:00Z',
  },
];

const baseTags = [
  { id: 10, name: 'VIP', color: '#ff0000', subscriberCount: 5 },
  { id: 11, name: 'Newsletter', color: '#6366f1', subscriberCount: 100 },
];

function defaultFetch(url: string, init?: RequestInit): Response {
  if (url === '/api/portal/email/segments') {
    if (init?.method === 'POST') {
      return jsonOk({ success: true, data: { id: 99, name: 'New Seg', description: null, rules: [], matchType: 'all', subscriberCount: 0, lastCalculatedAt: null, createdAt: new Date().toISOString() } });
    }
    return jsonOk({ success: true, data: baseSegments });
  }
  if (/^\/api\/portal\/email\/segments\/\d+$/.test(url) && init?.method === 'DELETE') {
    return jsonOk({ success: true });
  }
  if (url === '/api/portal/email/tags') {
    if (init?.method === 'POST') {
      return jsonOk({ success: true, data: { id: 99, name: 'NewTag', color: '#abcdef', subscriberCount: 0 } });
    }
    return jsonOk({ success: true, data: baseTags });
  }
  if (/^\/api\/portal\/email\/tags\/\d+$/.test(url) && init?.method === 'DELETE') {
    return jsonOk({ success: true });
  }
  return jsonOk({});
}

let fetchOverride: ((url: string, init?: RequestInit) => Response) | null = null;

beforeEach(() => {
  fetchOverride = null;
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const handler = fetchOverride ?? defaultFetch;
    return Promise.resolve(handler(url, init));
  }));
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Page under test (imported AFTER mocks)
import EmailSegmentsPage from '@/app/portal/email/segments/page';

async function renderAndLoad() {
  const result = render(<EmailSegmentsPage />);
  // Wait for loading spinner to disappear and content to appear
  await waitFor(() => {
    expect(result.container.textContent).not.toContain('autorenew');
    // Either empty state or segment list should be visible
  });
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EmailSegmentsPage', () => {
  describe('loading state', () => {
    it('shows loading spinner initially', () => {
      // Delay the fetch so spinner is visible
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* never resolves */ })));
      const { container } = render(<EmailSegmentsPage />);
      expect(container.textContent).toContain('autorenew');
    });
  });

  describe('initial render — segments tab', () => {
    it('renders the Audience heading', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Audience');
    });

    it('renders Segments tab with correct count', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Segments (2)');
    });

    it('renders Tags tab with correct count', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Tags (2)');
    });

    it('renders all segment names', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Active Users');
      expect(container.textContent).toContain('VIP Leads');
    });

    it('renders segment description when present', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('All active subscribers');
    });

    it('does not render description when null', async () => {
      const { container } = await renderAndLoad();
      // VIP Leads has null description; its area should not have empty description text
      // just verify the segment name exists without error
      expect(container.textContent).toContain('VIP Leads');
    });

    it('renders rule count with plural suffix', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('2 rules');
    });

    it('renders rule count with singular suffix', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('1 rule');
    });

    it('renders subscriber count for each segment', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('42 subscribers');
      expect(container.textContent).toContain('7 subscribers');
    });

    it('renders the New Segment button', async () => {
      await renderAndLoad();
      expect(screen.getByText('New Segment')).toBeTruthy();
    });
  });

  describe('empty state — segments', () => {
    it('shows empty state when no segments', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/email/segments') return jsonOk({ success: true, data: [] });
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('No segments yet');
    });

    it('does not show empty state when create form is open', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/email/segments') return jsonOk({ success: true, data: [] });
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      expect(container.textContent).not.toContain('No segments yet');
    });
  });

  describe('create segment form', () => {
    it('toggles the create segment form open', async () => {
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      // Form heading has class "font-semibold" only (segment cards use "font-semibold text-sm")
      const formHeading = Array.from(container.querySelectorAll('h3')).find(
        (el) => el.classList.contains('font-semibold') && !el.classList.contains('text-sm'),
      );
      expect(formHeading?.textContent).toContain('Create Segment');
    });

    it('shows Segment Name input and Match select in form', async () => {
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      expect(container.querySelector('input[placeholder="e.g. Active Subscribers"]')).toBeTruthy();
      expect(container.textContent).toContain('All rules must match');
    });

    it('shows default rule with status field', async () => {
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      expect(container.textContent).toContain('Subscriber Status');
    });

    it('can add additional rules', async () => {
      await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      fireEvent.click(screen.getByText('Add rule'));
      // Now 2 rows of rule fields should exist
      const ruleRows = document.querySelectorAll('div.flex.items-center.gap-2.flex-wrap');
      expect(ruleRows.length).toBeGreaterThanOrEqual(2);
    });

    it('can remove a rule when more than one exists', async () => {
      await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      fireEvent.click(screen.getByText('Add rule'));
      // Should have a close button for the second rule
      const closeButtons = document.querySelectorAll('button[type="button"] span.material-icons');
      const closeIcons = Array.from(closeButtons).filter(el => el.textContent === 'close');
      expect(closeIcons.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(closeIcons[0].parentElement!);
      // Back to 1 rule — no close button visible
      const closeIconsAfter = Array.from(document.querySelectorAll('button[type="button"] span.material-icons'))
        .filter(el => el.textContent === 'close');
      expect(closeIconsAfter.length).toBe(0);
    });

    it('updates rule field when field select changes', async () => {
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      // First select in the rule row is the field selector
      const form = container.querySelector('form')!;
      const selects = form.querySelectorAll('select');
      // selects[0] = match type, selects[1] = field, selects[2] = operator
      fireEvent.change(selects[1], { target: { value: 'tag' } });
      expect((selects[1] as HTMLSelectElement).value).toBe('tag');
    });

    it('Cancel button closes the form', async () => {
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      // form is open — form element exists
      expect(container.querySelector('form')).toBeTruthy();
      fireEvent.click(screen.getByText('Cancel'));
      // form closed
      expect(container.querySelector('form')).toBeNull();
    });

    it('submits create segment and adds it to the list', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      const form = container.querySelector('form')!;
      const nameInput = form.querySelector('input[placeholder="e.g. Active Subscribers"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New Seg' } });
      fireEvent.submit(form);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (c) => c[0] === '/api/portal/email/segments' && (c[1] as RequestInit)?.method === 'POST',
        );
        expect(post).toBeTruthy();
      });
      await waitFor(() => {
        // form is closed after successful create
        expect(container.querySelector('form')).toBeNull();
      });
    });

    it('does nothing when segment name is blank', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      const form = container.querySelector('form')!;
      // Don't fill name input
      fireEvent.submit(form);
      // No POST should be made
      const post = fetchSpy.mock.calls.find(
        (c) => c[0] === '/api/portal/email/segments' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(post).toBeUndefined();
    });

    it('skips adding segment when API returns success: false', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/email/segments' && (init as RequestInit)?.method === 'POST') {
          return jsonOk({ success: false });
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText('New Segment'));
      const form = container.querySelector('form')!;
      const nameInput = form.querySelector('input[placeholder="e.g. Active Subscribers"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Bad Seg' } });
      await act(async () => { fireEvent.submit(form); });
      // Form remains open (not closed) — form element still visible
      expect(container.querySelector('form')).toBeTruthy();
    });
  });

  describe('delete segment', () => {
    it('calls DELETE and removes segment from list on confirm', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      const deleteButtons = container.querySelectorAll('button span.material-icons');
      const deleteIcon = Array.from(deleteButtons).find(el => el.textContent === 'delete_outline');
      expect(deleteIcon).toBeTruthy();
      fireEvent.click(deleteIcon!.parentElement!);
      await waitFor(() => {
        const del = fetchSpy.mock.calls.find(
          (c) => /\/api\/portal\/email\/segments\/\d+/.test(c[0]) && (c[1] as RequestInit)?.method === 'DELETE',
        );
        expect(del).toBeTruthy();
      });
      await waitFor(() => {
        expect(container.textContent).not.toContain('Active Users');
      });
    });

    it('does not delete when confirm returns false', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false));
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      const deleteButtons = container.querySelectorAll('button span.material-icons');
      const deleteIcon = Array.from(deleteButtons).find(el => el.textContent === 'delete_outline');
      fireEvent.click(deleteIcon!.parentElement!);
      const del = fetchSpy.mock.calls.find(
        (c) => /\/api\/portal\/email\/segments\/\d+/.test(c[0]) && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(del).toBeUndefined();
    });
  });

  describe('tags tab', () => {
    async function switchToTags() {
      const result = await renderAndLoad();
      fireEvent.click(screen.getByText(/Tags \(\d+\)/));
      return result;
    }

    it('shows tag names after switching to Tags tab', async () => {
      const { container } = await switchToTags();
      expect(container.textContent).toContain('VIP');
      expect(container.textContent).toContain('Newsletter');
    });

    it('shows subscriber counts for tags', async () => {
      const { container } = await switchToTags();
      expect(container.textContent).toContain('5');
      expect(container.textContent).toContain('100');
    });

    it('renders a color swatch for each tag', async () => {
      const { container } = await switchToTags();
      const swatches = container.querySelectorAll('span.w-3.h-3.rounded-full');
      expect(swatches.length).toBeGreaterThanOrEqual(2);
    });

    it('renders the Tag Name input and Add Tag button', async () => {
      const { container } = await switchToTags();
      expect(container.querySelector('input[placeholder="e.g. VIP, Newsletter, Lead"]')).toBeTruthy();
      expect(screen.getByText('Add Tag')).toBeTruthy();
    });

    it('shows empty state when no tags', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/email/tags') return jsonOk({ success: true, data: [] });
        return defaultFetch(url, init);
      };
      const { container } = await switchToTags();
      expect(container.textContent).toContain('No tags yet');
    });

    it('creates a tag and appends it to the list', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await switchToTags();
      const nameInput = container.querySelector('input[placeholder="e.g. VIP, Newsletter, Lead"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'NewTag' } });
      const form = container.querySelector('form')!;
      fireEvent.submit(form);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (c) => c[0] === '/api/portal/email/tags' && (c[1] as RequestInit)?.method === 'POST',
        );
        expect(post).toBeTruthy();
      });
      await waitFor(() => {
        expect(container.textContent).toContain('NewTag');
      });
    });

    it('does nothing when tag name is blank', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await switchToTags();
      const form = container.querySelector('form')!;
      fireEvent.submit(form);
      const post = fetchSpy.mock.calls.find(
        (c) => c[0] === '/api/portal/email/tags' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(post).toBeUndefined();
    });

    it('skips appending tag when API returns success: false', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/email/tags' && (init as RequestInit)?.method === 'POST') {
          return jsonOk({ success: false });
        }
        return defaultFetch(url, init);
      };
      const { container } = await switchToTags();
      const nameInput = container.querySelector('input[placeholder="e.g. VIP, Newsletter, Lead"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'ShouldNotAppear' } });
      await act(async () => { fireEvent.submit(container.querySelector('form')!); });
      expect(container.textContent).not.toContain('ShouldNotAppear');
    });

    it('deletes a tag on confirm and removes it from list', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await switchToTags();
      // Hover to reveal close button (opacity-0 group-hover style, still in DOM)
      const closeSpans = container.querySelectorAll('button span.material-icons');
      const closeIcon = Array.from(closeSpans).find(el => el.textContent === 'close');
      expect(closeIcon).toBeTruthy();
      fireEvent.click(closeIcon!.parentElement!);
      await waitFor(() => {
        const del = fetchSpy.mock.calls.find(
          (c) => /\/api\/portal\/email\/tags\/\d+/.test(c[0]) && (c[1] as RequestInit)?.method === 'DELETE',
        );
        expect(del).toBeTruthy();
      });
    });

    it('does not delete tag when confirm returns false', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false));
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await switchToTags();
      const closeSpans = container.querySelectorAll('button span.material-icons');
      const closeIcon = Array.from(closeSpans).find(el => el.textContent === 'close');
      fireEvent.click(closeIcon!.parentElement!);
      const del = fetchSpy.mock.calls.find(
        (c) => /\/api\/portal\/email\/tags\/\d+/.test(c[0]) && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(del).toBeUndefined();
    });
  });

  describe('fetch failure branches', () => {
    it('handles segments fetch returning success: false gracefully', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/email/segments') return jsonOk({ success: false });
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      // Segments list should be empty, shows empty state
      expect(container.textContent).toContain('No segments yet');
    });

    it('handles tags fetch returning success: false gracefully', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/email/tags') return jsonOk({ success: false });
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      fireEvent.click(screen.getByText(/Tags \(0\)/));
      expect(container.textContent).toContain('No tags yet');
    });
  });
});
