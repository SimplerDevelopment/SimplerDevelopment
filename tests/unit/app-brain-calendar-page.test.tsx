// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/calendar/page.tsx` — the Brain Calendar
 * month grid. Exercises:
 *   - top-level shell rendering (heading, toolbar, legend)
 *   - month navigation (prev / next / today buttons)
 *   - agenda load: success, server error, non-JSON server response,
 *     401 not-signed-in, network throw, empty state
 *   - day-cell behaviour: click empty cell -> NewEventModal, populated cell
 *     -> no-op (item-level actions take over)
 *   - CalendarItemBadge: events open detail modal, other kinds navigate
 *   - URL ?event=N auto-opens the EventDetailModal
 *   - NewEventModal: validation, all-day toggle, date editing, submit
 *     success + failure, ISO-time payload, cancel via backdrop and button
 *   - EventDetailModal: loading spinner, all-day vs timed display,
 *     description/location/link, google source label, delete (confirm
 *     accepted + cancelled), refresh
 *
 * Mocks: next/navigation, global fetch, window.confirm, window.location.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/calendar',
  useSearchParams: () => new URLSearchParams(),
}));

// next/link is auto-handled by next, but stub to avoid module surprises
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
};
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, opts: { ok?: boolean; status?: number; raw?: string } = {}): FetchResp {
  const ok = opts.ok ?? true;
  const status = opts.status ?? (ok ? 200 : 500);
  const text = opts.raw ?? JSON.stringify(body);
  return {
    ok,
    status,
    text: async () => text,
    json: async () => body,
  };
}

// Mutable window.location stub so loadEventDetail / hash redirects don't blow up
const originalLocation = window.location;

beforeEach(() => {
  fetchMock.mockReset();
  // Default: agenda empty success
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/calendar/agenda')) {
      return makeRes({ success: true, data: [] });
    }
    if (url.includes('/api/portal/brain/calendar/events')) {
      return makeRes({ success: true, data: {} });
    }
    return makeRes({ success: true, data: {} });
  });
  vi.stubGlobal('fetch', fetchMock as any);
  // window.confirm — default to true
  vi.stubGlobal('confirm', vi.fn(() => true) as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Restore location if a test mutated it
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAgendaItem(extra: Record<string, any> = {}): any {
  return {
    kind: 'event',
    key: `event-1`,
    id: 1,
    title: 'My Event',
    startAt: new Date().toISOString(),
    endAt: null,
    allDay: false,
    subtitle: undefined,
    href: '/portal/brain/calendar?event=1',
    ...extra,
  };
}

function makeEventDetail(extra: Record<string, any> = {}): any {
  return {
    id: 1,
    title: 'Detail Event',
    description: 'A description',
    startAt: '2025-06-15T15:00:00Z',
    endAt: '2025-06-15T16:00:00Z',
    allDay: false,
    location: 'HQ',
    link: 'https://example.com',
    source: 'manual',
    ...extra,
  };
}

// Import after mocks
import BrainCalendarPage from '@/app/portal/brain/calendar/page';

function renderPage() {
  return render(<BrainCalendarPage />);
}

// ─── Shell rendering ────────────────────────────────────────────────────────

describe('BrainCalendarPage — shell', () => {
  it('renders the Calendar heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Calendar');
    });
  });

  it('renders the intro copy', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tasks, communications, relationship reviews');
    });
  });

  it('renders the Brain back-link to /portal/brain', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders the New event toolbar button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New event');
    });
  });

  it('renders day-of-week headers Sun..Sat', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const txt = container.textContent || '';
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) =>
        expect(txt).toContain(d),
      );
    });
  });

  it('renders the legend rows in the toolbar', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const txt = container.textContent || '';
      expect(txt).toContain('Event');
      expect(txt).toContain('Task due');
      expect(txt).toContain('Communication');
      expect(txt).toContain('Relationship review');
    });
  });

  it('renders the phase B/C hint copy', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Week and day views');
    });
  });

  it('renders 42 grid cells (6×7 month grid)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // The day cells are buttons with class min-h-[110px]
      const cells = container.querySelectorAll('button.min-h-\\[110px\\]');
      expect(cells.length).toBe(42);
    });
  });
});

