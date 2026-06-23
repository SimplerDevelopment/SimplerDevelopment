import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq, and, count, sum, desc } from 'drizzle-orm';
import Link from 'next/link';
import { formatCents, invoiceStatusColor, invoiceStatusLabel } from '@/lib/portal';

export default async function InvoicesWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [unpaidResult, recent] = await Promise.all([
    db
      .select({ count: count(), total: sum(invoices.total) })
      .from(invoices)
      .where(and(eq(invoices.clientId, clientId), eq(invoices.status, 'sent'))),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.clientId, clientId))
      .orderBy(desc(invoices.createdAt))
      .limit(3),
  ]);

  const unpaidCount = unpaidResult[0]?.count ?? 0;
  const amountDue = Number(unpaidResult[0]?.total ?? 0);

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-2xl font-bold text-foreground">{unpaidCount}</span>
        <span className="text-sm text-muted-foreground">
          unpaid · {formatCents(amountDue)} due
        </span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">No invoices yet.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/portal/invoices/${inv.id}`}
                className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{inv.number}</p>
                  <p className="text-xs text-muted-foreground">{formatCents(inv.total)}</p>
                </div>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${invoiceStatusColor(inv.status)}`}
                >
                  {invoiceStatusLabel(inv.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
