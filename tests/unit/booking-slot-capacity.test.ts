import { describe, it, expect } from 'vitest';
import { capacityLabel, slotKey, slotUsage } from '@/lib/booking/slot-capacity';

describe('PUX-181 slot capacity', () => {
  it('sums seats per (page, start), skipping cancelled, defaulting groupSize to 1', () => {
    const t = '2026-08-25T06:00:00.000Z';
    const m = slotUsage([
      { bookingPageId: 1, startTime: t, groupSize: 4, status: 'confirmed' },
      { bookingPageId: 1, startTime: t, groupSize: 0, status: 'confirmed' },
      { bookingPageId: 1, startTime: t, groupSize: 9, status: 'cancelled' },
      { bookingPageId: 2, startTime: t, groupSize: 2, status: 'confirmed' },
    ]);
    expect(m.get(slotKey(1, t))).toBe(5);
    expect(m.get(slotKey(2, t))).toBe(2);
  });
  it('labels: fraction, Sold out at capacity, nothing for individual pages', () => {
    expect(capacityLabel(6, 10)).toBe('6 / 10');
    expect(capacityLabel(10, 10)).toBe('Sold out');
    expect(capacityLabel(3, null)).toBeNull();
    expect(capacityLabel(3, 0)).toBeNull();
  });
});
