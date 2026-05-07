// @vitest-environment node
/**
 * Unit tests for the pure round-robin assignment logic.
 *
 * Uses pickAssigneePure so we don't have to spin up a database — pickAssignee
 * itself is just a thin wrapper that pulls the four maps + candidate list out
 * of Drizzle and hands them to pickAssigneePure. The DB-coupled path is
 * exercised in tests/e2e/group-booking.spec.ts.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  bookingPages: {},
  bookingPageMembers: {},
  bookings: {},
}));

const { pickAssigneePure } = await import('@/lib/booking/assign');

describe('pickAssigneePure — fixed mode', () => {
  it('returns null so the caller falls back to the page owner', () => {
    const pick = pickAssigneePure({
      assignmentMode: 'fixed',
      candidates: [1, 2, 3],
      upcomingNext7Days: new Map(),
      upcomingAll: new Map(),
      lastBookedAt: new Map(),
    });
    expect(pick).toBeNull();
  });
});

describe('pickAssigneePure — round_robin mode', () => {
  it('picks the candidate with the fewest bookings in the next 7 days', () => {
    const pick = pickAssigneePure({
      assignmentMode: 'round_robin',
      candidates: [10, 20, 30],
      upcomingNext7Days: new Map([
        [10, 5],
        [20, 1],
        [30, 3],
      ]),
      upcomingAll: new Map(),
      lastBookedAt: new Map(),
    });
    expect(pick).toBe(20);
  });

  it('treats unknown candidates (no bookings) as zero count', () => {
    const pick = pickAssigneePure({
      assignmentMode: 'round_robin',
      candidates: [10, 20, 30],
      upcomingNext7Days: new Map([
        [10, 5],
        [20, 2],
        // 30 absent → 0 → wins
      ]),
      upcomingAll: new Map(),
      lastBookedAt: new Map(),
    });
    expect(pick).toBe(30);
  });

  it('breaks ties by longest time since last booking', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pick = pickAssigneePure({
      assignmentMode: 'round_robin',
      candidates: [10, 20, 30],
      // all three tied at 2 upcoming — tiebreaker should pick #30 (oldest last booking)
      upcomingNext7Days: new Map([
        [10, 2],
        [20, 2],
        [30, 2],
      ]),
      upcomingAll: new Map(),
      lastBookedAt: new Map([
        [10, oneHourAgo],
        [20, oneDayAgo],
        [30, oneWeekAgo],
      ]),
    });
    expect(pick).toBe(30);
  });

  it('candidates without a previous booking win the tiebreaker outright', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const pick = pickAssigneePure({
      assignmentMode: 'round_robin',
      candidates: [10, 20, 30],
      upcomingNext7Days: new Map([
        [10, 0],
        [20, 0],
        [30, 0],
      ]),
      upcomingAll: new Map(),
      // 30 has never been booked → last = 0 → oldest
      lastBookedAt: new Map([
        [10, oneHourAgo],
        [20, oneHourAgo - 1000],
      ]),
    });
    expect(pick).toBe(30);
  });

  it('returns null when the candidate pool is empty', () => {
    const pick = pickAssigneePure({
      assignmentMode: 'round_robin',
      candidates: [],
      upcomingNext7Days: new Map(),
      upcomingAll: new Map(),
      lastBookedAt: new Map(),
    });
    expect(pick).toBeNull();
  });

  it('respects the explicit candidate list — non-pool members never win', () => {
    // user 99 has the lowest count but isn't in candidates — should be ignored.
    const pick = pickAssigneePure({
      assignmentMode: 'round_robin',
      candidates: [10, 20],
      upcomingNext7Days: new Map([
        [10, 3],
        [20, 5],
        [99, 0],
      ]),
      upcomingAll: new Map(),
      lastBookedAt: new Map(),
    });
    expect(pick).toBe(10);
  });
});

describe('pickAssigneePure — fewest_upcoming mode', () => {
  it('uses the all-upcoming map, not the 7-day map', () => {
    const pick = pickAssigneePure({
      assignmentMode: 'fewest_upcoming',
      candidates: [10, 20, 30],
      // 7-day map says 20 wins, but fewest_upcoming should ignore it
      upcomingNext7Days: new Map([
        [10, 5],
        [20, 0],
        [30, 5],
      ]),
      upcomingAll: new Map([
        [10, 100],
        [20, 200],
        [30, 50], // fewest overall → wins
      ]),
      lastBookedAt: new Map(),
    });
    expect(pick).toBe(30);
  });

  it('falls back to zero for candidates with no upcoming bookings', () => {
    const pick = pickAssigneePure({
      assignmentMode: 'fewest_upcoming',
      candidates: [10, 20, 30],
      upcomingNext7Days: new Map(),
      upcomingAll: new Map([
        [10, 4],
        // 20 absent → 0 → wins
        [30, 7],
      ]),
      lastBookedAt: new Map(),
    });
    expect(pick).toBe(20);
  });

  it('returns null when the candidate pool is empty', () => {
    const pick = pickAssigneePure({
      assignmentMode: 'fewest_upcoming',
      candidates: [],
      upcomingNext7Days: new Map(),
      upcomingAll: new Map(),
      lastBookedAt: new Map(),
    });
    expect(pick).toBeNull();
  });
});