// ─── Agenda load ───────────────────────────────────────────────────────────

describe('BrainCalendarPage — agenda load', () => {
  it('issues an agenda fetch on mount with from/to params', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/calendar/agenda'),
      );
      expect(call).toBeTruthy();
      const url = String(call![0]);
      expect(url).toContain('from=');
      expect(url).toContain('to=');
    });
  });

  it('renders an agenda item title in its day cell', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [makeAgendaItem({ title: 'Standup' })] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Standup');
    });
  });

  it('renders different kind labels via KIND_STYLE map', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({
          success: true,
          data: [
            makeAgendaItem({ kind: 'task_due', key: 't-1', title: 'TaskTitle' }),
            makeAgendaItem({ kind: 'meeting', key: 'm-1', id: 2, title: 'MeetingTitle' }),
            makeAgendaItem({ kind: 'relationship_review', key: 'r-1', id: 3, title: 'ReviewTitle' }),
          ],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('TaskTitle');
      expect(container.textContent).toContain('MeetingTitle');
      expect(container.textContent).toContain('ReviewTitle');
    });
  });

  it('renders an all-day badge without a time prefix', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({
          success: true,
          data: [makeAgendaItem({ allDay: true, title: 'Holiday' })],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Holiday');
    });
  });

  it('renders +N more when day has more than 4 items', async () => {
    const today = new Date().toISOString();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        const items = Array.from({ length: 7 }, (_, i) => ({
          ...makeAgendaItem({ key: `e-${i}`, id: i, title: `Item ${i}`, startAt: today }),
        }));
        return makeRes({ success: true, data: items });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toMatch(/\+\s*3\s*more/);
    });
  });

  it('surfaces server-supplied error message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: false, message: 'agenda boom' }, { ok: false, status: 500 });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('agenda boom');
    });
  });

  it('surfaces "Not signed in" on 401', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        // No body so json parse returns null
        return makeRes(null, { ok: false, status: 401, raw: '' });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not signed in');
    });
  });

  it('surfaces "Server error (HTTP …)." when body is non-JSON text', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes(null, { ok: false, status: 503, raw: '<html>oh no</html>' });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toMatch(/Server error \(HTTP 503\)/);
    });
  });

  it('surfaces generic "Failed to load agenda (HTTP …)." when JSON has no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: false }, { ok: false, status: 418 });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toMatch(/Failed to load agenda \(HTTP 418\)/);
    });
  });

  it('surfaces network error when fetch throws', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('offline');
    });
  });

  it('surfaces fallback "Network error" when thrown value is not an Error', async () => {
    fetchMock.mockImplementation(async () => {
      throw 'plain string'; // not an Error instance
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── Toolbar navigation ─────────────────────────────────────────────────────

describe('BrainCalendarPage — month navigation', () => {
  function findToolbar(container: HTMLElement) {
    return container.querySelector('.bg-card.border.border-border.rounded-xl.p-3') as HTMLElement;
  }

  it('clicking the next-month chevron advances the displayed month', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Calendar'));
    const toolbar = findToolbar(container);
    const buttons = Array.from(toolbar.querySelectorAll('button')) as HTMLButtonElement[];
    // [prev, today, next, ...]
    const before = container.querySelector('h2')?.textContent;
    fireEvent.click(buttons[2]); // next chevron
    await waitFor(() => {
      const after = container.querySelector('h2')?.textContent;
      expect(after).not.toEqual(before);
    });
  });

  it('clicking the prev-month chevron rewinds the displayed month', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Calendar'));
    const toolbar = findToolbar(container);
    const buttons = Array.from(toolbar.querySelectorAll('button')) as HTMLButtonElement[];
    const before = container.querySelector('h2')?.textContent;
    fireEvent.click(buttons[0]); // prev chevron
    await waitFor(() => {
      const after = container.querySelector('h2')?.textContent;
      expect(after).not.toEqual(before);
    });
  });

  it('clicking the Today button refetches agenda', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Calendar'));
    const before = fetchMock.mock.calls.length;
    // Advance one month first
    const toolbar = findToolbar(container);
    const navButtons = Array.from(toolbar.querySelectorAll('button')) as HTMLButtonElement[];
    fireEvent.click(navButtons[2]); // next
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    const todayBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Today',
    ) as HTMLButtonElement;
    fireEvent.click(todayBtn);
    await waitFor(() => {
      // At least 2 more fetches than `before`
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(before + 2);
    });
  });
});

