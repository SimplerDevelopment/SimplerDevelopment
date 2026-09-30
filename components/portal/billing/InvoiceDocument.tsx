/**
 * PUX-192 (design doc screen 51): an invoice that reads like an invoice —
 * a document card (number, dates, line items, totals in tabular numerals)
 * beside an actions card and the row's own payment trail. Pay stays the
 * existing PayInvoiceButton under the same canPay, drawn as the one teal;
 * Download PDF is a ghost to the pdf route. Studio-only (page gates on hasFlag).
 */
import { formatCents, invoiceStatusColor, invoiceStatusLabel } from '@/lib/portal-utils';
import { canPayInvoice, invoiceTrail } from '@/lib/billing/invoice-shape';
import PayInvoiceButton from '@/components/portal/PayInvoiceButton';
import { sBtnGhost } from '@/components/portal/portal-ui';

type Invoice = { id: number; number: string; status: string; createdAt: Date | string; dueDate?: Date | string | null; paidAt?: Date | string | null; subtotal: number; tax: number; total: number; notes?: string | null };
type Item = { id: number; description: string; quantity: number; unitPrice: number; total: number };

const DOT: Record<'ok' | 'warn' | 'muted', string> = { ok: 'bg-[var(--portal-ok)]', warn: 'bg-[var(--portal-warn)]', muted: 'bg-border' };

export default function InvoiceDocument({ invoice, items }: { invoice: Invoice; items: Item[] }) {
  const canPay = canPayInvoice(invoice.status);
  const fmt = (d: Date | string) => new Date(d).toLocaleDateString();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
      <article className="rounded-2xl border border-border bg-card" aria-label={`Invoice ${invoice.number}`}>
        <header className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Invoice</p>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{invoice.number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Issued {fmt(invoice.createdAt)}{invoice.dueDate && ` · Due ${fmt(invoice.dueDate)}`}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${invoiceStatusColor(invoice.status)}`}>{invoiceStatusLabel(invoice.status)}</span>
        </header>
        <div className="p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                <th className="pb-2 font-semibold">Description</th>
                <th className="pb-2 text-right font-semibold">Qty</th>
                <th className="pb-2 text-right font-semibold">Unit</th>
                <th className="pb-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 text-foreground">{it.description}</td>
                  <td className="py-3 text-right text-muted-foreground">{it.quantity}</td>
                  <td className="py-3 text-right text-muted-foreground">{formatCents(it.unitPrice)}</td>
                  <td className="py-3 text-right font-medium text-foreground">{formatCents(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm tabular-nums">
            <div className="flex justify-between text-muted-foreground"><dt>Subtotal</dt><dd>{formatCents(invoice.subtotal)}</dd></div>
            {invoice.tax > 0 && <div className="flex justify-between text-muted-foreground"><dt>Tax</dt><dd>{formatCents(invoice.tax)}</dd></div>}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold text-foreground"><dt>Total</dt><dd className="font-display font-extrabold tracking-[-0.02em]">{formatCents(invoice.total)}</dd></div>
          </dl>
          {invoice.notes && <p className="mt-4 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground"><strong className="text-foreground">Notes:</strong> {invoice.notes}</p>}
        </div>
        {canPay && (
          <footer className="flex items-center justify-between gap-4 border-t border-border p-6">
            <div>
              <p className="font-semibold text-foreground">Amount due: {formatCents(invoice.total)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Pay securely via Stripe — all major cards accepted.</p>
            </div>
            <PayInvoiceButton invoiceId={invoice.id} total={invoice.total} studio />
          </footer>
        )}
      </article>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <a href={`/api/portal/invoices/${invoice.id}/pdf`} className={`${sBtnGhost} w-full justify-center`}>
            <span className="material-icons text-base">download</span>Download PDF
          </a>
        </div>
        <section className="rounded-2xl border border-border bg-card p-5" aria-label="Payment history">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Payment history</p>
          <ol className="mt-3 space-y-2 text-sm">
            {invoiceTrail(invoice).map((t) => (
              <li key={t.label} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${DOT[t.tone]}`} aria-hidden />
                <span className="text-foreground">{t.label}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">{fmt(t.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
