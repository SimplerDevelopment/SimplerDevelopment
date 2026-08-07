import { describe, it, expect } from 'vitest';
import {
  normalizeLineItems,
  lineItemTotal,
  sumLineItems,
  num,
} from '@/lib/proposals/line-items';
import { formatMoney } from '@/lib/utils/money';

/**
 * Regression: proposal line items are untyped JSON. The canonical schema field is
 * `quantity`, but the portal editor historically read AND wrote `qty`. A reader
 * assuming one name got `undefined * unitPrice` = NaN, which rendered as "$NaN" on
 * the client-facing /proposal/[token] page. A later `(li.qty || 0)` patch on the
 * list page turned that into a silently-wrong $0.00 instead.
 */
describe('normalizeLineItems', () => {
  it('reads the canonical `quantity` field', () => {
    const [li] = normalizeLineItems([{ id: 'a', description: 'x', quantity: 3, unitPrice: 500 }]);
    expect(li.quantity).toBe(3);
    expect(lineItemTotal(li)).toBe(1500);
  });

  it('accepts the legacy `qty` alias written by the portal editor', () => {
    const [li] = normalizeLineItems([{ id: 'a', description: 'x', qty: 3, unitPrice: 500 }]);
    expect(li.quantity).toBe(3);
    expect(lineItemTotal(li)).toBe(1500);
  });

  it('never yields NaN when quantity is missing entirely', () => {
    const [li] = normalizeLineItems([{ id: 'a', description: 'x', unitPrice: 500 }]);
    expect(li.quantity).toBe(0);
    expect(Number.isNaN(lineItemTotal(li))).toBe(false);
    expect(formatMoney(lineItemTotal(li))).toBe('$0.00');
  });

  it('coerces numeric strings and rejects junk', () => {
    expect(num('12')).toBe(12);
    expect(num('abc')).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num(Infinity)).toBe(0);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeLineItems(null)).toEqual([]);
    expect(normalizeLineItems(undefined)).toEqual([]);
    expect(normalizeLineItems({} as unknown)).toEqual([]);
  });

  it('sums a mixed-shape list without NaN poisoning the total', () => {
    const items = normalizeLineItems([
      { id: 'a', description: 'canonical', quantity: 2, unitPrice: 1000 },
      { id: 'b', description: 'legacy', qty: 1, unitPrice: 500 },
      { id: 'c', description: 'broken', unitPrice: 999 },
    ]);
    // 2000 + 500 + 0 — the broken row contributes nothing rather than NaN.
    expect(sumLineItems(items)).toBe(2500);
    expect(formatMoney(sumLineItems(items))).toBe('$25.00');
  });
});

describe('formatMoney', () => {
  it('refuses to render "$NaN" for a non-finite amount', () => {
    expect(formatMoney(NaN)).toBe('$0.00');
    expect(formatMoney(undefined as unknown as number)).toBe('$0.00');
    expect(formatMoney(Infinity)).toBe('$0.00');
  });

  it('still formats real amounts correctly', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(0)).toBe('$0.00');
  });
});
