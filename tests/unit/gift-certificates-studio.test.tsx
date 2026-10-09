// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { giftTotals } from '@/lib/tools/gift-totals';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));

import GiftCertificatesPage from '@/app/portal/tools/gift-certificates/page';

const certs = [
  { id: 1, code: 'RGO-2C19', initialAmount: 10000, remainingAmount: 0, status: 'fully_redeemed', purchaserName: 'Luis', purchaserEmail: 'l@x', recipientName: null, recipientEmail: null, redeemableAt: 'both', createdAt: '2026-08-01' },
  { id: 2, code: 'RGO-7A10', initialAmount: 5000, remainingAmount: 2000, status: 'active', purchaserName: 'Ana', purchaserEmail: 'a@x', recipientName: 'Bo', recipientEmail: null, redeemableAt: 'store', createdAt: '2026-08-02' },
  { id: 3, code: 'RGO-0000', initialAmount: 2500, remainingAmount: 2500, status: 'cancelled', purchaserName: 'Cy', purchaserEmail: 'c@x', recipientName: null, recipientEmail: null, redeemableAt: 'booking', createdAt: '2026-08-03' },
];

describe('gift certificates (PUX-208)', () => {
  it('totals split outstanding from redeemed', () => {
    expect(giftTotals(certs)).toEqual({ issued: 3, outstanding: 2000, redeemed: 13000 });
  });
  it('under the flag: two tiles, issue as a modal with the one teal inside', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: certs }) })) as any;
    render(<GiftCertificatesPage />);
    expect(await screen.findByText('RGO-2C19')).toBeTruthy();
    const totals = within(screen.getByLabelText('Totals'));
    expect(totals.getByText('$20.00')).toBeTruthy();   // outstanding
    expect(totals.getByText('$130.00')).toBeTruthy();  // redeemed
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('Issue certificate'));
    const dialog = screen.getByRole('dialog', { name: 'Issue a gift certificate' });
    expect(dialog).toBeTruthy();
    expect(dialog.querySelector('button[type="submit"]')?.className).toContain('bg-primary');
  });
});
