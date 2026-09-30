'use client';

import Link from 'next/link';
import { pBtnPrimary } from '@/components/portal/portal-ui';
import { formatCents, formatDate, type Invoice } from '@/components/portal/billing/use-billing-data';

const invoiceStatusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

export default function InvoicesTable({ invoices, loading }: { invoices: Invoice[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <span className="material-icons text-5xl text-muted-foreground/40">receipt_long</span>
        <h3 className="mt-4 font-display font-extrabold tracking-[-0.01em] text-foreground">No invoices yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">Invoices will appear here when created.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-accent/50 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/portal/invoices/${inv.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                  {inv.number}
                </Link>
              </td>
              <td className="px-4 py-3 font-display font-extrabold tracking-[-0.02em] text-foreground">{formatCents(inv.total)}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${invoiceStatusStyles[inv.status] ?? invoiceStatusStyles.draft}`}>
                  {inv.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {inv.status === 'paid' ? formatDate(inv.paidAt) : formatDate(inv.dueDate)}
              </td>
              <td className="px-4 py-3">
                {(inv.status === 'sent' || inv.status === 'overdue') && (
                  <Link
                    href={`/portal/invoices/${inv.id}`}
                    className={`${pBtnPrimary} text-xs px-3 py-1 w-fit`}
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
    </div>
  );
}
