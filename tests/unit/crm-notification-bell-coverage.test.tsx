// @vitest-environment jsdom
/**
 * Coverage tests for components/portal/CrmNotificationBell.tsx
 *
 * Exercises:
 *   - open/close toggle
 *   - fetch on mount + polling interval
 *   - fetch on dropdown open
 *   - empty / loading / populated states
 *   - filterUnread toggle
 *   - markAllRead (success + failure paths)
 *   - handleItemClick — optimistic read + navigation
 *   - handleMarkReadClick — per-item mark-read
 *   - click-outside closes dropdown
 *   - keyboard navigation (Enter / Space) on items
 *   - relativeTime edge cases (indirectly via rendered timestamps)
 *   - entityUrl / typeIcon / groupLabel / groupNotifications (via render)
 *   - unreadCount badge (> 99 overflow)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the component under test
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import CrmNotificationBell from '@/components/portal/CrmNotificationBell';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchOverride = (url: string, init?: RequestInit) => Promise<Response>;

function makeNotification(overrides: Partial<{
  id: number;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
  createdAt: string;
}> = {}) {
  return {
    id: 1,
    type: 'deal_stage_changed',
    title: 'Deal moved',
    body: 'Stage changed to Qualified',
    entityType: 'deal',
    entityId: 10,
    read: false,
    createdAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    ...overrides,
  };
}

function makeJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

/** Default fetch stub that returns an empty list with zero unread. */
function stubFetchEmpty() {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string) =>
      Promise.resolve(
        makeJsonResponse({ success: true, data: [], unreadCount: 0 }),
      ),
    ),
  );
}

/** Stub fetch with a list of notifications. */
function stubFetchWith(
  items: ReturnType<typeof makeNotification>[],
  unreadCount = 0,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({ success: true, data: items, unreadCount }),
      ),
    ),
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  stubFetchEmpty();
  mockRouterPush.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Bell button render + badge
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — bell button', () => {
  it('renders the bell button with aria-label', async () => {
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const btn = container.querySelector('button[aria-label="Notifications"]');
    expect(btn).toBeTruthy();
  });

  it('does not show a badge when unreadCount is 0', async () => {
    const { container } = render(<CrmNotificationBell />);
    await flush();
    // Badge is a span with numeric content — should not exist
    const badge = Array.from(container.querySelectorAll('span')).find(
      (s) => /^\d+$/.test(s.textContent?.trim() ?? ''),
    );
    expect(badge).toBeUndefined();
  });

  it('shows the unread badge when unreadCount > 0', async () => {
    stubFetchWith([makeNotification()], 3);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const badge = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === '3',
    );
    expect(badge).toBeTruthy();
  });

  it('caps the badge at "99+" when unreadCount > 99', async () => {
    stubFetchWith([], 150);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    expect(container.textContent).toContain('99+');
  });
});

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — open / close', () => {
  it('toggles the dropdown open on bell click', async () => {
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
    });
    expect(container.textContent).toContain('Notifications');
    // The dropdown header renders a "Show unread" button
    expect(container.querySelector('button[aria-pressed]')).toBeTruthy();
  });

  it('closes the dropdown on second bell click', async () => {
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
    });
    await act(async () => {
      fireEvent.click(bell);
    });
    // aria-expanded should be false after second click
    expect(bell.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the dropdown when clicking outside', async () => {
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
    });
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    // Simulate a click outside the container
    await act(async () => {
      fireEvent.mouseDown(document.body);
    });
    expect(bell.getAttribute('aria-expanded')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — fetching', () => {
  it('calls fetch on mount', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeJsonResponse({ success: true, data: [], unreadCount: 0 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CrmNotificationBell />);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/portal/crm/notifications'),
    );
  });

  it('polls again after POLL_INTERVAL_MS (45 s)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeJsonResponse({ success: true, data: [], unreadCount: 0 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CrmNotificationBell />);
    await flush();
    const callsAfterMount = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it('re-fetches when the dropdown is opened', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeJsonResponse({ success: true, data: [], unreadCount: 0 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const callsBeforeOpen = fetchMock.mock.calls.length;
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeOpen);
  });

  it('handles fetch returning ok:false gracefully (no throw)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(makeJsonResponse(null, false))),
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    // Just not throwing is sufficient; badge should remain absent
    expect(container.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
  });

  it('handles network error in fetch gracefully (no throw)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error'))),
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    expect(container.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
  });

  it('handles success:false from fetch gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(makeJsonResponse({ success: false })),
      ),
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    expect(container.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Empty state / filter
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — empty / filter states', () => {
  it('shows "No notifications yet" when list is empty and filter is off', async () => {
    stubFetchEmpty();
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('No notifications yet');
  });

  it('shows "No unread notifications" when filter is on and list is empty', async () => {
    stubFetchEmpty();
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
    });
    const filterBtn = container.querySelector('button[aria-pressed]')!;
    await act(async () => {
      fireEvent.click(filterBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('No unread notifications');
  });

  it('toggles the filter button aria-pressed state', async () => {
    stubFetchEmpty();
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
    });
    const filterBtn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(filterBtn.getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      fireEvent.click(filterBtn);
      await Promise.resolve();
    });
    expect(filterBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows "Showing unread" text when filter is active', async () => {
    stubFetchEmpty();
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
    });
    const filterBtn = container.querySelector('button[aria-pressed]')!;
    await act(async () => {
      fireEvent.click(filterBtn);
    });
    expect(container.textContent).toContain('Showing unread');
  });
});

