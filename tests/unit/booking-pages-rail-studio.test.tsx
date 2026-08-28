// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('next/link', () => ({ default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));
vi.mock('@/components/portal/booking/WeekGrid', () => ({ default: () => <div data-testid="week" /> }));
import BookingsStudioHome from '@/components/portal/booking/BookingsStudioHome';

describe('booking pages rail (PUX-207)', () => {
  it('shows capacity, price and a copy-link chip per page', () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { bookings: [], summary: { total: 0, checkedIn: 0, pending: 0, totalGuests: 0 } } }) })) as any;
    const write = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText: write } });
    render(<BookingsStudioHome days={[]} bookings={[]} pages={[
      { id: 1, title: 'Sunrise paddle', bookingType: 'group', groupCapacity: 8, active: true, duration: 90, upcoming: 2, slug: 'sunrise-paddle', price: 4500, priceLabel: 'per person', maxGuests: null },
      { id: 2, title: 'Intro call', bookingType: 'individual', groupCapacity: null, active: true, duration: 30, upcoming: 0, slug: 'intro', price: 0, priceLabel: null, maxGuests: 1 },
    ]} />);
    expect(screen.getByText(/cap\. 8/)).toBeTruthy();
    expect(screen.getByText('$45.00 per person')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Copy link for Sunrise paddle'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('/book/sunrise-paddle'));
  });
});