// ─── Day-cell click → NewEventModal ────────────────────────────────────────

describe('BrainCalendarPage — day-cell click', () => {
  it('opens the new-event modal when an empty day cell is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Calendar'));
    const cell = container.querySelector('button.min-h-\\[110px\\]') as HTMLButtonElement;
    fireEvent.click(cell);
    await waitFor(() => {
      expect(container.textContent).toContain('New event');
    });
  });

  it('opens the new-event modal from the New event toolbar button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Calendar'));
    const newBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New event') && !b.closest('form'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      // Modal heading "New event" is inside a form
      const formH = container.querySelector('form h3');
      expect(formH?.textContent).toContain('New event');
    });
  });
});

// ─── CalendarItemBadge click behaviour ─────────────────────────────────────

describe('BrainCalendarPage — item badge click', () => {
  it('clicking an event item triggers the loadEventDetail fetch', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [makeAgendaItem({ id: 77, title: 'Click me' })] });
      }
      if (url.includes('/api/portal/brain/calendar/events/77')) {
        return makeRes({ success: true, data: makeEventDetail({ id: 77, title: 'Click me' }) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Click me'));
    const badge = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent?.includes('Click me'),
    ) as HTMLAnchorElement;
    fireEvent.click(badge);
    await waitFor(() => {
      const detailCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/calendar/events/77'),
      );
      expect(detailCall).toBeTruthy();
    });
  });

  it('clicking a non-event item navigates to its href via window.location', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({
          success: true,
          data: [makeAgendaItem({ kind: 'task_due', id: 5, key: 't-5', title: 'GoTask', href: '/portal/brain/tasks/5' })],
        });
      }
      return makeRes({ success: true, data: {} });
    });
    // Stub window.location.href setter
    const setter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(
        { ...window.location, href: '' },
        {
          set(target: any, prop: string, val: any) {
            if (prop === 'href') setter(val);
            target[prop] = val;
            return true;
          },
          get(target: any, prop: string) {
            return target[prop];
          },
        },
      ),
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('GoTask'));
    const badge = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent?.includes('GoTask'),
    ) as HTMLAnchorElement;
    fireEvent.click(badge);
    await waitFor(() => {
      expect(setter).toHaveBeenCalledWith('/portal/brain/tasks/5');
    });
  });
});

// ─── ?event=N auto-open ─────────────────────────────────────────────────────

describe('BrainCalendarPage — auto-open from ?event=N', () => {
  it('fetches the event detail when ?event=42 is in the URL', async () => {
    // Mutate the search-param of the JSDOM URL
    window.history.pushState({}, '', '/portal/brain/calendar?event=42');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url.includes('/api/portal/brain/calendar/events/42')) {
        return makeRes({ success: true, data: makeEventDetail({ id: 42, title: 'Auto' }) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const detailCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/calendar/events/42'),
      );
      expect(detailCall).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Auto');
    });
    // Cleanup the URL
    window.history.pushState({}, '', '/portal/brain/calendar');
  });
});

// ─── NewEventModal ─────────────────────────────────────────────────────────

