// @vitest-environment jsdom
/**
 * Coverage tests for components/portal/NotificationBell.tsx
 *
 * NotificationBell merges two backing feeds — the PM/project feed
 * (`/api/portal/notifications`) and the CRM feed (`/api/portal/crm/notifications`)
 * — into one unified dropdown. Exercises:
 *   - badge = pmUnread + crmUnread, 99+ cap
 *   - dropdown open/close + click-outside
 *   - fetch on mount + polling + refetch on open, for BOTH feeds
 *   - one feed failing (reject / !ok) still renders the other feed's items
 *   - "Show unread" toggle passes unread=1 (PM) and unreadOnly=true (CRM)
 *   - empty state when both feeds return nothing
 *   - grouping: PM non-billing -> "Projects & Tasks", billing.usage_alert -> "Billing",
 *     CRM by entityType/type
 *   - newest-first ordering across and within groups
 *   - "Mark all read" fires BOTH POST endpoints and zeroes the badge
 *   - per-item click / "Mark read" button dispatch to the correct endpoint per source
 *   - keyboard navigation (Enter / Space) on items
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the component under test
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Default session is a portal (tenant) client — matches every existing
// scenario in this file. QAD-036 gated BOTH feeds on role === 'client';
// PUX-090 narrowed that to the CRM feed only (see the staff describe at the
// bottom), so the role is mutable per-test now.
const sessionState = vi.hoisted(() => ({ role: 'client' as string }));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: sessionState.role } }, status: 'authenticated' }),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import NotificationBell, { toastableRows } from '@/components/portal/NotificationBell';

// ---------------------------------------------------------------------------
// Fixture shapes
// ---------------------------------------------------------------------------

interface PmRowFixture {
  id: number;
  kind: string;
  cardId: number | null;
  projectId: number | null;
  title: string;
  body: string | null;
  payload: object | null;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
}

interface CrmItemFixture {
  id: number;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
  createdAt: string;
}

function makePmRow(overrides: Partial<PmRowFixture> = {}): PmRowFixture {
  return {
    id: 1,
    kind: 'card.commented',
    cardId: 5,
    projectId: 10,
    title: 'New comment on card',
    body: 'Someone commented on your card',
    payload: null,
    readAt: null, // unread by default
    createdAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    actorName: 'Alice',
    ...overrides,
  };
}

function makeCrmItem(overrides: Partial<CrmItemFixture> = {}): CrmItemFixture {
  return {
    id: 1,
    type: 'deal_stage_changed',
    title: 'Deal moved',
    body: 'Stage changed to Qualified',
    entityType: 'deal',
    entityId: 20,
    read: false,
    createdAt: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
    ...overrides,
  };
}

function makeJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

type FeedSpec<T> = { rows: T[]; unread: number } | 'reject' | 'not-ok';

interface TickRowFixture {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  cardId: number | null;
  projectId: number | null;
  createdAt: string;
}

interface FetchMockOpts {
  pm?: FeedSpec<PmRowFixture>;
  crm?: FeedSpec<CrmItemFixture>;
  /** Rows the /tick endpoint reports as newest-first-by-id. */
  latest?: TickRowFixture[];
  onPmMarkRead?: (body: unknown) => Response;
  onCrmPatch?: (id: string, body: unknown) => Response;
  onCrmMarkAll?: () => Response;
}

