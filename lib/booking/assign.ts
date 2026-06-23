/**
 * Round-robin / load-balanced assignment for booking pages.
 *
 * Three modes (driven by booking_pages.assignmentMode):
 *   - 'fixed'           — owner handles every booking. Returns null and
 *                         lets the caller fall back to the page owner.
 *   - 'round_robin'     — picks the candidate with the fewest bookings in
 *                         the next 7 days. Tiebreaker: longest time since
 *                         their last (created) booking.
 *   - 'fewest_upcoming' — picks the candidate with the fewest TOTAL upcoming
 *                         bookings (any future startTime).
 *
 * Candidate pool resolution:
 *   - If booking_pages.roundRobinPool is set, only those user IDs (active
 *     in booking_page_members) participate.
 *   - Otherwise every active member of the page participates.
 *
 * Multi-tenant: every query is scoped by the booking page's clientId via
 * the booking_page_members and bookings joins.
 */
import { db } from '@/lib/db';
import { bookingPages, bookingPageMembers, bookings } from '@/lib/db/schema';
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';

export type AssignmentMode = 'fixed' | 'round_robin' | 'fewest_upcoming';

interface PoolEntry {
  userId: number;
  weight: number;
}

/**
 * Resolve the candidate pool for round-robin / fewest-upcoming modes.
 * Returns the userIds eligible to receive the next booking.
 */
async function resolvePool(
  bookingPageId: number,
  rawPool: PoolEntry[] | null | undefined,
): Promise<number[]> {
  // Manual override: only use the userIds listed in roundRobinPool that
  // are still active page members.
  if (Array.isArray(rawPool) && rawPool.length > 0) {
    const explicit = rawPool.map((p) => p.userId).filter((id) => Number.isFinite(id));
    if (explicit.length === 0) return [];
    const active = await db
      .select({ userId: bookingPageMembers.userId })
      .from(bookingPageMembers)
      .where(
        and(
          eq(bookingPageMembers.bookingPageId, bookingPageId),
          eq(bookingPageMembers.active, true),
        ),
      );
    const activeIds = new Set(active.map((m) => m.userId));
    return explicit.filter((id) => activeIds.has(id));
  }

  // Default: all active members of the page.
  const rows = await db
    .select({ userId: bookingPageMembers.userId })
    .from(bookingPageMembers)
    .where(
      and(
        eq(bookingPageMembers.bookingPageId, bookingPageId),
        eq(bookingPageMembers.active, true),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Pick the next assignee for a booking. Returns null when:
 *   - assignmentMode = 'fixed' (caller falls back to owner), or
 *   - the candidate pool is empty (caller falls back to owner / no-op).
 */
export async function pickAssignee(
  bookingPageId: number,
  // slotStart is accepted for forward compatibility (e.g. per-day fairness)
  // but isn't required by the current heuristics. Underscore-prefix avoids
  // unused-arg lint complaints while preserving the documented signature.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _slotStart: Date,
): Promise<number | null> {
  const [page] = await db
    .select({
      id: bookingPages.id,
      assignmentMode: bookingPages.assignmentMode,
      roundRobinPool: bookingPages.roundRobinPool,
    })
    .from(bookingPages)
    .where(eq(bookingPages.id, bookingPageId))
    .limit(1);

  if (!page) return null;
  if (page.assignmentMode === 'fixed') return null;

  const candidates = await resolvePool(
    page.id,
    page.roundRobinPool as PoolEntry[] | null,
  );
  if (candidates.length === 0) return null;

  const now = new Date();

  if (page.assignmentMode === 'round_robin') {
    // Fewest bookings in the next 7 days; tiebreaker = longest since last
    // (created) booking. We compute next-7-day load and a "last-booked"
    // timestamp per candidate in two grouped scans, then resolve in JS.
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcoming = await db
      .select({
        userId: bookings.assignedTo,
        cnt: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingPageId, bookingPageId),
          ne(bookings.status, 'cancelled'),
          gte(bookings.startTime, now),
          lte(bookings.startTime, sevenDays),
        ),
      )
      .groupBy(bookings.assignedTo);

    const lastBooked = await db
      .select({
        userId: bookings.assignedTo,
        last: sql<Date>`max(${bookings.createdAt})`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingPageId, bookingPageId),
          ne(bookings.status, 'cancelled'),
        ),
      )
      .groupBy(bookings.assignedTo);

    const cntMap = new Map<number, number>();
    for (const row of upcoming) {
      if (row.userId != null) cntMap.set(row.userId, Number(row.cnt));
    }
    const lastMap = new Map<number, number>();
    for (const row of lastBooked) {
      if (row.userId != null && row.last) {
        lastMap.set(row.userId, new Date(row.last).getTime());
      }
    }

    let pick: number | null = null;
    let bestCnt = Number.POSITIVE_INFINITY;
    let oldestLast = Number.POSITIVE_INFINITY;

    for (const userId of candidates) {
      const cnt = cntMap.get(userId) ?? 0;
      // "Longest since last booking" → smallest last-booked timestamp wins
      // the tiebreak. Candidates with no prior booking are treated as
      // having booked at epoch 0, which makes them maximally "available".
      const last = lastMap.get(userId) ?? 0;

      if (cnt < bestCnt || (cnt === bestCnt && last < oldestLast)) {
        pick = userId;
        bestCnt = cnt;
        oldestLast = last;
      }
    }

    return pick;
  }

  if (page.assignmentMode === 'fewest_upcoming') {
    const upcoming = await db
      .select({
        userId: bookings.assignedTo,
        cnt: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingPageId, bookingPageId),
          ne(bookings.status, 'cancelled'),
          gte(bookings.startTime, now),
        ),
      )
      .groupBy(bookings.assignedTo);

    const cntMap = new Map<number, number>();
    for (const row of upcoming) {
      if (row.userId != null) cntMap.set(row.userId, Number(row.cnt));
    }

    let pick: number | null = null;
    let bestCnt = Number.POSITIVE_INFINITY;
    for (const userId of candidates) {
      const cnt = cntMap.get(userId) ?? 0;
      if (cnt < bestCnt) {
        pick = userId;
        bestCnt = cnt;
      }
    }
    return pick;
  }

  // Unknown mode → no auto-assign.
  return null;
}

