// @vitest-environment node
/**
 * Locks in the booking/bookings category alias (OBQA-021): the billed catalog
 * row is 'bookings' (scripts/seed-domain-modules.ts) while every booking gate
 * passes 'booking' — a paying subscriber must clear the gate in both
 * directions, 'bundle' still grants everything, and unrelated categories
 * must not start cross-matching.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { serviceCategoryMatches } from '@/lib/portal-auth';

describe('serviceCategoryMatches', () => {
  it('matches an exact category', () => {
    expect(serviceCategoryMatches('store', 'store')).toBe(true);
  });

  it("treats the billed 'bookings' row as satisfying a 'booking' gate (OBQA-021)", () => {
    expect(serviceCategoryMatches('bookings', 'booking')).toBe(true);
  });

  it("treats a legacy 'booking' row as satisfying a 'bookings' gate", () => {
    expect(serviceCategoryMatches('booking', 'bookings')).toBe(true);
  });

  it('bundle grants any category', () => {
    expect(serviceCategoryMatches('bundle', 'booking')).toBe(true);
    expect(serviceCategoryMatches('bundle', 'store')).toBe(true);
  });

  it('does not cross-match unrelated categories', () => {
    expect(serviceCategoryMatches('store', 'booking')).toBe(false);
    expect(serviceCategoryMatches('brain', 'bookings')).toBe(false);
    expect(serviceCategoryMatches('booking', 'store')).toBe(false);
  });
});