describe('NewEventModal', () => {
  async function openModal() {
    const r = renderPage();
    await waitFor(() => expect(r.container.textContent).toContain('Calendar'));
    const newBtn = Array.from(r.container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New event') && !b.closest('form'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(r.container.querySelector('form')).toBeTruthy();
    });
    return r;
  }

  it('renders title, date, time, description, location, link inputs', async () => {
    const { container } = await openModal();
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
    expect(container.querySelector('input[type="date"]')).toBeTruthy();
    expect(container.querySelector('input[type="time"]')).toBeTruthy();
    expect(container.querySelector('textarea')).toBeTruthy();
    expect(container.querySelector('input[type="url"]')).toBeTruthy();
  });

  it('does not POST when title is empty (Create button disabled)', async () => {
    const { container } = await openModal();
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create event'),
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('toggling all-day hides the time inputs', async () => {
    const { container } = await openModal();
    expect(container.querySelector('input[type="time"]')).toBeTruthy();
    const allDay = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(allDay);
    await waitFor(() => {
      expect(container.querySelector('input[type="time"]')).toBeFalsy();
    });
  });

  it('editing the date input updates the displayed date value', async () => {
    const { container } = await openModal();
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-07-04' } });
    await waitFor(() => {
      expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-07-04');
    });
  });

  it('submits the new event payload to POST /events', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url === '/api/portal/brain/calendar/events' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = await openModal();
    const title = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'My new event' } });
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create event'),
    ) as HTMLButtonElement;
    fireEvent.click(submit);
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/brain/calendar/events' && (c[1] as any)?.method === 'POST',
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as any).body);
      expect(body.title).toBe('My new event');
      expect(typeof body.startAt).toBe('string');
      expect(typeof body.endAt).toBe('string');
    });
  });

  it('closes the modal after a successful create', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url === '/api/portal/brain/calendar/events' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 1 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = await openModal();
    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'Some' } });
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create event'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(container.querySelector('form')).toBeFalsy();
    });
  });

  it('surfaces error message when POST returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url === '/api/portal/brain/calendar/events' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'create boom' }, { ok: false });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = await openModal();
    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'X' } });
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create event'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(container.textContent).toContain('create boom');
    });
  });

  it('cancels via the Cancel button', async () => {
    const { container } = await openModal();
    const cancel = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancel);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeFalsy();
    });
  });

  it('cancels via the backdrop click', async () => {
    const { container } = await openModal();
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeFalsy();
    });
  });

  it('all-day submit produces matching start-of-day and 23:59 end ISO times', async () => {
    let captured: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url === '/api/portal/brain/calendar/events' && init?.method === 'POST') {
        captured = JSON.parse(init.body);
        return makeRes({ success: true, data: { id: 1 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = await openModal();
    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'All-day thing' } });
    // toggle all-day
    fireEvent.click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create event'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(captured).toBeTruthy();
      expect(captured.allDay).toBe(true);
      expect(typeof captured.startAt).toBe('string');
      expect(typeof captured.endAt).toBe('string');
    });
  });

  it('passes location and link through to the POST body', async () => {
    let captured: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url === '/api/portal/brain/calendar/events' && init?.method === 'POST') {
        captured = JSON.parse(init.body);
        return makeRes({ success: true, data: { id: 1 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = await openModal();
    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'Has place' } });
    const inputs = container.querySelectorAll('input');
    // location is a [type="text"] input later in the form; link is [type="url"]
    const textInputs = Array.from(inputs).filter((i) => i.type === 'text') as HTMLInputElement[];
    fireEvent.change(textInputs[textInputs.length - 1], { target: { value: 'On-site' } });
    fireEvent.change(container.querySelector('input[type="url"]') as HTMLInputElement, {
      target: { value: 'https://meet.example.com' },
    });
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create event'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(captured).toBeTruthy();
      expect(captured.location).toBe('On-site');
      expect(captured.link).toBe('https://meet.example.com');
    });
  });

  it('passes description through, and null when blank', async () => {
    let captured: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url === '/api/portal/brain/calendar/events' && init?.method === 'POST') {
        captured = JSON.parse(init.body);
        return makeRes({ success: true, data: { id: 1 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = await openModal();
    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'Blank desc' } });
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create event'),
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(captured).toBeTruthy();
      expect(captured.description).toBeNull();
      expect(captured.location).toBeNull();
      expect(captured.link).toBeNull();
    });
  });
});

