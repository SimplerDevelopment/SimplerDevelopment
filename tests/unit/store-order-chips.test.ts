import { describe, it, expect } from 'vitest';
import { chipStatusParam, paymentLabel } from '@/lib/store/order-chips';

describe('order chips (PUX-209)', () => {
  it('maps chips to status lists and payment to a fact', () => {
    expect(chipStatusParam('open')).toBe('pending,confirmed,processing');
    expect(chipStatusParam('refunded')).toBe('cancelled,refunded');
    expect(paymentLabel({ status: 'confirmed', paidAt: '2026-08-01' }).label).toBe('Paid');
    expect(paymentLabel({ status: 'pending', paymentStatus: 'pending' }).label).toBe('Unpaid');
    expect(paymentLabel({ status: 'refunded', paidAt: '2026-08-01' }).label).toBe('Refunded');
  });
});
