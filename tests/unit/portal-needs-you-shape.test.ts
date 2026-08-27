import { describe, it, expect } from 'vitest';
import { ago, sortNeedsYou, needsYouSummary } from '@/lib/portal/needs-you-shape';

const now = new Date('2026-08-27T15:00:00Z');
const at = (iso: string) => new Date(iso);

describe('needs-you shape (PUX-145)', () => {
  it('ago() reads like a person wrote it', () => {
    expect(ago(at('2026-08-27T14:59:40Z'), now)).toBe('just now');
    expect(ago(at('2026-08-27T14:20:00Z'), now)).toBe('40 min ago');
    expect(ago(at('2026-08-27T13:00:00Z'), now)).toBe('2 h ago');
    expect(ago(at('2026-08-26T10:00:00Z'), now)).toBe('yesterday');
    expect(ago(at('2026-08-24T10:00:00Z'), now)).toBe('3 days ago');
    expect(ago(at('2026-07-01T10:00:00Z'), now)).toBe('Jul 1');
    expect(ago(at('2026-08-27T16:00:00Z'), now)).toBe('just now'); // clock skew never goes negative
  });

  it('sortNeedsYou(): urgent first, then newest activity; input untouched', () => {
    const rows = [
      { key: 'reply:1', at: at('2026-08-27T12:00:00Z') },
      { key: 'pay:overdue', at: at('2026-08-01T00:00:00Z'), urgent: true },
      { key: 'approve:2', at: at('2026-08-27T14:00:00Z') },
      { key: 'pay:due', at: at('2026-08-29T00:00:00Z') },
    ];
    const snapshot = JSON.stringify(rows);
    expect(sortNeedsYou(rows).map((r) => r.key)).toEqual(['pay:overdue', 'pay:due', 'approve:2', 'reply:1']);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('needsYouSummary() handles 0 / 1 / n', () => {
    expect(needsYouSummary(0)).toBe('Nothing needs you right now.');
    expect(needsYouSummary(1)).toBe('One thing wants you today.');
    expect(needsYouSummary(7)).toBe('7 things want you today.');
  });
});
