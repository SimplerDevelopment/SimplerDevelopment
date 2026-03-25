import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, invoices, invoiceItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { formatCents, invoiceStatusColor, invoiceStatusLabel } from '@/lib/portal';
import PayInvoiceButton from '@/components/portal/PayInvoiceButton';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  let clientId: number | null = null;
  if (!isStaff) {
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!client) redirect('/portal/dashboard');
    clientId = client.id;
  }

  const invoiceQuery = isStaff
    ? db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
    : db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId!))).limit(1);

  const [invoice] = await invoiceQuery;
  if (!invoice) notFound();

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));

  const canPay = invoice.status === 'sent' || invoice.status === 'overdue';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/billing" className="hover:text-foreground transition-colors">Billing</Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span className="text-foreground">{invoice.number}</span>
      </div>

      {/* Invoice Card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{invoice.number}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Issued {new Date(invoice.createdAt).toLocaleDateString()}
              {invoice.dueDate && ` · Due ${new Date(invoice.dueDate).toLocaleDateString()}`}
            </p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${invoiceStatusColor(invoice.status)}`}>
            {invoiceStatusLabel(invoice.status)}
          </span>
        </div>

        {/* Line Items */}
        <div className="p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="pb-2 font-medium text-muted-foreground">Description</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Qty</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Unit Price</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 text-foreground">{item.description}</td>
                  <td className="py-3 text-right text-muted-foreground">{item.quantity}</td>
                  <td className="py-3 text-right text-muted-foreground">{formatCents(item.unitPrice)}</td>
                  <td className="py-3 text-right font-medium text-foreground">{formatCents(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 border-t border-border pt-4 space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCents(invoice.subtotal)}</span>
            </div>
            {invoice.tax > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax</span>
                <span>{formatCents(invoice.tax)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border mt-2">
              <span>Total</span>
              <span>{formatCents(invoice.total)}</span>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <strong className="text-foreground">Notes:</strong> {invoice.notes}
            </div>
          )}
        </div>

        {/* Payment CTA */}
        {canPay && (
          <div className="p-6 bg-primary/5 border-t border-primary/20">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-foreground">Amount due: {formatCents(invoice.total)}</p>
                <p className="text-sm text-muted-foreground mt-0.5">Pay securely via Stripe — all major cards accepted.</p>
              </div>
              <PayInvoiceButton invoiceId={invoiceId} total={invoice.total} />
            </div>
          </div>
        )}

        {invoice.status === 'paid' && invoice.paidAt && (
          <div className="p-4 bg-green-50 border-t border-green-100 flex items-center gap-2 text-sm text-green-700">
            <span className="material-icons text-base">check_circle</span>
            Paid on {new Date(invoice.paidAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
