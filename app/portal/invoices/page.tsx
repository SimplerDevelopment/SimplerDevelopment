import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, invoices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatCents, invoiceStatusColor, invoiceStatusLabel } from '@/lib/portal';

export default async function PortalInvoicesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const clientInvoices = await db.select().from(invoices).where(eq(invoices.clientId, client.id)).orderBy(invoices.createdAt);

  const totalDue = clientInvoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-muted-foreground mt-1">View and pay your invoices.</p>
      </div>

      {totalDue > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons text-orange-600">payments</span>
          <div>
            <p className="text-sm font-semibold text-orange-800">Outstanding balance: {formatCents(totalDue)}</p>
            <p className="text-xs text-orange-600">Click an invoice below to pay securely via Stripe.</p>
          </div>
        </div>
      )}

      {clientInvoices.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">receipt_long</span>
          <h3 className="mt-4 font-semibold text-foreground">No invoices yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Invoices will appear here when created by your team.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clientInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/portal/invoices/${inv.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatCents(inv.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${invoiceStatusColor(inv.status)}`}>
                      {invoiceStatusLabel(inv.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {(inv.status === 'sent' || inv.status === 'overdue') && (
                      <Link
                        href={`/portal/invoices/${inv.id}`}
                        className="flex items-center gap-1 text-xs px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors w-fit"
                      >
                        <span className="material-icons text-xs">credit_card</span>
                        Pay Now
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
