// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { STALE_AFTER_DAYS, daysSinceActivity, isStale } from '@/lib/crm/deal-stale';
import DealsTable from '@/app/portal/crm/deals/_components/DealsTable';
import DealKanban from '@/app/portal/crm/deals/_components/DealKanban';
import type { Deal, Stage } from '@/app/portal/crm/deals/_lib/types';

afterEach(cleanup);
const DAY = 86_400_000;
const now = Date.parse('2026-08-28T00:00:00Z');
const deal = (o: Partial<Deal>): Deal => ({
  id: 1, title: 'Summit Bank retreat', value: 18400, status: 'open', priority: 'medium', expectedCloseDate: null, contactId: null, contactName: null,
  companyId: null, companyName: 'Summit Bank', stageId: 10, pipelineId: 1, notes: null, ownerId: null, ownerName: 'Marta', recurringValue: null, billingCycle: null,
  createdAt: new Date(now - 60 * DAY).toISOString(), ...o,
});
const stages: Stage[] = [{ id: 10, name: 'Proposal', color: null, probability: 60, order: 1 }];

describe('PUX-171 deal staleness', () => {
  it('counts from the last activity, falling back to creation, and applies the cron rule', () => {
    expect(STALE_AFTER_DAYS).toBe(30);
    expect(daysSinceActivity(deal({ lastActivityAt: new Date(now - 3 * DAY).toISOString() }), now)).toBe(3);
    expect(daysSinceActivity(deal({ lastActivityAt: null }), now)).toBe(60);
    expect(isStale(deal({ lastActivityAt: new Date(now - 31 * DAY).toISOString() }), now)).toBe(true);
    expect(isStale(deal({ lastActivityAt: new Date(now - 29 * DAY).toISOString() }), now)).toBe(false);
    expect(isStale(deal({ status: 'won', lastActivityAt: null }), now)).toBe(false);
  });

  it('DealsTable: rows open the deal, footer totals the pipeline', () => {
    const onOpen = vi.fn();
    render(<DealsTable deals={[deal({ id: 1 }), deal({ id: 2, title: 'Lumen retreat', value: 9800, lastActivityAt: new Date().toISOString() })]} stages={stages} onOpenDeal={onOpen} />);
    fireEvent.click(screen.getByText('Lumen retreat'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    expect(screen.getByText(/Stalled 60d/)).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText(/2 deals ·/).textContent).toContain('$282.00'); // values are cents
  });

  it('DealKanban studio: a Stalled pill on the cold card, a quiet age on the rest; legacy has neither', () => {
    const props = { stages, loading: false, onMoveDeal: vi.fn(), onOpenDeal: vi.fn() };
    const deals = [deal({ id: 1 }), deal({ id: 2, title: 'Fresh', lastActivityAt: new Date(Date.now() - 2 * DAY).toISOString() })];
    const { container, rerender } = render(<DealKanban {...props} deals={deals} studio />);
    expect(container.textContent).toContain('Stalled 60d');
    expect(container.textContent).toContain('2d');
    rerender(<DealKanban {...props} deals={deals} />);
    expect(container.textContent).not.toContain('Stalled');
  });
});
