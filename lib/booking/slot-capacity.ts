/**
 * PUX-181 (design doc screen 40): how full is a slot? Pure.
 * A slot is (bookingPageId, startTime) — the same key the DB's exclusive-slot
 * index and lib/booking/capacity.ts use. Seats used = the sum of groupSize
 * over non-cancelled bookings in that slot; the denominator is the page's
 * groupCapacity (null on individual pages → no label).
 */

export interface SlotBooking { bookingPageId: number; startTime: string; groupSize: number; status: string }

export const slotKey = (pageId: number, startTime: string) => `${pageId}|${new Date(startTime).toISOString()}`;

export function slotUsage(bookings: SlotBooking[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const k = slotKey(b.bookingPageId, b.startTime);
    m.set(k, (m.get(k) ?? 0) + (b.groupSize || 1));
  }
  return m;
}

/** "Sold out" · "6 / 10" · null for pages without a group capacity. */
export function capacityLabel(used: number, capacity: number | null | undefined): string | null {
  if (capacity == null || capacity <= 0) return null;
  return used >= capacity ? 'Sold out' : `${used} / ${capacity}`;
}