/**
 * Test-only: lets unit tests inject pre-resolved page metadata + counts
 * without round-tripping the database. Production callers use pickAssignee.
 */
export interface PickAssigneeInputs {
  assignmentMode: AssignmentMode;
  candidates: number[];
  /** userId → count of bookings in next 7 days */
  upcomingNext7Days: Map<number, number>;
  /** userId → count of all upcoming bookings */
  upcomingAll: Map<number, number>;
  /** userId → ms timestamp of most recent created booking (for tiebreaker) */
  lastBookedAt: Map<number, number>;
}

export function pickAssigneePure(input: PickAssigneeInputs): number | null {
  if (input.assignmentMode === 'fixed') return null;
  if (input.candidates.length === 0) return null;

  if (input.assignmentMode === 'round_robin') {
    let pick: number | null = null;
    let bestCnt = Number.POSITIVE_INFINITY;
    let oldestLast = Number.POSITIVE_INFINITY;
    for (const userId of input.candidates) {
      const cnt = input.upcomingNext7Days.get(userId) ?? 0;
      const last = input.lastBookedAt.get(userId) ?? 0;
      if (cnt < bestCnt || (cnt === bestCnt && last < oldestLast)) {
        pick = userId;
        bestCnt = cnt;
        oldestLast = last;
      }
    }
    return pick;
  }

  if (input.assignmentMode === 'fewest_upcoming') {
    let pick: number | null = null;
    let bestCnt = Number.POSITIVE_INFINITY;
    for (const userId of input.candidates) {
      const cnt = input.upcomingAll.get(userId) ?? 0;
      if (cnt < bestCnt) {
        pick = userId;
        bestCnt = cnt;
      }
    }
    return pick;
  }

  return null;
}
