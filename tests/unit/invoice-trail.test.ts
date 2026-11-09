import { describe, it, expect } from 'vitest';
import { invoiceTrail, canPayInvoice } from '@/lib/billing/invoice-shape';

describe('invoice trail (PUX-192)', () => {
  it('builds issued / due / paid from the row itself', () => {
    const t = invoiceTrail({ createdAt: '2026-08-01', dueDate: '2026-08-15', paidAt: '2026-08-10', status: 'paid' });
    expect(t.map((x) => x.label)).toEqual(['Issued', 'Was due', 'Paid']);
    expect(t[2].tone).toBe('ok');
    const o = invoiceTrail({ createdAt: '2026-08-01', dueDate: '2026-08-15', paidAt: null, status: 'overdue' });
    expect(o.map((x) => `${x.label}:${x.tone}`)).toEqual(['Issued:muted', 'Due:warn']);
    expect(canPayInvoice('sent')).toBe(true);
    expect(canPayInvoice('paid')).toBe(false);
  });
});
