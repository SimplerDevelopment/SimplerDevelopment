// Service-category normalization.
//
// Some entitlement categories were seeded under two different names over time:
// the legacy `booking-system` service uses category `'booking'` (singular), while
// the current billing module (lib/billing/domain-catalog.ts key `'bookings'`)
// provisions category `'bookings'` (plural). The 22 booking route files gate on
// `requireService: 'booking'`, so a client provisioned via the *current* checkout
// (category `'bookings'`) was 403'd from every booking route unless they happened
// to be on an all-in-one bundle.
//
// Normalizing both the requested and the stored category through this alias map
// makes the two names interchangeable — a client entitled under either name, and
// a route gating on either, resolve to the same entitlement. Breaks nobody, and
// makes standardizing on one name later a no-op.

const CATEGORY_ALIASES: Record<string, string> = {
  booking: 'bookings',
};

/** Canonical form of a service-category string (collapses known aliases). */
export function canonicalServiceCategory(category: string | null | undefined): string {
  if (!category) return '';
  return CATEGORY_ALIASES[category] ?? category;
}
