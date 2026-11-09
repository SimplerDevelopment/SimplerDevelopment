import { describe, it, expect } from 'vitest';
import { categoryLabel, isTurn, slaSentence, statusesForTurn, turnLabel, turnPillClass, whoseTurn, TURNS } from '@/lib/tickets/turn';

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
  it('slaSentence: one sentence a client can act on (PUX-156)', () => {
    const now = new Date('2026-08-27T10:00:00Z');
    expect(slaSentence({ status: 'waiting_on_customer' }, now)).toMatch(/^Your turn/);
    expect(slaSentence({ status: 'open', firstResponseDueAt: '2026-08-27T14:12:00Z' }, now)).toBe('Reply due in 4h 12m.');
    expect(slaSentence({ status: 'in_progress', firstResponseDueAt: '2026-08-27T08:00:00Z' }, now)).toMatch(/^Our reply is 2h overdue/);
    expect(slaSentence({ status: 'in_progress', firstResponseAt: '2026-08-27T09:00:00Z', firstResponseDueAt: '2026-08-27T08:00:00Z', resolutionDueAt: '2026-08-29T10:00:00Z' }, now)).toMatch(/^With our team — resolve by /);
    expect(slaSentence({ status: 'open' }, now)).toBe('With our team.');
    expect(slaSentence({ status: 'closed', resolvedAt: '2026-08-26T10:00:00Z' }, now)).toMatch(/^Resolved /);
    expect(turnPillClass('you')).toContain('warn');
  });
});
