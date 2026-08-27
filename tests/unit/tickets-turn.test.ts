import { describe, it, expect } from 'vitest';
import { categoryLabel, isTurn, statusesForTurn, turnLabel, whoseTurn, TURNS } from '@/lib/tickets/turn';

describe('tickets whose-turn (PUX-155)', () => {
  it('maps every stored status to a turn; unknown → ours, never "waiting on you"', () => {
    expect(whoseTurn('waiting_on_customer')).toBe('you');
    expect(whoseTurn('waiting')).toBe('you'); // legacy value
    expect(whoseTurn('open')).toBe('us');
    expect(whoseTurn('in_progress')).toBe('us');
    expect(whoseTurn('resolved')).toBe('done');
    expect(whoseTurn('closed')).toBe('done');
    expect(whoseTurn('something_new')).toBe('us');
    expect(turnLabel('waiting_on_customer')).toBe('Waiting on you');
    expect(turnLabel('closed')).toBe('Resolved');
  });
  it('tabs partition the statuses with no overlap', () => {
    const all = TURNS.flatMap((t) => t.statuses);
    expect(new Set(all).size).toBe(all.length);
    expect(statusesForTurn('you')).toEqual(['waiting_on_customer', 'waiting']);
    expect(isTurn('you') && isTurn('us') && isTurn('done')).toBe(true);
    expect(isTurn('all')).toBe(false);
    expect(isTurn(undefined)).toBe(false);
  });
  it('category labels', () => {
    expect(categoryLabel('billing')).toBe('Billing');
    expect(categoryLabel('store_orders')).toBe('Store orders');
    expect(categoryLabel(null)).toBe('—');
  });
});