// ---------------------------------------------------------------------------
// Notifications list rendering (groups, icons, body, timestamps)
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — notification list rendering', () => {
  it('renders a notification with title and body', async () => {
    stubFetchWith([makeNotification({ title: 'Test Notif', body: 'Some body text' })], 1);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Test Notif');
    expect(container.textContent).toContain('Some body text');
  });

  it('renders group header for deal entityType', async () => {
    stubFetchWith([makeNotification({ entityType: 'deal', entityId: 5 })], 1);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Deals');
  });

  it('renders group header for contact entityType', async () => {
    stubFetchWith(
      [makeNotification({ entityType: 'contact', entityId: 3, type: 'contact_created' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Contacts');
  });

  it('renders group header for company entityType', async () => {
    stubFetchWith(
      [makeNotification({ entityType: 'company', entityId: 2, type: 'deal_assigned' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Companies');
  });

  it('renders group header for proposal entityType', async () => {
    stubFetchWith(
      [makeNotification({ entityType: 'proposal', entityId: 7, type: 'proposal_viewed' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Proposals');
  });

  it('renders group header for mcp_approval entityType', async () => {
    stubFetchWith(
      [makeNotification({ entityType: 'mcp_approval', entityId: 8, type: 'mcp_pending_change' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Pending approvals');
  });

  it('renders group header for document entityType', async () => {
    stubFetchWith(
      [makeNotification({ entityType: 'document', entityId: 9, type: 'document_comment_mention' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Documents');
  });

  it('renders group header for unknown entityType via capitalization', async () => {
    stubFetchWith(
      [makeNotification({ entityType: 'custom_thing', entityId: 11, type: 'deal_assigned' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    // groupLabel falls through to charAt(0).toUpperCase() + slice(1)
    expect(container.textContent).toContain('Custom_thing');
  });

  it('renders group header for mention type (null entityType)', async () => {
    stubFetchWith(
      [makeNotification({ entityType: null, entityId: null, type: 'mention' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Mentions');
  });

  it('renders group header for document_comment_mention type (null entityType)', async () => {
    stubFetchWith(
      [makeNotification({ entityType: null, entityId: null, type: 'document_comment_mention' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Document mentions');
  });

  it('renders "Other" group label for unknown type with null entityType', async () => {
    stubFetchWith(
      [makeNotification({ entityType: null, entityId: null, type: 'unknown_type' })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Other');
  });

  it('shows "Open" link for notifications with a known entityType/id', async () => {
    stubFetchWith([makeNotification({ entityType: 'deal', entityId: 10 })], 1);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Open');
  });

  it('shows unread dot indicator for unread notifications', async () => {
    stubFetchWith([makeNotification({ read: false })], 1);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const dot = container.querySelector('[aria-label="Unread"]');
    expect(dot).toBeTruthy();
  });

  it('does not show unread dot for already-read notifications', async () => {
    stubFetchWith([makeNotification({ read: true })], 0);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[aria-label="Unread"]')).toBeNull();
  });

  it('renders notification without body (null body)', async () => {
    stubFetchWith([makeNotification({ body: null })], 1);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Should render title without throwing
    expect(container.textContent).toContain('Deal moved');
  });

  it('renders relative time "just now" for very recent notifications', async () => {
    stubFetchWith(
      [makeNotification({ createdAt: new Date(Date.now() - 5_000).toISOString() })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('just now');
  });

  it('renders relative time in minutes', async () => {
    stubFetchWith(
      [makeNotification({ createdAt: new Date(Date.now() - 5 * 60_000).toISOString() })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('m ago');
  });

  it('renders relative time in hours', async () => {
    stubFetchWith(
      [makeNotification({ createdAt: new Date(Date.now() - 3 * 3600_000).toISOString() })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('h ago');
  });

  it('renders relative time in days', async () => {
    stubFetchWith(
      [makeNotification({ createdAt: new Date(Date.now() - 3 * 86400_000).toISOString() })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('d ago');
  });

  it('renders relative time in months', async () => {
    stubFetchWith(
      [makeNotification({ createdAt: new Date(Date.now() - 45 * 86400_000).toISOString() })],
      1,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('mo ago');
  });
});

// ---------------------------------------------------------------------------
// Mark-all-read
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — markAllRead', () => {
  it('shows "Mark all read" button when there are unread notifications', async () => {
    stubFetchWith([makeNotification()], 2);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const markAllBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark all read'),
    );
    expect(markAllBtn).toBeTruthy();
  });

  it('does not show "Mark all read" button when unreadCount is 0', async () => {
    stubFetchWith([makeNotification({ read: true })], 0);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const markAllBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark all read'),
    );
    expect(markAllBtn).toBeUndefined();
  });

  it('calls mark-all-read endpoint and clears unread count on success', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('mark-all-read')) {
        return Promise.resolve(makeJsonResponse({ success: true }, true));
      }
      return Promise.resolve(
        makeJsonResponse({ success: true, data: [makeNotification()], unreadCount: 1 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const markAllBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark all read'),
    )!;
    await act(async () => {
      fireEvent.click(markAllBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    // After mark-all-read the unread dot should be gone
    expect(container.querySelector('[aria-label="Unread"]')).toBeNull();
  });

  it('gracefully handles mark-all-read fetch failure', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('mark-all-read')) {
        return Promise.resolve(makeJsonResponse(null, false));
      }
      return Promise.resolve(
        makeJsonResponse({ success: true, data: [makeNotification()], unreadCount: 1 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const markAllBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark all read'),
    )!;
    // Should not throw
    await act(async () => {
      fireEvent.click(markAllBtn);
      await Promise.resolve();
    });
    expect(container.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
  });

  it('gracefully handles mark-all-read network error', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('mark-all-read')) {
        return Promise.reject(new Error('network'));
      }
      return Promise.resolve(
        makeJsonResponse({ success: true, data: [makeNotification()], unreadCount: 1 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const markAllBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark all read'),
    )!;
    await act(async () => {
      fireEvent.click(markAllBtn);
      await Promise.resolve();
    });
    expect(container.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// handleItemClick — navigation + optimistic read
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — handleItemClick', () => {
  it('marks item read optimistically and navigates to deal URL on click', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/notifications/')) {
        return Promise.resolve(makeJsonResponse({ success: true }, true));
      }
      return Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 10, entityType: 'deal', entityId: 5, read: false })],
          unreadCount: 1,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });

    const item = container.querySelector('[role="button"]') as HTMLElement;
    expect(item).toBeTruthy();
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/5');
  });

  it('navigates to contact URL on click', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 11, entityType: 'contact', entityId: 3, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/contacts/3');
  });

  it('navigates to company URL on click', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 12, entityType: 'company', entityId: 4, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/companies/4');
  });

  it('navigates to proposal URL on click', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 13, entityType: 'proposal', entityId: 6, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/6');
  });

  it('navigates to mcp_approval URL on click', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 14, entityType: 'mcp_approval', entityId: 8, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/approvals?id=8');
  });

  it('navigates to document URL on click', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 15, entityType: 'document', entityId: 9, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/brain/notes/9');
  });

  it('does not navigate when entityUrl returns null (unknown entity)', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ entityType: null, entityId: null, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('triggers handleItemClick via Enter key', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 16, entityType: 'deal', entityId: 5, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/5');
  });

  it('triggers handleItemClick via Space key', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 17, entityType: 'deal', entityId: 5, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(item, { key: ' ' });
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/5');
  });

  it('does not trigger handleItemClick via other keys', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 18, entityType: 'deal', entityId: 5, read: true })],
          unreadCount: 0,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Tab' });
      await Promise.resolve();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleMarkReadClick — per-item mark-read
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — handleMarkReadClick', () => {
  it('shows "Mark read" button on unread notification', async () => {
    stubFetchWith([makeNotification({ read: false })], 1);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const markReadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark read'),
    );
    expect(markReadBtn).toBeTruthy();
  });

  it('marks a single item read optimistically on "Mark read" click', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (typeof url === 'string' && url.match(/\/notifications\/\d+$/)) {
        return Promise.resolve(makeJsonResponse({ success: true }, true));
      }
      return Promise.resolve(
        makeJsonResponse({
          success: true,
          data: [makeNotification({ id: 20, read: false })],
          unreadCount: 1,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });

    const markReadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark read'),
    )!;
    await act(async () => {
      fireEvent.click(markReadBtn);
      await Promise.resolve();
    });

    // After marking read, the "Mark read" button should no longer be present
    // (the item is now read)
    const markReadBtnAfter = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark read'),
    );
    expect(markReadBtnAfter).toBeUndefined();
  });

  it('does not call PATCH for already-read item in handleMarkReadClick', async () => {
    // The handler guards: if (notification.read) return;
    // Verify no PATCH URL is called for a read item's "mark read" interaction.
    // Since read items don't render the button, we just verify the button is absent.
    stubFetchWith([makeNotification({ read: true })], 0);
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    const markReadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark read'),
    );
    expect(markReadBtn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Multiple notifications / grouping
// ---------------------------------------------------------------------------

describe('CrmNotificationBell — grouping', () => {
  it('groups notifications by entityType into separate sections', async () => {
    stubFetchWith(
      [
        makeNotification({ id: 1, entityType: 'deal', entityId: 1, title: 'Deal A' }),
        makeNotification({ id: 2, entityType: 'contact', entityId: 2, title: 'Contact B', type: 'contact_created' }),
        makeNotification({ id: 3, entityType: 'deal', entityId: 3, title: 'Deal C' }),
      ],
      3,
    );
    const { container } = render(<CrmNotificationBell />);
    await flush();
    const bell = container.querySelector('button[aria-label="Notifications"]')!;
    await act(async () => {
      fireEvent.click(bell);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Deals');
    expect(container.textContent).toContain('Contacts');
    expect(container.textContent).toContain('Deal A');
    expect(container.textContent).toContain('Contact B');
    expect(container.textContent).toContain('Deal C');
  });
});