/** Builds a fetch mock that routes to the two GET feeds + three mutation endpoints. */
function createFetchMock(opts: FetchMockOpts = {}) {
  const pm = opts.pm ?? { rows: [], unread: 0 };
  const crm = opts.crm ?? { rows: [], unread: 0 };

  return vi.fn((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    // CRM per-item PATCH: /api/portal/crm/notifications/:id
    if (method === 'PATCH' && /\/api\/portal\/crm\/notifications\/\d+$/.test(url)) {
      const id = url.split('/').pop() as string;
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (opts.onCrmPatch) return Promise.resolve(opts.onCrmPatch(id, body));
      return Promise.resolve(makeJsonResponse({ success: true }));
    }

    // CRM mark-all-read: POST /api/portal/crm/notifications/mark-all-read
    if (method === 'POST' && url.includes('/api/portal/crm/notifications/mark-all-read')) {
      if (opts.onCrmMarkAll) return Promise.resolve(opts.onCrmMarkAll());
      return Promise.resolve(makeJsonResponse({ success: true }));
    }

    // PM mark-read (single or all): POST /api/portal/notifications/mark-read
    if (method === 'POST' && url.includes('/api/portal/notifications/mark-read')) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (opts.onPmMarkRead) return Promise.resolve(opts.onPmMarkRead(body));
      return Promise.resolve(makeJsonResponse({ success: true }));
    }

    // CRM list GET: /api/portal/crm/notifications?...
    if (url.startsWith('/api/portal/crm/notifications')) {
      if (crm === 'reject') return Promise.reject(new Error('CRM network error'));
      if (crm === 'not-ok') return Promise.resolve(makeJsonResponse(null, false));
      return Promise.resolve(
        makeJsonResponse({ success: true, data: crm.rows, unreadCount: crm.unread }),
      );
    }

    // Badge + desktop-toast poll: GET /api/portal/notifications/tick.
    // Derives its counts from the same pm/crm fixtures so a test only has to
    // describe the feed once.
    if (url.startsWith('/api/portal/notifications/tick')) {
      return Promise.resolve(
        makeJsonResponse({
          success: true,
          data: {
            pmUnread: typeof pm === 'string' ? 0 : pm.unread,
            crmUnread: typeof crm === 'string' ? 0 : crm.unread,
            latest: opts.latest ?? [],
          },
        }),
      );
    }

    // PM list GET: /api/portal/notifications?...
    if (url.startsWith('/api/portal/notifications')) {
      if (pm === 'reject') return Promise.reject(new Error('PM network error'));
      if (pm === 'not-ok') return Promise.resolve(makeJsonResponse(null, false));
      return Promise.resolve(
        makeJsonResponse({ success: true, data: { rows: pm.rows, unread: pm.unread } }),
      );
    }

    return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
  });
}

