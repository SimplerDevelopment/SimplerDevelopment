import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import MetricBlock from './MetricBlock';

export default async function MetricUnpaidInvoicesWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [result] = await db
    .select({ count: count() })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), eq(invoices.status, 'sent')));

  return (
    <MetricBlock
      icon="receipt_long"
      color="text-red-600"
      value={result?.count ?? 0}
      label="Unpaid Invoices"
    />
  );
}
