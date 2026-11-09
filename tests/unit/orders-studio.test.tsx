// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useParams: () => ({ siteId: '3' }), useRouter: () => ({ push: vi.fn() }) }));

import OrdersListPage from '@/app/portal/websites/[siteId]/store/orders/page';

describe('store orders under the flag (PUX-209)', () => {
  it('chips send a status list, rows show payment + fulfilment, bulk Mark fulfilled PUTs each order', async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [
        { id: 1, orderNumber: '#2041', customerName: 'Luis', customerEmail: 'l@x', totalCents: 12500, status: 'processing', itemCount: 2, createdAt: '2026-08-01', paidAt: '2026-08-01', paymentStatus: 'paid' },
      ], pagination: { totalPages: 1 } }) } as Response);
    }) as any;
    render(<OrdersListPage />);
    expect(await screen.findByText('#2041')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Processing')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Open' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('status=pending%2Cconfirmed%2Cprocessing'))).toBe(true));
    fireEvent.click(screen.getByLabelText('Select all'));
    fireEvent.click(screen.getByText('Mark fulfilled'));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.url).toBe('/api/portal/websites/3/store/orders/1'));
    expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body!)).toMatchObject({ status: 'shipped' });
  });
});