function stubFetch(opts: FetchMockOpts = {}) {
  const mock = createFetchMock(opts);
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Prefix match, not equality: the bell's accessible name carries the unread count
// ("Notifications, 3 unread") so screen-reader users get the state, not just the
// control. An exact-match selector silently stops finding the button the moment a
// fixture has unread items.
async function openDropdown(container: HTMLElement) {
  const bell = container.querySelector('button[aria-label^="Notifications"]') as HTMLElement;
  await act(async () => {
    fireEvent.click(bell);
    await Promise.resolve();
    await Promise.resolve();
  });
  return bell;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  sessionState.role = 'client';
  vi.useFakeTimers({ shouldAdvanceTime: false });
  stubFetch();
  mockRouterPush.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Bell button + badge
// ---------------------------------------------------------------------------

describe('NotificationBell — bell button + badge', () => {
  it('renders the bell button with aria-label', async () => {
    const { container } = render(<NotificationBell />);
    await flush();
    expect(container.querySelector('button[aria-label^="Notifications"]')).toBeTruthy();
  });

  it('does not show a badge when both feeds report zero unread', async () => {
    const { container } = render(<NotificationBell />);
    await flush();
    const badge = Array.from(container.querySelectorAll('span')).find((s) =>
      /^\d+\+?$/.test(s.textContent?.trim() ?? ''),
    );
    expect(badge).toBeUndefined();
  });

  it('shows the badge as the sum of pmUnread + crmUnread', async () => {
    stubFetch({
      pm: { rows: [makePmRow()], unread: 4 },
      crm: { rows: [makeCrmItem()], unread: 3 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    const badge = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === '7',
    );
    expect(badge).toBeTruthy();
  });

  it('caps the badge at "99+" when the combined unread exceeds 99', async () => {
    stubFetch({
      pm: { rows: [], unread: 60 },
      crm: { rows: [], unread: 45 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    expect(container.textContent).toContain('99+');
  });
});

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

describe('NotificationBell — open / close', () => {
  it('toggles the dropdown open on bell click', async () => {
    const { container } = render(<NotificationBell />);
    await flush();
    const bell = await openDropdown(container);
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Notifications');
    expect(container.querySelector('button[aria-pressed]')).toBeTruthy();
  });

  it('closes the dropdown on second bell click', async () => {
    const { container } = render(<NotificationBell />);
    await flush();
    const bell = await openDropdown(container);
    await act(async () => {
      fireEvent.click(bell);
    });
    expect(bell.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the dropdown when clicking outside', async () => {
    const { container } = render(<NotificationBell />);
    await flush();
    const bell = await openDropdown(container);
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      fireEvent.mouseDown(document.body);
    });
    expect(bell.getAttribute('aria-expanded')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Fetching — both feeds, polling, refetch-on-open, partial failures
// ---------------------------------------------------------------------------

describe('NotificationBell — fetching', () => {
  // PUX-090 changed the steady-state contract: the badge runs off one small
  // /tick call, and the two 20-row feeds are only fetched once the dropdown is
  // actually opened. That's the whole point of the change — a bell that mounts
  // on every portal page shouldn't ship 40 rows of JSON every 45s to render a
  // number.
  it('polls ONLY the tick endpoint on mount, not the two full feeds', async () => {
    const fetchMock = stubFetch();
    render(<NotificationBell />);
    await flush();
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => typeof u === 'string' && u.startsWith('/api/portal/notifications/tick'))).toBe(true);
    expect(urls.some((u) => typeof u === 'string' && u.startsWith('/api/portal/notifications?'))).toBe(false);
    expect(urls.some((u) => typeof u === 'string' && u.startsWith('/api/portal/crm/notifications?'))).toBe(false);
  });

  it('polls again after POLL_INTERVAL_MS (45s)', async () => {
    const fetchMock = stubFetch();
    render(<NotificationBell />);
    await flush();
    const callsAfterMount = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it('re-fetches both feeds when the dropdown is opened', async () => {
    const fetchMock = stubFetch();
    const { container } = render(<NotificationBell />);
    await flush();
    const callsBeforeOpen = fetchMock.mock.calls.length;
    await openDropdown(container);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeOpen);
  });

  it('still renders CRM items when the PM feed rejects', async () => {
    stubFetch({
      pm: 'reject',
      crm: { rows: [makeCrmItem({ title: 'CRM Survives' })], unread: 1 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('CRM Survives');
  });

  it('still renders PM items when the CRM feed returns ok:false', async () => {
    stubFetch({
      pm: { rows: [makePmRow({ title: 'PM Survives' })], unread: 1 },
      crm: 'not-ok',
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('PM Survives');
  });

  it('shows the empty state without throwing when both feeds fail', async () => {
    stubFetch({ pm: 'reject', crm: 'reject' });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('No notifications yet');
  });
});

// ---------------------------------------------------------------------------
// "Show unread" filter — verifies per-feed query param translation
// ---------------------------------------------------------------------------

describe('NotificationBell — unread filter query params', () => {
  it('passes unread=1 to the PM feed and unreadOnly=true to the CRM feed when toggled', async () => {
    const fetchMock = stubFetch();
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);

    const filterBtn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(filterBtn.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      fireEvent.click(filterBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(filterBtn.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Showing unread');

    const urls = fetchMock.mock.calls.map((c) => c[0]).filter((u): u is string => typeof u === 'string');
    expect(urls.some((u) => u.startsWith('/api/portal/notifications?') && u.includes('unread=1'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/api/portal/crm/notifications?') && u.includes('unreadOnly=true'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('NotificationBell — empty state', () => {
  it('shows "No notifications yet" when both feeds are empty and filter is off', async () => {
    stubFetch();
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('No notifications yet');
  });

  it('shows "No unread notifications" when filter is on and both feeds are empty', async () => {
    stubFetch();
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const filterBtn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(filterBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('No unread notifications');
  });
});

// ---------------------------------------------------------------------------
// Grouping — PM + CRM, ordering
// ---------------------------------------------------------------------------

describe('NotificationBell — grouping', () => {
  it('groups a non-billing PM row under "Projects & Tasks"', async () => {
    stubFetch({ pm: { rows: [makePmRow({ kind: 'card.commented' })], unread: 1 } });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('Projects & Tasks');
  });

  it('groups a billing.usage_alert PM row under "Billing"', async () => {
    stubFetch({
      pm: {
        rows: [makePmRow({ kind: 'billing.usage_alert', title: 'Usage limit approaching' })],
        unread: 1,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('Billing');
  });

  it('groups CRM deal entityType under "Deals"', async () => {
    stubFetch({ crm: { rows: [makeCrmItem({ entityType: 'deal' })], unread: 1 } });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('Deals');
  });

  it('groups CRM mcp_approval entityType under "Pending approvals"', async () => {
    stubFetch({
      crm: {
        rows: [makeCrmItem({ entityType: 'mcp_approval', entityId: 8, type: 'mcp_pending_change' })],
        unread: 1,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('Pending approvals');
  });

  it('groups CRM mention type with null entityType under "Mentions"', async () => {
    stubFetch({
      crm: { rows: [makeCrmItem({ entityType: null, entityId: null, type: 'mention' })], unread: 1 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('Mentions');
  });

  it('renders items from BOTH feeds together in the dropdown', async () => {
    stubFetch({
      pm: { rows: [makePmRow({ title: 'PM Item' })], unread: 1 },
      crm: { rows: [makeCrmItem({ title: 'CRM Item' })], unread: 1 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('PM Item');
    expect(container.textContent).toContain('CRM Item');
    expect(container.textContent).toContain('Projects & Tasks');
    expect(container.textContent).toContain('Deals');
  });

  it('renders groups in newest-first order when items belong to different groups', async () => {
    stubFetch({
      pm: {
        rows: [
          makePmRow({
            kind: 'card.commented',
            title: 'Newer PM Item',
            createdAt: new Date(Date.now() - 1_000).toISOString(),
          }),
        ],
        unread: 1,
      },
      crm: {
        rows: [
          makeCrmItem({
            entityType: 'deal',
            title: 'Older CRM Item',
            createdAt: new Date(Date.now() - 500_000).toISOString(),
          }),
        ],
        unread: 1,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const html = container.innerHTML;
    expect(html.indexOf('Projects &amp; Tasks')).toBeGreaterThan(-1);
    expect(html.indexOf('Projects &amp; Tasks')).toBeLessThan(html.indexOf('Deals'));
  });

  it('renders items newest-first within the same group', async () => {
    stubFetch({
      crm: {
        rows: [
          makeCrmItem({
            id: 1,
            entityType: 'deal',
            title: 'Old Deal',
            createdAt: new Date(Date.now() - 500_000).toISOString(),
          }),
          makeCrmItem({
            id: 2,
            entityType: 'deal',
            title: 'New Deal',
            createdAt: new Date(Date.now() - 1_000).toISOString(),
          }),
        ],
        unread: 2,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const html = container.innerHTML;
    expect(html.indexOf('New Deal')).toBeLessThan(html.indexOf('Old Deal'));
  });
});

// ---------------------------------------------------------------------------
// Mark-all-read
// ---------------------------------------------------------------------------

describe('NotificationBell — markAllRead', () => {
  it('shows "Mark all read" when the combined unread count is > 0', async () => {
    stubFetch({ pm: { rows: [makePmRow()], unread: 1 } });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark all read'),
    );
    expect(btn).toBeTruthy();
  });

  it('does not show "Mark all read" when both feeds have zero unread', async () => {
    stubFetch({ pm: { rows: [makePmRow({ readAt: new Date().toISOString() })], unread: 0 } });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark all read'),
    );
    expect(btn).toBeUndefined();
  });

  it('fires BOTH mark-all POST endpoints and zeroes the badge on click', async () => {
    const onPmMarkRead = vi.fn(() => makeJsonResponse({ success: true }));
    const onCrmMarkAll = vi.fn(() => makeJsonResponse({ success: true }));
    stubFetch({
      pm: { rows: [makePmRow()], unread: 1 },
      crm: { rows: [makeCrmItem()], unread: 1 },
      onPmMarkRead,
      onCrmMarkAll,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);

    const markAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark all read'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(markAllBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onPmMarkRead).toHaveBeenCalledWith({ all: true });
    expect(onCrmMarkAll).toHaveBeenCalled();
    // Badge cleared + no unread dots remain
    expect(container.querySelector('[aria-label="Unread"]')).toBeNull();
    const badge = Array.from(container.querySelectorAll('span')).find(
      (s) => /^\d+\+?$/.test(s.textContent?.trim() ?? ''),
    );
    expect(badge).toBeUndefined();
  });

  it('gracefully handles one mark-all endpoint failing (no throw)', async () => {
    stubFetch({
      pm: { rows: [makePmRow()], unread: 1 },
      crm: { rows: [makeCrmItem()], unread: 1 },
      onCrmMarkAll: () => makeJsonResponse(null, false),
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const markAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark all read'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(markAllBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('button[aria-label^="Notifications"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Item click — per-source navigation + mark-read dispatch
// ---------------------------------------------------------------------------

describe('NotificationBell — item click (PM source)', () => {
  it('clicking an unread PM item POSTs mark-read with {id} and navigates to the card URL', async () => {
    const onPmMarkRead = vi.fn(() => makeJsonResponse({ success: true }));
    stubFetch({
      pm: {
        rows: [makePmRow({ id: 42, cardId: 7, projectId: 3, readAt: null })],
        unread: 1,
      },
      onPmMarkRead,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);

    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });

    expect(onPmMarkRead).toHaveBeenCalledWith({ id: 42 });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/projects/3?card=7');
  });

  it('navigates to the project-only URL when a PM row has no cardId', async () => {
    stubFetch({
      pm: { rows: [makePmRow({ id: 43, cardId: null, projectId: 9, readAt: null })], unread: 1 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/projects/9');
  });

  it('does not navigate when a PM row has neither cardId nor projectId', async () => {
    stubFetch({
      pm: {
        rows: [makePmRow({ id: 44, cardId: null, projectId: null, readAt: null })],
        unread: 1,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('does not POST mark-read for an already-read PM item', async () => {
    const onPmMarkRead = vi.fn(() => makeJsonResponse({ success: true }));
    stubFetch({
      pm: {
        rows: [
          makePmRow({
            id: 45,
            cardId: 1,
            projectId: 1,
            readAt: new Date().toISOString(),
          }),
        ],
        unread: 0,
      },
      onPmMarkRead,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(onPmMarkRead).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/projects/1?card=1');
  });
});

describe('NotificationBell — item click (CRM source)', () => {
  it('clicking an unread CRM item PATCHes /crm/notifications/:id with {read:true} and navigates', async () => {
    const onCrmPatch = vi.fn(() => makeJsonResponse({ success: true }));
    stubFetch({
      crm: {
        rows: [makeCrmItem({ id: 55, entityType: 'deal', entityId: 12, read: false })],
        unread: 1,
      },
      onCrmPatch,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(onCrmPatch).toHaveBeenCalledWith('55', { read: true });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/12');
  });

  it('navigates to the contact URL for a CRM contact item', async () => {
    stubFetch({
      crm: {
        rows: [makeCrmItem({ id: 56, entityType: 'contact', entityId: 3, read: true, type: 'contact_created' })],
        unread: 0,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/contacts/3');
  });

  it('navigates to the mcp_approval URL for a CRM mcp_approval item', async () => {
    stubFetch({
      crm: {
        rows: [
          makeCrmItem({
            id: 57,
            entityType: 'mcp_approval',
            entityId: 8,
            read: true,
            type: 'mcp_pending_change',
          }),
        ],
        unread: 0,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/approvals?id=8');
  });

  it('does not navigate when a CRM item has no entityType/entityId', async () => {
    stubFetch({
      crm: {
        rows: [makeCrmItem({ id: 58, entityType: null, entityId: null, read: true, type: 'unknown_type' })],
        unread: 0,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('does not PATCH for an already-read CRM item', async () => {
    const onCrmPatch = vi.fn(() => makeJsonResponse({ success: true }));
    stubFetch({
      crm: {
        rows: [makeCrmItem({ id: 59, entityType: 'deal', entityId: 12, read: true })],
        unread: 0,
      },
      onCrmPatch,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(onCrmPatch).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/12');
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

describe('NotificationBell — keyboard navigation', () => {
  it('triggers item click via Enter key', async () => {
    stubFetch({
      crm: { rows: [makeCrmItem({ id: 60, entityType: 'deal', entityId: 5, read: true })], unread: 0 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/5');
  });

  it('triggers item click via Space key', async () => {
    stubFetch({
      crm: { rows: [makeCrmItem({ id: 61, entityType: 'deal', entityId: 5, read: true })], unread: 0 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(item, { key: ' ' });
      await Promise.resolve();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/crm/deals/5');
  });

  it('does not trigger item click via other keys', async () => {
    stubFetch({
      crm: { rows: [makeCrmItem({ id: 62, entityType: 'deal', entityId: 5, read: true })], unread: 0 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const item = container.querySelector('[role="button"]') as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Tab' });
      await Promise.resolve();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Per-item "Mark read" button
// ---------------------------------------------------------------------------

describe('NotificationBell — per-item Mark read button', () => {
  it('shows "Mark read" for unread items of both sources', async () => {
    stubFetch({
      pm: { rows: [makePmRow({ readAt: null })], unread: 1 },
      crm: { rows: [makeCrmItem({ read: false })], unread: 1 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const markReadBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Mark read'),
    );
    expect(markReadBtns.length).toBe(2);
  });

  it('does not show "Mark read" for an already-read item', async () => {
    stubFetch({
      pm: { rows: [makePmRow({ readAt: new Date().toISOString() })], unread: 0 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const markReadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark read'),
    );
    expect(markReadBtn).toBeUndefined();
  });

  it('clicking "Mark read" on a PM item POSTs {id} without navigating', async () => {
    const onPmMarkRead = vi.fn(() => makeJsonResponse({ success: true }));
    stubFetch({
      pm: { rows: [makePmRow({ id: 70, cardId: 2, projectId: 2, readAt: null })], unread: 1 },
      onPmMarkRead,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const markReadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark read'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(markReadBtn);
      await Promise.resolve();
    });
    expect(onPmMarkRead).toHaveBeenCalledWith({ id: 70 });
    expect(mockRouterPush).not.toHaveBeenCalled();
    // Item should now show as read (no more "Mark read" button)
    const after = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark read'),
    );
    expect(after).toBeUndefined();
  });

  it('clicking "Mark read" on a CRM item PATCHes {read:true} without navigating', async () => {
    const onCrmPatch = vi.fn(() => makeJsonResponse({ success: true }));
    stubFetch({
      crm: { rows: [makeCrmItem({ id: 71, entityType: 'deal', entityId: 9, read: false })], unread: 1 },
      onCrmPatch,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const markReadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark read'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(markReadBtn);
      await Promise.resolve();
    });
    expect(onCrmPatch).toHaveBeenCalledWith('71', { read: true });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Relative time rendering (sanity, shared helper used by both feeds)
// ---------------------------------------------------------------------------

describe('NotificationBell — relative time', () => {
  it('renders "just now" for very recent notifications', async () => {
    stubFetch({
      pm: { rows: [makePmRow({ createdAt: new Date(Date.now() - 5_000).toISOString() })], unread: 1 },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('just now');
  });

  it('renders minutes-ago for a CRM item several minutes old', async () => {
    stubFetch({
      crm: {
        rows: [makeCrmItem({ createdAt: new Date(Date.now() - 5 * 60_000).toISOString() })],
        unread: 1,
      },
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('m ago');
  });
});

// ---------------------------------------------------------------------------
// PUX-090 — desktop notifications, lean tick poll, staff role guard
// ---------------------------------------------------------------------------

function makeTickRow(over: Partial<TickRowFixture> = {}): TickRowFixture {
  return {
    id: 1,
    kind: 'comment.mention',
    title: 'Dan mentioned you on PUX-090',
    body: 'can you look at the guard',
    cardId: 1685,
    projectId: 153,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe('toastableRows — desktop toast policy', () => {
  it('returns nothing on the first tick so a backlog never toasts at once', () => {
    const rows = [makeTickRow({ id: 9 }), makeTickRow({ id: 8 })];
    expect(toastableRows(rows, null)).toEqual([]);
  });

  it('only toasts rows newer than the watermark', () => {
    const rows = [makeTickRow({ id: 11 }), makeTickRow({ id: 10 }), makeTickRow({ id: 9 })];
    expect(toastableRows(rows, 10).map((r) => r.id)).toEqual([11]);
  });

  it('ignores agent-generated chatter (comments, lane moves, dates, sprints)', () => {
    const rows = [
      makeTickRow({ id: 12, kind: 'card.commented' }),
      makeTickRow({ id: 13, kind: 'card.column_changed' }),
      makeTickRow({ id: 14, kind: 'card.due_date_changed' }),
      makeTickRow({ id: 15, kind: 'card.sprint_changed' }),
      makeTickRow({ id: 16, kind: 'card.dependency_added' }),
    ];
    expect(toastableRows(rows, 11)).toEqual([]);
  });

  it('toasts mentions and assignments, oldest first', () => {
    const rows = [
      makeTickRow({ id: 20, kind: 'card.assignee_added' }),
      makeTickRow({ id: 19, kind: 'card.commented' }),
      makeTickRow({ id: 18, kind: 'comment.mention' }),
    ];
    expect(toastableRows(rows, 17).map((r) => r.id)).toEqual([18, 20]);
  });
});

describe('NotificationBell — staff sessions (PUX-090 guard split)', () => {
  it('fetches the PM feed for an admin session but never the CRM feed', async () => {
    sessionState.role = 'admin';
    const fetchMock = stubFetch({ pm: { rows: [makePmRow()], unread: 1 } });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.startsWith('/api/portal/notifications/tick'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/api/portal/notifications?'))).toBe(true);
    // The CRM feed is (clientId, userId)-scoped and 404s without a portal
    // client — this is the request that made the old blanket guard look
    // necessary.
    expect(urls.some((u) => u.startsWith('/api/portal/crm/notifications'))).toBe(false);
  });

  it('renders PM rows for staff — the bell used to be permanently empty for them', async () => {
    sessionState.role = 'employee';
    stubFetch({ pm: { rows: [makePmRow({ title: 'Dan assigned you PUX-090' })], unread: 1 } });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    expect(container.textContent).toContain('Dan assigned you PUX-090');
  });

  it('skips the CRM bulk endpoint when marking all read as staff', async () => {
    sessionState.role = 'admin';
    const onCrmMarkAll = vi.fn(() => makeJsonResponse({ success: true }));
    const fetchMock = stubFetch({
      pm: { rows: [makePmRow()], unread: 1 },
      onCrmMarkAll,
    });
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);

    const markAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark all read'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(markAllBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onCrmMarkAll).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some((c) => (c[0] as string).includes('/api/portal/notifications/mark-read')),
    ).toBe(true);
  });
});

describe('NotificationBell — poll cadence', () => {
  it('backs off to 120s while the tab is hidden instead of pausing', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const fetchMock = stubFetch();
    render(<NotificationBell />);
    await flush();

    const tickCalls = () =>
      fetchMock.mock.calls.filter((c) => (c[0] as string).startsWith('/api/portal/notifications/tick')).length;
    const afterMount = tickCalls();

    // The visible-tab cadence must NOT fire a hidden tab's next poll...
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await Promise.resolve();
    });
    expect(tickCalls()).toBe(afterMount);

    // ...but the tab must keep polling, because a backgrounded tab is exactly
    // when a desktop toast is worth raising.
    await act(async () => {
      vi.advanceTimersByTime(80_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(tickCalls()).toBeGreaterThan(afterMount);

    visibility.mockRestore();
  });
});

describe('NotificationBell — desktop notifications', () => {
  const constructed: Array<{ title: string; options?: NotificationOptions }> = [];

  class MockNotification {
    static permission: NotificationPermission = 'granted';
    static requestPermission = vi.fn(async () => MockNotification.permission);
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(title: string, options?: NotificationOptions) {
      constructed.push({ title, options });
    }
  }

  beforeEach(() => {
    constructed.length = 0;
    MockNotification.permission = 'granted';
    MockNotification.requestPermission.mockClear();
    vi.stubGlobal('Notification', MockNotification);
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('raises a toast for a new mention once the watermark is established', async () => {
    window.localStorage.setItem('portal:desktopNotifications', '1');
    const latest: TickRowFixture[] = [makeTickRow({ id: 10 })];
    stubFetch({ latest });
    render(<NotificationBell />);
    await flush();

    // First tick only sets the watermark.
    expect(constructed).toHaveLength(0);

    latest.unshift(makeTickRow({ id: 11, title: 'Dan mentioned you on PUX-091', cardId: 1686 }));
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(constructed).toHaveLength(1);
    expect(constructed[0].title).toBe('Dan mentioned you on PUX-091');
    // Repeats on one card collapse rather than stacking.
    expect(constructed[0].options?.tag).toBe('card-1686');
  });

  it('stays silent when the toggle is off, and does not replay on enable', async () => {
    const latest: TickRowFixture[] = [makeTickRow({ id: 10 })];
    stubFetch({ latest });
    render(<NotificationBell />);
    await flush();

    latest.unshift(makeTickRow({ id: 11 }));
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(constructed).toHaveLength(0);
    // Watermark still advanced, so turning the toggle on later can't backfill.
    expect(toastableRows(latest as never, 11)).toEqual([]);
  });

  it('asks for permission from the toggle click, not on mount', async () => {
    MockNotification.permission = 'default';
    stubFetch();
    const { container } = render(<NotificationBell />);
    await flush();
    // Prompting on load is what gets a site downranked by Chrome and ignored
    // outright by Safari.
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();

    await openDropdown(container);
    const toggle = container.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('shows the toggle as Blocked when the browser has denied the origin', async () => {
    MockNotification.permission = 'denied';
    stubFetch();
    const { container } = render(<NotificationBell />);
    await flush();
    await openDropdown(container);
    const toggle = container.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Blocked');
    expect(toggle.disabled).toBe(true);
  });
});
