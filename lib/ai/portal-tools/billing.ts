/**
 * Billing AI tools — invoices, payment methods, pay-invoice navigation.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { invoices, invoiceItems, paymentMethods } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const billingTools: Anthropic.Tool[] = [
  {
    name: 'get_my_invoices',
    description: 'Get all invoices for this client including amounts, status, and due dates.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_invoice_details',
    description: 'Get full details for a single invoice including line items.',
    input_schema: {
      type: 'object' as const,
      properties: { invoice_id: { type: 'number', description: 'The invoice ID' } },
      required: ['invoice_id'],
    },
  },
  {
    name: 'get_payment_methods',
    description: 'Get saved payment methods (cards on file) for this client.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'pay_invoice',
    description: 'Navigate the user to pay a specific invoice. This opens the invoice with the pay button highlighted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'number', description: 'The invoice ID to pay' },
      },
      required: ['invoice_id'],
    },
  },
];

export type BillingHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const billingHandlers: Record<string, BillingHandler> = {
  get_my_invoices: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      createdAt: invoices.createdAt,
    }).from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt));

    return rows.map(inv => ({
      ...inv,
      totalDollars: (inv.total / 100).toFixed(2),
    }));
  },

  get_invoice_details: async (input, clientId, _userId) => {
    const invoiceId = input.invoice_id as number;
    const [inv] = await db.select().from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId))).limit(1);
    if (!inv) return { error: 'Invoice not found' };

    const items = await db.select().from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId));

    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      subtotalDollars: (inv.subtotal / 100).toFixed(2),
      taxDollars: (inv.tax / 100).toFixed(2),
      totalDollars: (inv.total / 100).toFixed(2),
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      notes: inv.notes,
      items: items.map(it => ({
        description: it.description,
        quantity: it.quantity,
        unitPriceDollars: (it.unitPrice / 100).toFixed(2),
        totalDollars: (it.total / 100).toFixed(2),
      })),
    };
  },

  get_payment_methods: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: paymentMethods.id,
      brand: paymentMethods.brand,
      last4: paymentMethods.last4,
      expMonth: paymentMethods.expMonth,
      expYear: paymentMethods.expYear,
      isDefault: paymentMethods.isDefault,
    }).from(paymentMethods).where(eq(paymentMethods.clientId, clientId));
    return rows;
  },

  pay_invoice: async (input, clientId, _userId) => {
    const invoiceId = input.invoice_id as number;
    const [inv] = await db.select({ id: invoices.id, number: invoices.number, status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId))).limit(1);
    if (!inv) return { error: 'Invoice not found' };
    if (inv.status === 'paid') return { message: `Invoice ${inv.number} is already paid.` };
    if (inv.status === 'draft' || inv.status === 'cancelled') return { error: `Invoice ${inv.number} is ${inv.status} and cannot be paid.` };

    return {
      action: 'navigate',
      path: `/portal/billing`,
      section: `invoice-${inv.id}`,
      message: `Click "Pay Now" on invoice ${inv.number} to proceed to checkout.`,
    };
  },
};