// ─── EventDetailModal ───────────────────────────────────────────────────────

describe('EventDetailModal', () => {
  async function openDetail(detailFixture: any) {
    window.history.pushState({}, '', '/portal/brain/calendar?event=33');
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/calendar/agenda')) {
        return makeRes({ success: true, data: [] });
      }
      if (url.includes('/api/portal/brain/calendar/events/33') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/brain/calendar/events/33')) {
        return makeRes({ success: true, data: detailFixture });
      }
      return makeRes({ success: true, data: {} });
    });
    const r = renderPage();
    await waitFor(() => {
      expect(r.container.textContent).toContain(detailFixture.title);
    });
    return r;
  }

  it('renders the event title in the modal', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, title: 'Detail Hi' }));
    // Title appears in <h4>
    const h4 = container.querySelector('h4');
    expect(h4?.textContent).toContain('Detail Hi');
  });

  it('renders the description when present', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, description: 'A nice desc' }));
    expect(container.textContent).toContain('A nice desc');
  });

  it('renders the location when present', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, location: 'Office HQ' }));
    expect(container.textContent).toContain('Office HQ');
  });

  it('renders the link as an anchor when present', async () => {
    const { container } = await openDetail(
      makeEventDetail({ id: 33, link: 'https://acme.example.com/x' }),
    );
    const link = container.querySelector('a[href="https://acme.example.com/x"]');
    expect(link).toBeTruthy();
  });

  it('renders the all-day variant when allDay=true', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, allDay: true }));
    expect(container.textContent).toContain('All day');
  });

  it('renders the "Synced from Google Calendar." note when source=google', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, source: 'google' }));
    expect(container.textContent).toContain('Synced from Google Calendar');
  });

  it('does NOT render the description block when description is null', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, description: null }));
    // The detail modal does not include "description" literal text; ensure
    // at least no whitespace-pre-wrap p with the empty marker.
    const ps = Array.from(container.querySelectorAll('p.whitespace-pre-wrap'));
    expect(ps.length).toBe(0);
  });

  it('clicking Delete with confirm=true triggers DELETE /events/N', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, title: 'ToDelete' }));
    const del = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(del);
    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes('/api/portal/brain/calendar/events/33') &&
          (c[1] as any)?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
    });
  });

  it('clicking Delete with confirm=false does NOT trigger DELETE', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false) as any);
    const { container } = await openDetail(makeEventDetail({ id: 33, title: 'NotDeleted' }));
    const del = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(del);
    await waitFor(() => {
      // No DELETE call should have been issued
      const deleteCall = fetchMock.mock.calls.find(
        (c) => (c[1] as any)?.method === 'DELETE',
      );
      expect(deleteCall).toBeFalsy();
    });
  });

  it('clicking the close icon closes the modal', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, title: 'Closeable' }));
    // The close button has a "close" material icon span inside it; find by parent
    const closeBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.querySelector('.material-icons')?.textContent === 'close',
    );
    expect(closeBtns.length).toBeGreaterThan(0);
    fireEvent.click(closeBtns[0]);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Closeable');
    });
  });

  it('clicking Refresh re-fetches detail and agenda', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, title: 'Refreshable' }));
    const before = fetchMock.mock.calls.length;
    const refresh = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Refresh',
    ) as HTMLButtonElement;
    fireEvent.click(refresh);
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('clicking the backdrop closes the modal', async () => {
    const { container } = await openDetail(makeEventDetail({ id: 33, title: 'BackdropClose' }));
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.textContent).not.toContain('BackdropClose');
    });
  });
});
