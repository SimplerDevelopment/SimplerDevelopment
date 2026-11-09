import { describe, it, expect } from 'vitest';
import { stockLabel } from '@/lib/store/stock-label';

describe('stockLabel (PUX-186)', () => {
  it('maps inventory to a signal', () => {
    expect(stockLabel({ trackInventory: false, quantity: 99 })).toEqual({ label: 'Not tracked', tone: 'muted' });
    expect(stockLabel({ trackInventory: true, quantity: 0 })).toEqual({ label: 'Sold out', tone: 'warn' });
    expect(stockLabel({ trackInventory: true, quantity: 4 })).toEqual({ label: '4 left', tone: 'warn' });
    expect(stockLabel({ trackInventory: true, quantity: 6 })).toEqual({ label: '6 in stock', tone: 'ok' });
    expect(stockLabel({ trackInventory: true, quantity: 10 }, 12)).toEqual({ label: '10 left', tone: 'warn' });
  });
});
