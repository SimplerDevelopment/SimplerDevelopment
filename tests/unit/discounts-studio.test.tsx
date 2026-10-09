// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useParams: () => ({ siteId: '3' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));

import DiscountsPage from '@/app/portal/websites/[siteId]/store/discounts/page';

describe('discounts under the flag (PUX-211)', () => {
  it('row switch PUTs {active}, New discount is the teal, shipping zones fold in read-only', async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      const data = url.includes('/shipping')
        ? [{ id: 1, name: 'Local pickup', countries: ['US'], rates: [{ name: 'Pickup at trailhead', price: 0 }] }]
        : [{ id: 7, code: 'SPRING15', discountType: 'percentage', amount: 1500, minOrderAmount: null, maxUses: null, usedCount: 12, active: true, startsAt: null, expiresAt: null }];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) } as Response);
    }) as any;
    render(<DiscountsPage />);
    expect(await screen.findByText('SPRING15')).toBeTruthy();
    expect(screen.getByText('New discount').closest('button')?.className).toContain('bg-primary');
    expect(await screen.findByText('Local pickup')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Deactivate SPRING15' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.url).toBe('/api/portal/websites/3/store/discounts/7'));
    expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body!)).toEqual({ active: false });
  });
});
