/**
 * PUX-192 (design doc screen 51): one place that decides who may read an
 * invoice, shared by the portal invoice page and the PDF route so the two
 * can never disagree on tenancy. Staff (admin / employee) read by id; a
 * client user only reads invoices whose clientId is their own client.
 */
import { db } from '@/lib/db';
import { clients, invoices, invoiceItems } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export { canPayInvoice, invoiceTrail } from './invoice-shape';

type SessionLike = { user?: { id?: string; role?: string } } | null;

export type PortalInvoice = {
  invoice: typeof invoices.$inferSelect;
  items: (typeof invoiceItems.$inferSelect)[];
  /** The caller's client row when they are a client user; null for staff. */
  client: typeof clients.$inferSelect | null;
};

export async function resolvePortalInvoice(session: SessionLike, invoiceId: number): Promise<PortalInvoice | 'no-client' | null> {
  const userId = parseInt(session?.user?.id ?? '', 10);
  const role = session?.user?.role;
  const isStaff = role === 'admin' || role === 'employee';

  let client: typeof clients.$inferSelect | null = null;
  if (!isStaff) {
    const [row] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!row) return 'no-client';
    client = row;
  }

  const [invoice] = await (client
    ? db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, client.id))).limit(1)
    : db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1));
  if (!invoice) return null;

  // invoiceId was tenant-checked just above, so the items read needs no client filter.
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  return { invoice, items, client };
}
