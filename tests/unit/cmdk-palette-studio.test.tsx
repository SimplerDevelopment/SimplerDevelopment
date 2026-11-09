/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * PUX-147 — the ⌘K palette under `portal-redesign`: one section per entity
 * type in the doc's order, tickets indexed from their own route, Actions last
 * with "Ask the Brain" always on offer. Flag off: today's two buckets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { FeatureFlagsProvider } from '@/components/portal/FeatureFlagsProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/portal/dashboard',
}));
import CmdKPalette from '@/components/CmdKPalette';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const HITS = [
  { type: 'note', id: 1, title: 'Call notes — Summit Bank onboarding', snippet: '', score: 0.9, url: '/portal/brain/knowledge/1' },
  { type: 'contact', id: 2, title: 'Jordan Whitfield', snippet: 'Head of People', score: 0.8, url: '/portal/crm/contacts/2' },
  { type: 'deal', id: 3, title: 'Summit Bank corporate retreat', snippet: '$18,400', score: 0.7, url: '/portal/crm/deals/3' },
  { type: 'post', id: 4, title: 'Sunrise Summit — Guided Trip', snippet: '', score: 0.6, url: '/portal/websites/1/posts/4' },
];
const TICKETS = [{ id: 482, number: 482, subject: 'Coupon code not applying at checkout', status: 'waiting_on_customer' }];

const originalFetch = global.fetch;
beforeEach(() => {
  (Element.prototype as any).scrollIntoView = function () {};
  global.fetch = vi.fn(async (input: any) => {
    const u = String(input);
    if (u.includes('/api/portal/tickets')) return json({ success: true, data: TICKETS });
    if (u.includes('/api/portal/brain/search')) return json({ success: true, data: { hits: HITS, total: 4, query: 'summit' } });
    return json({ success: true, data: [] });
  }) as any;
});
afterEach(() => { cleanup(); global.fetch = originalFetch; });

async function typeAndSettle(value: string) {
  const input = screen.getByPlaceholderText(/Jump to a page/i);
  await act(async () => { fireEvent.change(input, { target: { value } }); });
  await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
}
const headers = () => screen.getAllByText(/^(Pages|People|Companies|Deals|Brain notes|Meetings|Tasks|Relationships|Tickets|Actions|Create|Navigate|Search results|Quick access)$/).map((el) => el.textContent);

describe('CmdKPalette under portal-redesign (PUX-147)', () => {
  it('groups hits by entity type in the doc order, tickets included, Actions last', async () => {
    render(
      <FeatureFlagsProvider flags={['portal-redesign']}>
        <CmdKPalette open onClose={() => {}} />
      </FeatureFlagsProvider>,
    );
    await typeAndSettle('summit');
    const h = headers();
    expect(h).toEqual(['Pages', 'People', 'Deals', 'Brain notes', 'Tickets', 'Actions']);
    expect(screen.getByText('#482 Coupon code not applying at checkout')).toBeTruthy();
    expect(screen.getByText('waiting on customer')).toBeTruthy();
    expect(screen.getByText('Ask the Brain')).toBeTruthy(); // always offered with a query
    const calls = (global.fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('/api/portal/tickets?q=summit&limit=5'))).toBe(true);
  });

  it('flag off: today\'s Create / Search results buckets, nothing grouped by type', async () => {
    render(<CmdKPalette open onClose={() => {}} />);
    await typeAndSettle('summit');
    const h = headers();
    expect(h[h.length - 1]).toBe('Search results');
    expect(h).not.toContain('People');
    expect(h).not.toContain('Actions');
    expect(screen.queryByText('Ask the Brain')).toBeNull(); // "summit" doesn't match it, and there's no always-on rule off-flag
  });
});
