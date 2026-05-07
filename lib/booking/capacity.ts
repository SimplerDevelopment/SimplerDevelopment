/**
 * Slot-capacity helper for group / class bookings.
 *
 * For booking pages with bookingType = 'group', the page declares a
 * groupCapacity (e.g. 8 spots in a yoga class). Each registrant lives in
 * the booking_attendees table linked to the parent bookings row(s) for
 * the slot. This function counts non-cancelled attendees against that cap.
 *
 * For booking pages with bookingType = 'individual', a slot is binary:
 *   available = 1 (no non-cancelled booking on that slotStart)
 *   available = 0 (already booked)
 *
 * Multi-tenant: scoped by the page's id, which is itself scoped by the
 * booking_pages.clientId via the page resolver in the calling route.
 */
import { db } from '@/lib/db';
import { bookingPages, bookings, bookingAttendees } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';

export interface CapacityResult {
  available: boolean;
  remaining: number;
}

export async function checkSlotCapacity(
  bookingPageId: number,
  slotStart: Date,
  requestedSeats: number,
): Promise<CapacityResult> {
  const seats = Math.max(1, Math.floor(requestedSeats));

  const [page] = await db
    .select({
      id: bookingPages.id,
      bookingType: bookingPages.bookingType,
      groupCapacity: bookingPages.groupCapacity,
      maxGuests: bookingPages.maxGuests,
    })
    .from(bookingPages)
    .where(eq(bookingPages.id, bookingPageId))
    .limit(1);

  if (!page) return { available: false, remaining: 0 };

  if (page.bookingType === 'group') {
    const capacity = page.groupCapacity ?? page.maxGuests ?? 0;
    if (capacity <= 0) return { available: false, remaining: 0 };

    // Pull non-cancelled attendees across all bookings rows for this slot.
    const rows = await db
      .select({ status: bookingAttendees.status })
      .from(bookingAttendees)
      .innerJoin(bookings, eq(bookings.id, bookingAttendees.bookingId))
      .where(
        and(
          eq(bookings.bookingPageId, bookingPageId),
          eq(bookings.startTime, slotStart),
          ne(bookings.status, 'cancelled'),
        ),
      );

    return checkSlotCapacityPure({
      bookingType: 'group',
      groupCapacity: capacity,
      attendeeStatuses: rows.map(
        (r) => (r.status as 'confirmed' | 'cancelled' | 'waitlist'),
      ),
      hasIndividualBooking: false,
      requestedSeats: seats,
    });
  }

  // Individual: 1 if no booking, else 0.
  const existing = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.bookingPageId, bookingPageId),
        eq(bookings.startTime, slotStart),
        ne(bookings.status, 'cancelled'),
      ),
    )
    .limit(1);

  if (existing.length > 0) return { available: false, remaining: 0 };
  return { available: seats <= 1, remaining: 1 };
}

/**
 * Pure capacity calculator — exposed so unit tests can exercise the seat-math
 * logic without standing up a database. Production callers go through
 * checkSlotCapacity which fetches the page metadata + attendee counts and
 * delegates here.
 */
export interface CapacityInputs {
  bookingType: 'individual' | 'group';
  groupCapacity: number | null;
  /** Pre-existing attendee statuses for the slot. Cancelled rows are ignored. */
  attendeeStatuses: Array<'confirmed' | 'cancelled' | 'waitlist'>;
  /** True when an individual booking already exists for the slot. */
  hasIndividualBooking: boolean;
  requestedSeats: number;
}

export function checkSlotCapacityPure(input: CapacityInputs): CapacityResult {
  const seats = Math.max(1, Math.floor(input.requestedSeats));

  if (input.bookingType === 'group') {
    const cap = input.groupCapacity ?? 0;
    if (cap <= 0) return { available: false, remaining: 0 };
    // Confirmed and waitlist count against capacity; cancelled does not.
    // (Waitlist seats aren't promoted automatically — see "Out of scope" in
    // the spec — but they DO consume real-world capacity for organisers.)
    const seated = input.attendeeStatuses.filter((s) => s !== 'cancelled').length;
    const remaining = Math.max(0, cap - seated);
    return { available: remaining >= seats, remaining };
  }

  if (input.hasIndividualBooking) return { available: false, remaining: 0 };
  return { available: seats <= 1, remaining: 1 };
}
