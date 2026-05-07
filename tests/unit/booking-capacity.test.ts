// @vitest-environment node
/**
 * Unit tests for the pure slot-capacity logic. Uses checkSlotCapacityPure so
 * we can exercise the seat-math without standing up Postgres. Production
 * callers go through checkSlotCapacity which fetches the page metadata +
 * attendee rows and delegates here.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  bookingPages: {},
  bookings: {},
  bookingAttendees: {},
}));

const { checkSlotCapacityPure } = await import('@/lib/booking/capacity');

describe('checkSlotCapacityPure — group bookings', () => {
  it('returns available with full remaining seats for an empty slot', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'group',
      groupCapacity: 8,
      attendeeStatuses: [],
      hasIndividualBooking: false,
      requestedSeats: 1,
    });
    expect(r.available).toBe(true);
    expect(r.remaining).toBe(8);
  });

  it('counts confirmed attendees against capacity', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'group',
      groupCapacity: 5,
      attendeeStatuses: ['confirmed', 'confirmed', 'confirmed'],
      hasIndividualBooking: false,
      requestedSeats: 1,
    });
    expect(r.remaining).toBe(2);
    expect(r.available).toBe(true);
  });

  it('ignores cancelled attendees but counts waitlist seats', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'group',
      groupCapacity: 4,
      // 2 confirmed + 1 waitlist + 2 cancelled → 3 seats used, 1 remaining
      attendeeStatuses: ['confirmed', 'confirmed', 'waitlist', 'cancelled', 'cancelled'],
      hasIndividualBooking: false,
      requestedSeats: 1,
    });
    expect(r.remaining).toBe(1);
    expect(r.available).toBe(true);
  });

  it('rejects when requestedSeats exceeds remaining capacity', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'group',
      groupCapacity: 5,
      attendeeStatuses: ['confirmed', 'confirmed', 'confirmed', 'confirmed'],
      hasIndividualBooking: false,
      requestedSeats: 2, // only 1 seat left
    });
    expect(r.remaining).toBe(1);
    expect(r.available).toBe(false);
  });

  it('reports available=true exactly when remaining >= requested', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'group',
      groupCapacity: 6,
      attendeeStatuses: ['confirmed', 'confirmed'],
      hasIndividualBooking: false,
      requestedSeats: 4,
    });
    expect(r.remaining).toBe(4);
    expect(r.available).toBe(true);
  });

  it('returns available=false when groupCapacity is null or zero', () => {
    expect(
      checkSlotCapacityPure({
        bookingType: 'group',
        groupCapacity: null,
        attendeeStatuses: [],
        hasIndividualBooking: false,
        requestedSeats: 1,
      }),
    ).toEqual({ available: false, remaining: 0 });
    expect(
      checkSlotCapacityPure({
        bookingType: 'group',
        groupCapacity: 0,
        attendeeStatuses: [],
        hasIndividualBooking: false,
        requestedSeats: 1,
      }),
    ).toEqual({ available: false, remaining: 0 });
  });

  it('clamps requestedSeats to at least 1', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'group',
      groupCapacity: 3,
      attendeeStatuses: [],
      hasIndividualBooking: false,
      requestedSeats: 0,
    });
    // 0 → clamped to 1; 3 remaining ≥ 1 → available
    expect(r.available).toBe(true);
    expect(r.remaining).toBe(3);
  });
});

describe('checkSlotCapacityPure — individual bookings', () => {
  it('returns available=true with remaining=1 when slot is empty', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'individual',
      groupCapacity: null,
      attendeeStatuses: [],
      hasIndividualBooking: false,
      requestedSeats: 1,
    });
    expect(r).toEqual({ available: true, remaining: 1 });
  });

  it('returns available=false when an existing booking already occupies the slot', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'individual',
      groupCapacity: null,
      attendeeStatuses: [],
      hasIndividualBooking: true,
      requestedSeats: 1,
    });
    expect(r).toEqual({ available: false, remaining: 0 });
  });

  it('rejects multi-seat requests for individual bookings', () => {
    const r = checkSlotCapacityPure({
      bookingType: 'individual',
      groupCapacity: null,
      attendeeStatuses: [],
      hasIndividualBooking: false,
      requestedSeats: 3,
    });
    expect(r.remaining).toBe(1);
    expect(r.available).toBe(false);
  });
});
