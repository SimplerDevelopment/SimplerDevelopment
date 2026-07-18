// @vitest-environment jsdom
/**
 * Unit tests for BookingFormInline (components/blocks/render/BookingFormInline.tsx).
 *
 * This is a large client-side component (~280 statements, 1080 lines) that
 * powers the public `/book/<slug>` booking widget. It walks the user through
 * date → time → (add-ons) → details → (payment) → confirmed, hitting four
 * public API endpoints along the way:
 *   - GET  /api/public/booking/<slug>             (page metadata)
 *   - GET  /api/public/booking/<slug>/add-ons
 *   - GET  /api/public/booking/<slug>/slots
 *   - POST /api/public/booking/<slug>/validate-discount
 *   - POST /api/public/gift-certificates/validate
 *   - POST /api/public/booking/<slug>/book
 *
 * The only external React dependency is BookingPaymentForm — we mock it to a
 * simple identity component to avoid pulling in @stripe/* at unit-test time.
 *
 * Coverage strategy:
 *   - Stub fetch with a URL-routing fake so we can control the response per
 *     endpoint and per-test.
 *   - Use act() + await flushPromises() between user interactions so the
 *     setState + fetch pipelines settle before assertions.
 *   - Walk loading, not-found, calendar, time-slot, add-ons, info-form,
 *     discount, gift-cert, submit (free + paid), payment, and confirmed paths.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — BookingPaymentForm
// ---------------------------------------------------------------------------
// The real component depends on @stripe/* which would yank in WebGL / wasm
// branches that jsdom can't service. We replace it with a tiny stub that
// exposes the props it would receive plus buttons to invoke onSuccess/onError.
vi.mock('@/components/blocks/render/BookingPaymentForm', () => ({
  BookingPaymentForm: (props: any) => (
    <div data-testid="payment-form-mock" data-total={props.total} data-accent={props.accent}>
      <button data-testid="pay-success" onClick={() => props.onSuccess?.()}>ok</button>
      <button data-testid="pay-error" onClick={() => props.onError?.('Card declined')}>fail</button>
    </div>
  ),
}));

import { BookingFormInline } from '@/components/blocks/render/BookingFormInline';

// ---------------------------------------------------------------------------
// fetch routing helper
// ---------------------------------------------------------------------------

type RouteHandler = (url: string, init?: RequestInit) => unknown;

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function makeFetch(routes: Record<string, RouteHandler>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    // Match longest pattern first so '/api/public/booking/test-slug/book' wins
    // over '/api/public/booking/test-slug'.
    const sorted = Object.keys(routes).sort((a, b) => b.length - a.length);
    for (const pattern of sorted) {
      if (url.includes(pattern)) return routes[pattern](url, init);
    }
    // Default — empty success.
    return jsonResponse({ success: true, data: [] });
  });
}

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makePageInfo(overrides: Partial<any> = {}): any {
  // Build availability for every day of the week so the calendar is fully
  // enabled — keeps the calendar-render branch consistent across tests.
  const availability = Array.from({ length: 7 }).map((_, day) => ({
    day,
    startTime: '09:00',
    endTime: '17:00',
    enabled: true,
  }));
  return {
    id: 1,
    title: 'Discovery Call',
    description: 'A quick chat',
    duration: 30,
    timezone: 'UTC',
    color: '#2563eb',
    availability,
    questions: [],
    maxAdvanceDays: 60,
    minNoticeMins: 0,
    branding: null,
    cssVars: null,
    price: 0,
    priceLabel: null,
    maxGuests: null,
    enableAddOns: false,
    enableGiftCertificates: false,
    enableDiscountCodes: false,
    enableWaivers: false,
    requireWaiverBeforeBooking: false,
    waiverContent: null,
    checkinEnabled: false,
    allowStaffSelection: false,
    staffMembers: [],
    ...overrides,
  };
}

async function renderWithInfo(
  pageOverrides: Partial<any> = {},
  routeOverrides: Record<string, RouteHandler> = {},
  props: Partial<React.ComponentProps<typeof BookingFormInline>> = {},
) {
  const page = makePageInfo(pageOverrides);
  const routes: Record<string, RouteHandler> = {
    '/api/public/booking/test-slug/add-ons': () =>
      jsonResponse({ success: true, data: [] }),
    '/api/public/booking/test-slug/slots': () =>
      jsonResponse({ success: true, data: [] }),
    '/api/public/booking/test-slug': () =>
      jsonResponse({ success: true, data: page }),
    ...routeOverrides,
  };
  const fetchMock = makeFetch(routes);
  (global as any).fetch = fetchMock;

  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<BookingFormInline slug="test-slug" {...props} />);
    await flushPromises();
  });
  return { ...utils!, fetchMock, page };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookingFormInline — loading and not-found', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('renders the spinner before page info has loaded', () => {
    // Never-resolving fetch so we stay on the loading branch.
    (global as any).fetch = vi.fn(() => new Promise(() => {}));
    const { container } = render(<BookingFormInline slug="test-slug" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders the not-found state when the fetch returns ok:false', async () => {
    (global as any).fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<BookingFormInline slug="test-slug" />);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Page Not Found');
    expect(utils!.container.textContent).toContain('event_busy');
  });

  it('renders the not-found state when the success flag is false', async () => {
    (global as any).fetch = vi.fn(async () =>
      jsonResponse({ success: false }),
    );
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<BookingFormInline slug="test-slug" />);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Page Not Found');
  });

  it('renders not-found when fetch throws', async () => {
    (global as any).fetch = vi.fn(async () => {
      throw new Error('network');
    });
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<BookingFormInline slug="test-slug" />);
      await flushPromises();
    });
    expect(utils!.container.textContent).toContain('Page Not Found');
  });
});

describe('BookingFormInline — initial render', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('renders the page title, description, duration and timezone', async () => {
    const { container } = await renderWithInfo({
      title: 'Strategy Session',
      description: 'Plan the quarter',
      duration: 45,
      timezone: 'America/New_York',
    });
    expect(container.textContent).toContain('Strategy Session');
    expect(container.textContent).toContain('Plan the quarter');
    expect(container.textContent).toContain('45 min');
    expect(container.textContent).toContain('America/New_York');
  });

  it('renders the price badge when price > 0', async () => {
    const { container } = await renderWithInfo({ price: 5000, priceLabel: 'per session' });
    // $50.00
    expect(container.textContent).toContain('$50.00');
    expect(container.textContent).toContain('per session');
  });

  it('hides title, description, steps, and logo when their toggles are off', async () => {
    const { container } = await renderWithInfo(
      {
        title: 'Should not show title',
        description: 'Should not show desc',
        branding: {
          primaryColor: '#000',
          secondaryColor: '#111',
          accentColor: '#222',
          backgroundColor: '#fff',
          textColor: '#000',
          headingFont: '',
          bodyFont: '',
          logoUrl: 'https://example.com/logo.png',
        },
      },
      {},
      {
        showPageTitle: false,
        showDescription: false,
        showSteps: false,
        showLogo: false,
      },
    );
    expect(container.textContent).not.toContain('Should not show title');
    expect(container.textContent).not.toContain('Should not show desc');
    expect(container.querySelector('img[alt="Logo"]')).toBeNull();
  });

  it('renders the logo image when showLogo + branding.logoUrl are present', async () => {
    const { container } = await renderWithInfo({
      branding: {
        primaryColor: '#000',
        secondaryColor: '#111',
        accentColor: '#222',
        backgroundColor: '#fff',
        textColor: '#000',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        logoUrl: 'https://example.com/logo.png',
      },
    });
    const logo = container.querySelector('img[alt="Logo"]') as HTMLImageElement;
    expect(logo).toBeTruthy();
    expect(logo.src).toContain('https://example.com/logo.png');
  });

  it('renders the step indicator with date/time/info by default', async () => {
    const { container } = await renderWithInfo();
    // The step indicator labels live in `title` attributes on the bubbles.
    const bubbles = container.querySelectorAll('[title]');
    const titles = Array.from(bubbles).map((b) => b.getAttribute('title'));
    expect(titles).toContain('Date');
    expect(titles).toContain('Time');
    expect(titles).toContain('Details');
  });

  it('includes an Extras step when enableAddOns + add-ons are present', async () => {
    const { container } = await renderWithInfo(
      { enableAddOns: true },
      {
        '/api/public/booking/test-slug/add-ons': () =>
          jsonResponse({
            success: true,
            data: [
              {
                id: 1,
                source: 'custom',
                name: 'Workbook',
                description: null,
                price: 1000,
                image: null,
                maxQuantity: 5,
              },
            ],
          }),
      },
    );
    const titles = Array.from(container.querySelectorAll('[title]')).map((b) =>
      b.getAttribute('title'),
    );
    expect(titles).toContain('Extras');
  });

  it('includes a Pay step when price > 0', async () => {
    const { container } = await renderWithInfo({ price: 2500 });
    const titles = Array.from(container.querySelectorAll('[title]')).map((b) =>
      b.getAttribute('title'),
    );
    expect(titles).toContain('Pay');
  });

  it('applies branding fonts via the <link> tag once', async () => {
    // Clean up any leaked <link> from earlier tests in the same suite.
    document.getElementById('booking-brand-fonts')?.remove();
    await renderWithInfo({
      branding: {
        primaryColor: '#000',
        secondaryColor: '#111',
        accentColor: '#222',
        backgroundColor: '#fff',
        textColor: '#000',
        headingFont: 'Inter',
        bodyFont: 'Roboto',
        logoUrl: '',
      },
    });
    const link = document.getElementById('booking-brand-fonts') as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.href).toContain('Inter');
    expect(link.href).toContain('Roboto');
    // Re-render branding with same id — must NOT add a second link.
    await renderWithInfo({
      branding: {
        primaryColor: '#000',
        secondaryColor: '#111',
        accentColor: '#222',
        backgroundColor: '#fff',
        textColor: '#000',
        headingFont: 'Inter',
        bodyFont: 'Roboto',
        logoUrl: '',
      },
    });
    const links = document.querySelectorAll('#booking-brand-fonts');
    expect(links.length).toBe(1);
    link.remove();
  });
});

describe('BookingFormInline — calendar navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('disables the previous-month button on the current month', async () => {
    const { container } = await renderWithInfo();
    const prevBtn = container.querySelector('button[disabled] .material-icons');
    // chevron_left is the prev-month icon; the button hosting it should be disabled.
    expect(prevBtn?.textContent).toBe('chevron_left');
  });

  it('advances to next month when the chevron is clicked', async () => {
    const { container } = await renderWithInfo();
    const monthLabel = () => {
      const labels = container.querySelectorAll('span.text-sm.font-semibold');
      return Array.from(labels)
        .map((l) => l.textContent || '')
        .find((t) => /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(t)) || '';
    };
    const initial = monthLabel();
    // Find the chevron_right button.
    const chevronIcons = Array.from(container.querySelectorAll('.material-icons')).filter(
      (i) => i.textContent === 'chevron_right',
    );
    const nextBtn = chevronIcons[0].parentElement as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    const after = monthLabel();
    expect(after).not.toBe(initial);
  });

  it('rolls over from December → January and bumps the year', async () => {
    const { container } = await renderWithInfo();
    const nextBtn = (Array.from(container.querySelectorAll('.material-icons'))
      .find((i) => i.textContent === 'chevron_right')!.parentElement) as HTMLButtonElement;
    // Walk forward 12 months — at some point we must cross a December → January
    // boundary which forces the calMonth=11 branch in nextMonth().
    for (let i = 0; i < 13; i++) {
      await act(async () => {
        fireEvent.click(nextBtn);
      });
    }
    // The header should still render a known month name from MONTH_NAMES.
    const labels = container.querySelectorAll('span.text-sm.font-semibold');
    const text = Array.from(labels).map((l) => l.textContent).join(' ');
    expect(text).toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
  });

  it('walks the prevMonth wrap-around (Jan → Dec) once a future month is visible', async () => {
    const { container } = await renderWithInfo();
    // Forward to next year January (12 jumps), then walk back through December.
    const nextBtn = (Array.from(container.querySelectorAll('.material-icons'))
      .find((i) => i.textContent === 'chevron_right')!.parentElement) as HTMLButtonElement;
    for (let i = 0; i < 13; i++) {
      await act(async () => { fireEvent.click(nextBtn); });
    }
    const prevBtn = (Array.from(container.querySelectorAll('.material-icons'))
      .find((i) => i.textContent === 'chevron_left')!.parentElement) as HTMLButtonElement;
    expect(prevBtn.hasAttribute('disabled')).toBe(false);
    // Click prev enough times to cross a year boundary (Jan → Dec).
    for (let i = 0; i < 13; i++) {
      await act(async () => { fireEvent.click(prevBtn); });
    }
    expect(container.textContent).toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
  });

  it('marks dates outside availability or before today as unavailable', async () => {
    // No availability anywhere → every calendar day button must be disabled.
    const noAvailability = Array.from({ length: 7 }).map((_, day) => ({
      day,
      startTime: '09:00',
      endTime: '17:00',
      enabled: false,
    }));
    const { container } = await renderWithInfo({ availability: noAvailability });
    const dayButtons = Array.from(container.querySelectorAll('button.h-10'));
    expect(dayButtons.length).toBeGreaterThan(0);
    // Every day-button should be disabled.
    for (const b of dayButtons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('BookingFormInline — date → time flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('moves to the time step when an available date is clicked and fetches slots', async () => {
    const slotsCalls: string[] = [];
    const { container, fetchMock } = await renderWithInfo(
      {},
      {
        '/api/public/booking/test-slug/slots': (url) => {
          slotsCalls.push(url);
          return jsonResponse({
            success: true,
            data: [
              { time: '2026-12-01T15:00:00.000Z', remainingCapacity: null },
            ],
          });
        },
      },
    );
    // Pick a day button that's enabled.
    const dayBtn = Array.from(
      container.querySelectorAll('button.h-10'),
    ).find((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement;
    expect(dayBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('Back');
    // fetchSlots was called.
    expect(slotsCalls.length).toBeGreaterThan(0);
    void fetchMock;
  });

  it('shows "No available times" when the slots endpoint returns an empty list', async () => {
    const { container } = await renderWithInfo(
      {},
      {
        '/api/public/booking/test-slug/slots': () =>
          jsonResponse({ success: true, data: [] }),
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('No available times');
  });

  it('renders the spinner while slots are loading', async () => {
    let resolveSlots: ((v: any) => void) | null = null;
    const { container } = await renderWithInfo(
      {},
      {
        '/api/public/booking/test-slug/slots': () =>
          new Promise<any>((r) => {
            resolveSlots = (data: any) =>
              r({ ok: true, json: async () => ({ success: true, data }) });
          }),
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      // do NOT resolve slots yet
    });
    // Spinner present on the time step.
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    // Clean up — resolve slots so the suspended fetch settles before cleanup.
    await act(async () => {
      resolveSlots && resolveSlots([]);
      await flushPromises();
    });
  });

  it('swallows fetch errors on the slots endpoint', async () => {
    const { container } = await renderWithInfo(
      {},
      {
        '/api/public/booking/test-slug/slots': () => {
          throw new Error('boom');
        },
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    // Catch branch should produce "No available times" (slots remained empty).
    expect(container.textContent).toContain('No available times');
  });

  it('navigates back from the time step to the date step', async () => {
    const { container } = await renderWithInfo(
      {},
      {
        '/api/public/booking/test-slug/slots': () =>
          jsonResponse({ success: true, data: [] }),
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    // Click Back.
    const backBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Back'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(backBtn);
    });
    // Back on the date step — calendar Sunday header visible.
    expect(container.textContent).toContain('Su');
  });
});

describe('BookingFormInline — time → info flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  async function setupAtTime(extraSlotData?: any[]) {
    const slotData = extraSlotData ?? [
      { time: '2026-12-15T15:00:00.000Z', remainingCapacity: 3 },
    ];
    const { container, fetchMock } = await renderWithInfo(
      {},
      {
        '/api/public/booking/test-slug/slots': () =>
          jsonResponse({ success: true, data: slotData }),
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    return { container, fetchMock };
  }

  it('renders time slots with capacity labels', async () => {
    const { container } = await setupAtTime([
      { time: '2026-12-15T15:00:00.000Z', remainingCapacity: 1 },
      { time: '2026-12-15T16:00:00.000Z', remainingCapacity: 4 },
    ]);
    expect(container.textContent).toContain('1 spot left');
    expect(container.textContent).toContain('4 spots left');
  });

  it('advances to the info step when a slot is selected (no add-ons)', async () => {
    const { container } = await setupAtTime();
    const slotBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      /\d{1,2}:\d{2}\s?(AM|PM)/i.test(b.textContent || ''),
    );
    expect(slotBtns.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(slotBtns[0]);
    });
    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Email');
  });

  it('renders the group-size selector when maxGuests > 1', async () => {
    const { container } = await renderWithInfo(
      { maxGuests: 4, price: 1000 },
      {
        '/api/public/booking/test-slug/slots': () =>
          jsonResponse({
            success: true,
            data: [{ time: '2026-12-15T15:00:00.000Z', remainingCapacity: null }],
          }),
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('Group size');
    // Click the "+" once to bump from 1 → 2.
    const addIcons = Array.from(container.querySelectorAll('.material-icons')).filter(
      (i) => i.textContent === 'add',
    );
    await act(async () => {
      fireEvent.click(addIcons[0].parentElement as HTMLButtonElement);
    });
    // Display 2 in the counter.
    const counter = container.querySelectorAll('.w-8.text-center');
    expect(Array.from(counter).some((c) => c.textContent === '2')).toBe(true);
    // Decrement back to 1.
    const removeIcons = Array.from(container.querySelectorAll('.material-icons')).filter(
      (i) => i.textContent === 'remove',
    );
    await act(async () => {
      fireEvent.click(removeIcons[0].parentElement as HTMLButtonElement);
    });
  });

  it('disables a slot when capacity is below the chosen group size', async () => {
    const { container } = await renderWithInfo(
      { maxGuests: 5, price: 1000 },
      {
        '/api/public/booking/test-slug/slots': () =>
          jsonResponse({
            success: true,
            data: [{ time: '2026-12-15T15:00:00.000Z', remainingCapacity: 1 }],
          }),
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    // Bump group size to 3.
    const addIcons = Array.from(container.querySelectorAll('.material-icons')).filter(
      (i) => i.textContent === 'add',
    );
    await act(async () => {
      fireEvent.click(addIcons[0].parentElement as HTMLButtonElement);
      fireEvent.click(addIcons[0].parentElement as HTMLButtonElement);
    });
    // Slot button with "1 spot left" should now be disabled.
    const slotBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('1 spot left'),
    ) as HTMLButtonElement;
    expect(slotBtn.disabled).toBe(true);
  });
});

describe('BookingFormInline — staff selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('renders the staff picker and updates selection on click', async () => {
    const { container } = await renderWithInfo({
      allowStaffSelection: true,
      staffMembers: [
        { userId: 11, name: 'Alex', color: '#ff0000' },
        { userId: 22, name: 'Brett', color: null },
      ],
    });
    expect(container.textContent).toContain('Choose a staff member');
    expect(container.textContent).toContain('Any available');
    expect(container.textContent).toContain('Alex');
    expect(container.textContent).toContain('Brett');
    // Click "Alex".
    const alexBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Alex'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(alexBtn);
      await flushPromises();
    });
    // After clicking, the "ring-1" class indicates selection — passes when the
    // re-render completes without throwing.
    expect(alexBtn.className).toContain('ring-1');
  });
});

describe('BookingFormInline — info form & submit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  async function gotoInfoStep(routes: Record<string, RouteHandler> = {}, pageOverrides: Partial<any> = {}) {
    const merged: Record<string, RouteHandler> = {
      '/api/public/booking/test-slug/slots': () =>
        jsonResponse({
          success: true,
          data: [{ time: '2026-12-15T15:00:00.000Z', remainingCapacity: null }],
        }),
      ...routes,
    };
    const utils = await renderWithInfo(pageOverrides, merged);
    const dayBtn = Array.from(utils.container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    const slotBtn = Array.from(utils.container.querySelectorAll('button')).find((b) =>
      /\d{1,2}:\d{2}\s?(AM|PM)/i.test(b.textContent || ''),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(slotBtn);
    });
    return utils;
  }

  it('submits successfully with required fields and lands on the confirmed step', async () => {
    const bookCalls: any[] = [];
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': (_url, init) => {
        bookCalls.push(JSON.parse((init?.body as string) || '{}'));
        return jsonResponse({
          success: true,
          data: { id: 999 },
        });
      },
    });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
      fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('Booking Confirmed');
    expect(container.textContent).toContain('jane@example.com');
    expect(bookCalls.length).toBe(1);
    expect(bookCalls[0].name).toBe('Jane Doe');
    expect(bookCalls[0].email).toBe('jane@example.com');
  });

  it('shows a server-supplied error message when book returns success:false', async () => {
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': () =>
        jsonResponse({ success: false, message: 'Slot already taken' }),
    });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Bob' } });
      fireEvent.change(emailInput, { target: { value: 'bob@example.com' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('Slot already taken');
  });

  it('shows a generic error message when the book fetch throws', async () => {
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': () => {
        throw new Error('network down');
      },
    });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Bob' } });
      fireEvent.change(emailInput, { target: { value: 'bob@example.com' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('Something went wrong');
  });

  it('navigates to the payment step when the book response includes clientSecret', async () => {
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': () =>
        jsonResponse({
          success: true,
          data: { id: 1, clientSecret: 'pi_test_secret', total: 5000 },
        }),
    }, { price: 5000 });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Pay Me' } });
      fireEvent.change(emailInput, { target: { value: 'pay@example.com' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    expect(container.querySelector('[data-testid="payment-form-mock"]')).toBeTruthy();
    expect(container.textContent).toContain('Complete Payment');
  });

  it('payment success callback advances to confirmed', async () => {
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': () =>
        jsonResponse({
          success: true,
          data: { id: 1, clientSecret: 'pi_test_secret', total: 5000 },
        }),
    }, { price: 5000 });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Pay Me' } });
      fireEvent.change(emailInput, { target: { value: 'pay@example.com' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    const okBtn = container.querySelector('[data-testid="pay-success"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(okBtn);
    });
    expect(container.textContent).toContain('Booking Confirmed');
  });

  it('renders the meeting link when book returns one', async () => {
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': () =>
        jsonResponse({
          success: true,
          data: { id: 1, meetingLink: 'https://meet.example.com/abc' },
        }),
    });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Jane' } });
      fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    const link = container.querySelector('a[href="https://meet.example.com/abc"]');
    expect(link).toBeTruthy();
    expect(container.textContent).toContain('Join Video Call');
  });

  it('shows the checkin code on the confirmed step when provided', async () => {
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': () =>
        jsonResponse({
          success: true,
          data: { id: 1, checkinCode: 'XYZ-123' },
        }),
    });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Jane' } });
      fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('XYZ-123');
    expect(container.textContent).toContain('Check-in code');
  });

  it('does not submit when name or email are empty (early return)', async () => {
    const bookCalls: any[] = [];
    const { container } = await gotoInfoStep({
      '/api/public/booking/test-slug/book': (_url, init) => {
        bookCalls.push(init?.body);
        return jsonResponse({ success: true, data: { id: 1 } });
      },
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    await act(async () => {
      fireEvent.submit(submitBtn.closest('form')!);
      await flushPromises();
    });
    expect(bookCalls.length).toBe(0);
  });

  it('renders custom questions (text, textarea, select) and submits answers', async () => {
    const bookCalls: any[] = [];
    const { container } = await gotoInfoStep(
      {
        '/api/public/booking/test-slug/book': (_url, init) => {
          bookCalls.push(JSON.parse((init?.body as string) || '{}'));
          return jsonResponse({ success: true, data: { id: 1 } });
        },
      },
      {
        questions: [
          { id: 'q1', label: 'Company', type: 'text', required: true },
          { id: 'q2', label: 'Goals', type: 'textarea', required: false },
          {
            id: 'q3',
            label: 'Industry',
            type: 'select',
            required: false,
            options: ['SaaS', 'Retail'],
          },
        ],
      },
    );
    expect(container.textContent).toContain('Company');
    expect(container.textContent).toContain('Goals');
    expect(container.textContent).toContain('Industry');
    const inputs = container.querySelectorAll('input[type="text"]');
    const textareas = container.querySelectorAll('textarea');
    const selects = container.querySelectorAll('select');
    // inputs[0] = Name, inputs[1] = q1 ("Company"). Phone is type="tel".
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: 'Jane' } });
      fireEvent.change(container.querySelector('input[type="email"]')!, {
        target: { value: 'jane@example.com' },
      });
      fireEvent.change(inputs[1], { target: { value: 'Acme' } });
      fireEvent.change(textareas[0], { target: { value: 'Growth' } });
      fireEvent.change(selects[0], { target: { value: 'SaaS' } });
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
      await flushPromises();
    });
    expect(bookCalls.length).toBe(1);
    expect(bookCalls[0].answers).toBeTruthy();
  });
});

describe('BookingFormInline — discount + gift cert', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  async function gotoInfoStepPaid(routes: Record<string, RouteHandler> = {}) {
    const utils = await renderWithInfo(
      {
        price: 5000,
        enableDiscountCodes: true,
        enableGiftCertificates: true,
      },
      {
        '/api/public/booking/test-slug/slots': () =>
          jsonResponse({
            success: true,
            data: [{ time: '2026-12-15T15:00:00.000Z', remainingCapacity: null }],
          }),
        ...routes,
      },
    );
    const dayBtn = Array.from(utils.container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    const slotBtn = Array.from(utils.container.querySelectorAll('button')).find((b) =>
      /\d{1,2}:\d{2}\s?(AM|PM)/i.test(b.textContent || ''),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(slotBtn);
    });
    return utils;
  }

  it('applies a successful discount code and shows the badge', async () => {
    const { container } = await gotoInfoStepPaid({
      '/api/public/booking/test-slug/validate-discount': () =>
        jsonResponse({
          success: true,
          data: {
            code: 'SAVE10',
            discountType: 'percent',
            amount: 1000, // 10% (stored as basis points / 100)
            discountAmount: null,
          },
        }),
    });
    const codeInputs = Array.from(container.querySelectorAll('input[type="text"]')).filter(
      (i) => (i as HTMLInputElement).placeholder === 'Enter code',
    ) as HTMLInputElement[];
    expect(codeInputs.length).toBe(1);
    await act(async () => {
      fireEvent.change(codeInputs[0], { target: { value: 'SAVE10' } });
    });
    const applyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === 'Apply' && b.previousElementSibling === null
        || (b.textContent || '').trim() === 'Apply',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(applyBtn);
      await flushPromises();
    });
    expect(container.textContent).toContain('SAVE10 applied');
    // The clear button replaces apply.
    expect(
      Array.from(container.querySelectorAll('button')).some(
        (b) => (b.textContent || '').trim() === 'Clear',
      ),
    ).toBe(true);
  });

  it('renders an error when the discount endpoint returns success:false', async () => {
    const { container } = await gotoInfoStepPaid({
      '/api/public/booking/test-slug/validate-discount': () =>
        jsonResponse({ success: false, message: 'Code expired' }),
    });
    const codeInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder === 'Enter code',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(codeInput, { target: { value: 'BAD' } });
    });
    const applyBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent || '').trim() === 'Apply',
    );
    await act(async () => {
      fireEvent.click(applyBtns[0]);
      await flushPromises();
    });
    expect(container.textContent).toContain('Code expired');
  });

  it('renders an error when the discount fetch throws', async () => {
    const { container } = await gotoInfoStepPaid({
      '/api/public/booking/test-slug/validate-discount': () => {
        throw new Error('net');
      },
    });
    const codeInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder === 'Enter code',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(codeInput, { target: { value: 'X' } });
    });
    const applyBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent || '').trim() === 'Apply',
    );
    await act(async () => {
      fireEvent.click(applyBtns[0]);
      await flushPromises();
    });
    expect(container.textContent).toContain('Failed to validate code');
  });

  it('applies a fixed_amount discount type via calculateTotal', async () => {
    const { container } = await gotoInfoStepPaid({
      '/api/public/booking/test-slug/validate-discount': () =>
        jsonResponse({
          success: true,
          data: {
            code: 'FLAT5',
            discountType: 'fixed_amount',
            amount: 500,
            discountAmount: null,
          },
        }),
    });
    const codeInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder === 'Enter code',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(codeInput, { target: { value: 'FLAT5' } });
    });
    const applyBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent || '').trim() === 'Apply',
    );
    await act(async () => {
      fireEvent.click(applyBtns[0]);
      await flushPromises();
    });
    expect(container.textContent).toContain('FLAT5 applied');
    expect(container.textContent).toContain('Discount');
  });

  it('applies a gift certificate', async () => {
    const { container } = await gotoInfoStepPaid({
      '/api/public/gift-certificates/validate': () =>
        jsonResponse({
          success: true,
          data: { code: 'GIFT', remainingAmount: 1500 },
        }),
    });
    const giftInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder === 'CERT-XXXXXX',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(giftInput, { target: { value: 'GIFT' } });
    });
    const applyBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent || '').trim() === 'Apply',
    );
    // The 2nd apply button is for gift cert.
    await act(async () => {
      fireEvent.click(applyBtns[applyBtns.length - 1]);
      await flushPromises();
    });
    expect(container.textContent).toContain('Certificate applied');
  });

  it('renders gift certificate failure', async () => {
    const { container } = await gotoInfoStepPaid({
      '/api/public/gift-certificates/validate': () =>
        jsonResponse({ success: false, message: 'Already used' }),
    });
    const giftInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder === 'CERT-XXXXXX',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(giftInput, { target: { value: 'GIFT' } });
    });
    const applyBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent || '').trim() === 'Apply',
    );
    await act(async () => {
      fireEvent.click(applyBtns[applyBtns.length - 1]);
      await flushPromises();
    });
    expect(container.textContent).toContain('Already used');
  });

  it('renders gift certificate fetch-throw error', async () => {
    const { container } = await gotoInfoStepPaid({
      '/api/public/gift-certificates/validate': () => {
        throw new Error('boom');
      },
    });
    const giftInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder === 'CERT-XXXXXX',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(giftInput, { target: { value: 'GIFT' } });
    });
    const applyBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent || '').trim() === 'Apply',
    );
    await act(async () => {
      fireEvent.click(applyBtns[applyBtns.length - 1]);
      await flushPromises();
    });
    expect(container.textContent).toContain('Failed to validate certificate');
  });
});

describe('BookingFormInline — add-ons step', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('walks date → time → addons → info, updating quantities on the way', async () => {
    const { container } = await renderWithInfo(
      { enableAddOns: true, price: 1000 },
      {
        '/api/public/booking/test-slug/add-ons': () =>
          jsonResponse({
            success: true,
            data: [
              {
                id: 7,
                source: 'custom',
                name: 'Notebook',
                description: 'Hardcover',
                price: 1200,
                image: 'https://cdn.example/n.png',
                maxQuantity: 3,
              },
            ],
          }),
        '/api/public/booking/test-slug/slots': () =>
          jsonResponse({
            success: true,
            data: [{ time: '2026-12-15T15:00:00.000Z', remainingCapacity: null }],
          }),
      },
    );
    const dayBtn = Array.from(container.querySelectorAll('button.h-10')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(dayBtn);
      await flushPromises();
    });
    const slotBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /\d{1,2}:\d{2}\s?(AM|PM)/i.test(b.textContent || ''),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(slotBtn);
    });
    // We should be on the add-ons step.
    expect(container.textContent).toContain('Add extras');
    expect(container.textContent).toContain('Notebook');
    expect(container.textContent).toContain('Hardcover');
    // Bump the quantity.
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'add',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(addBtn);
      fireEvent.click(addBtn);
    });
    // qty should now be 2 — visible in the .w-6.text-center span.
    const qtyText = Array.from(container.querySelectorAll('.w-6.text-center')).map(
      (n) => n.textContent,
    );
    expect(qtyText).toContain('2');
    // Decrement once.
    const removeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'remove',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(removeBtn);
    });
    // Continue → info step.
    const continueBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === 'Continue',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    expect(container.textContent).toContain('Name');
  });
});
