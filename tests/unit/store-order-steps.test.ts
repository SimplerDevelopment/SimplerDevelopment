import { describe, it, expect } from 'vitest';
import { orderSteps, terminalLabel, canFulfil } from '@/lib/store/order-steps';

describe('order steps (PUX-187)', () => {
  it('folds seven statuses onto three steps', () => {
    expect(orderSteps('pending').map((s) => s.state)).toEqual(['current', 'todo', 'todo']);
    expect(orderSteps('processing').map((s) => s.state)).toEqual(['done', 'current', 'todo']);
    expect(orderSteps('delivered').map((s) => s.state)).toEqual(['done', 'done', 'current']);
    expect(terminalLabel('refunded')).toBe('Refunded');
    expect(terminalLabel('shipped')).toBeNull();
    expect(canFulfil('confirmed')).toBe(true);
    expect(canFulfil('shipped')).toBe(false);
    expect(canFulfil('cancelled')).toBe(false);
  });
});
