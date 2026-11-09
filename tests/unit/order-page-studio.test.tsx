// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useParams: () => ({ siteId: 'site-1', orderId: '42' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

const order = {
  id: 42, orderNumber: 'ORD-042', status: 'processing', customerName: 'Alice Smith', customerEmail: 'Alice@example.com', customerPhone: null,
  shippingAddress: null, billingAddress: null, items: [], subtotalCents: 0, shippingCents: 0, taxCents: 0, discountCents: 0, totalCents: 0,
  trackingNumber: null, trackingUrl: null, internalNotes: '', statusHistory: [], createdAt: '2026-08-01T00:00:00Z',
};
const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  global.fetch = vi.fn((url: string) => {
    calls.push(url);
    const json = url.includes('/crm/contacts')
      ? { success: true, data: { contacts: [{ id: 9, email: 'alice@example.com' }, { id: 10, email: 'alice@example.com.au' }] } }
      : url.endsWith('/settings') ? { success: true, data: {} }
      : { success: true, data: order };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(json) } as Response);
  }) as any;
});

import OrderDetailPage from '@/app/portal/websites/[siteId]/store/orders/[orderId]/page';

describe('order page under the flag (PUX-187)', () => {
  it('shows the stepper, one teal Mark fulfilled, and links the customer to the exact-email CRM contact', async () => {
    render(<OrderDetailPage />);
    await screen.findByText('ORD-042');
    expect(screen.getByLabelText('Order progress').querySelector('[aria-current="step"]')?.textContent).toContain('Processing');
    expect(screen.queryByText('Mark as Shipped')).toBeNull();
    await waitFor(() => expect(screen.getByText('Alice Smith').closest('a')?.getAttribute('href')).toBe('/portal/crm/contacts/9'));
    fireEvent.click(screen.getByText('Mark fulfilled'));
    await waitFor(() => expect(calls.some((u) => u.endsWith('/orders/42/status'))).toBe(true));
  });
});
