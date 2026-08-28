import { describe, it, expect } from 'vitest';
import { weeklySeries, seriesPoints } from '@/lib/email/weekly';

describe('weeklySeries (PUX-205)', () => {
  it('buckets sent campaigns into twelve honest weeks', () => {
    const now = new Date('2026-08-28T12:00:00Z');
    const s = weeklySeries([
      { sentAt: '2026-08-26T10:00:00Z', totalSent: 100, totalOpened: 40, totalClicked: 5 },
      { sentAt: '2026-08-20T10:00:00Z', totalSent: 50, totalOpened: 10, totalClicked: 1 },
      { sentAt: '2026-01-01T10:00:00Z', totalSent: 999, totalOpened: 1, totalClicked: 1 }, // outside the window
      { sentAt: null, totalSent: 7, totalOpened: 0, totalClicked: 0 }, // never sent
    ], 12, now);
    expect(s).toHaveLength(12);
    expect(s[11].sent).toBe(100);
    expect(s[10].sent).toBe(50);
    expect(s.reduce((a, p) => a + p.sent, 0)).toBe(150);
    expect(seriesPoints(s, 'sent').split(' ')).toHaveLength(12);
  });
});
