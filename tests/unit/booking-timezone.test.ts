import { describe, it, expect } from 'vitest';
import {
  zonedWallTimeToUtc,
  zonedMinutesOfDay,
  zonedDayOfWeek,
  zonedDateStr,
} from '@/lib/booking/timezone';

const NY = 'America/New_York';

describe('booking timezone helpers', () => {
  describe('zonedWallTimeToUtc', () => {
    it('maps 9:00 AM EDT (summer) to 13:00 UTC', () => {
      expect(zonedWallTimeToUtc('2026-07-15', 9, 0, NY).toISOString()).toBe('2026-07-15T13:00:00.000Z');
    });
    it('maps 5:00 PM EDT (summer) to 21:00 UTC', () => {
      expect(zonedWallTimeToUtc('2026-07-15', 17, 0, NY).toISOString()).toBe('2026-07-15T21:00:00.000Z');
    });
    it('maps 9:00 AM EST (winter) to 14:00 UTC', () => {
      expect(zonedWallTimeToUtc('2026-01-15', 9, 0, NY).toISOString()).toBe('2026-01-15T14:00:00.000Z');
    });
    it('handles half-hour offsets (30-min grid) in summer', () => {
      expect(zonedWallTimeToUtc('2026-07-15', 9, 30, NY).toISOString()).toBe('2026-07-15T13:30:00.000Z');
    });
    it('is identity for UTC', () => {
      expect(zonedWallTimeToUtc('2026-07-15', 9, 0, 'UTC').toISOString()).toBe('2026-07-15T09:00:00.000Z');
    });
  });

  describe('zonedMinutesOfDay', () => {
    it('reads 9 AM Eastern from the 13:00 UTC instant', () => {
      expect(zonedMinutesOfDay(new Date('2026-07-15T13:00:00Z'), NY)).toBe(9 * 60);
    });
    it('reads 5 PM Eastern from the 21:00 UTC instant', () => {
      expect(zonedMinutesOfDay(new Date('2026-07-15T21:00:00Z'), NY)).toBe(17 * 60);
    });
  });

  describe('zonedDayOfWeek + zonedDateStr', () => {
    it('July 15 2026 13:00 UTC is Wednesday (3) in Eastern', () => {
      expect(zonedDayOfWeek(new Date('2026-07-15T13:00:00Z'), NY)).toBe(3);
      expect(zonedDateStr(new Date('2026-07-15T13:00:00Z'), NY)).toBe('2026-07-15');
    });
    it('a late-evening Eastern slot keeps the local calendar date (not the UTC next day)', () => {
      // 11:00 PM ET on 2026-07-15 = 03:00 UTC on 2026-07-16
      const inst = new Date('2026-07-16T03:00:00Z');
      expect(zonedDateStr(inst, NY)).toBe('2026-07-15');
      expect(zonedDayOfWeek(inst, NY)).toBe(3); // still Wednesday in ET
    });
  });

  describe('round-trip', () => {
    it('wall-time -> UTC -> wall-time is stable across a 9–17 grid', () => {
      for (let m = 9 * 60; m <= 17 * 60; m += 30) {
        const utc = zonedWallTimeToUtc('2026-07-15', Math.floor(m / 60), m % 60, NY);
        expect(zonedMinutesOfDay(utc, NY)).toBe(m);
      }
    });
  });
});
