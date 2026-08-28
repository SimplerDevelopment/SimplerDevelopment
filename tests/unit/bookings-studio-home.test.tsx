// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/portal/booking/WeekGrid', () => ({
  default: ({ bookings, blockLabel }: { bookings: { id: number }[]; blockLabel?: (b: never) => string | null }) => (
    <ul data-testid="week">{bookings.map((b) => <li key={b.id}>{blockLabel?.(b as never) ?? 'no label'}</li>)}</ul>
  ),
  getWeekDays: () => [],
}));
import BookingsStudioHome from '@/components/portal/booking/BookingsStudioHome';
import type { CalendarBooking } from '@/app/portal/tools/booking/_lib/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const t = '2026-08-25T06:00:00.000Z';
const b = (id: number, pageId: number, groupSize: number): CalendarBooking => ({ id, bookingPageId: pageId, guestName: 'A', guestEmail: 'a@x', startTime: t, endTime: t, timezone: 'UTC', status: 'confirmed', assignedTo: null, groupSize, total: null, pageTitle: 'P', pageColor: null, assignedMember: null } as unknown as CalendarBooking);

describe('PUX-181 Bookings studio home', () => {
  it('capacity labels per slot, check-ins note from the check-in route, pages side column', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { bookings: [], summary: { total: 5, checkedIn: 2, pending: 3, totalGuests: 12 } } }) })));
    render(<BookingsStudioHome days={[t]} bookings={[b(1, 1, 6), b(2, 1, 4), b(3, 2, 1)]} pages={[
      { id: 1, title: 'Sunrise Summit', bookingType: 'group', groupCapacity: 10, active: true, duration: 180, upcoming: 3 },
      { id: 2, title: 'Private charter', bookingType: 'individual', groupCapacity: null, active: false, duration: null, upcoming: 0 },
    ]} />);
    const labels = Array.from(screen.getByTestId('week').querySelectorAll('li')).map((l) => l.textContent);
    expect(labels).toEqual(['Sold out', 'Sold out', 'no label']);
    await waitFor(() => expect(screen.getByText(/2 of 5 checked in today/)).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Open check-in' }).getAttribute('href')).toBe('/portal/tools/booking/checkin');
    expect(screen.getByLabelText('Booking pages').textContent).toContain('cap. 10');
    expect(screen.getByLabelText('Booking pages').textContent).toContain('Draft');
    expect(document.body.textContent).not.toContain('Block a day');
  });
});
