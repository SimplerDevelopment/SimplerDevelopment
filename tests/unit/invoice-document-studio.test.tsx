// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvoiceDocument from '@/components/portal/billing/InvoiceDocument';

const invoice = { id: 42, number: 'INV-042', status: 'overdue', createdAt: '2026-08-01T00:00:00Z', dueDate: '2026-08-15T00:00:00Z', paidAt: null, subtotal: 10000, tax: 500, total: 10500, notes: null };

describe('InvoiceDocument (PUX-192)', () => {
  it('renders the document, one teal Pay, a PDF ghost and the trail', () => {
    render(<InvoiceDocument invoice={invoice} items={[{ id: 1, description: 'Design', quantity: 2, unitPrice: 5000, total: 10000 }]} />);
    expect(screen.getByLabelText('Invoice INV-042')).toBeTruthy();
    expect(screen.getByText('$105.00')).toBeTruthy();
    expect(screen.getByText('Pay Now').closest('button')?.className).toContain('bg-primary');
    expect(screen.getByText('Download PDF').closest('a')?.getAttribute('href')).toBe('/api/portal/invoices/42/pdf');
    expect(screen.getByLabelText('Payment history').textContent).toContain('Due');
  });
});
