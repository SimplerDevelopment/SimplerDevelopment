import { describe, it, expect } from 'vitest';
import { canonicalServiceCategory } from '@/lib/billing/service-category';

describe('canonicalServiceCategory (booking/bookings entitlement fix)', () => {
  it('collapses the booking/bookings alias to one canonical value', () => {
    expect(canonicalServiceCategory('booking')).toBe('bookings');
    expect(canonicalServiceCategory('bookings')).toBe('bookings');
    // so a route gating on either matches a client entitled under either
    expect(canonicalServiceCategory('booking')).toBe(canonicalServiceCategory('bookings'));
  });

  it('passes through unknown categories unchanged', () => {
    expect(canonicalServiceCategory('crm')).toBe('crm');
    expect(canonicalServiceCategory('bundle')).toBe('bundle');
  });

  it('is null-safe', () => {
    expect(canonicalServiceCategory(null)).toBe('');
    expect(canonicalServiceCategory(undefined)).toBe('');
  });
});
