import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invoices, invoiceItems, clients, users } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const data = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      createdAt: invoices.createdAt,
      company: clients.company,
      clientName: users.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(invoices.createdAt));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { clientId, projectId, dueDate, notes, items, status } = body;

  if (!clientId || !items?.length) {
    return NextResponse.json({ success: false, message: 'clientId and items are required' }, { status: 400 });
  }

  const subtotal = items.reduce((sum: number, item: { unitPrice: number; quantity: number }) => sum + item.unitPrice * item.quantity, 0);
  const tax = body.tax ?? 0;
  const total = subtotal + tax;

  const userId = parseInt(session.user!.id!, 10);

  // Retry loop: generate invoice number and insert; on unique violation retry with a fresh count.
  let invoice: typeof invoices.$inferSelect | undefined;
  let lineItemRows: (typeof invoiceItems.$inferSelect)[] = [];
  let attempt = 0;
  const MAX_ATTEMPTS = 5;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const year = new Date().getFullYear();
    // Lock-free sequence: read max numeric suffix for this year then increment.
    // If two concurrent requests land on the same number the unique constraint
    // on invoices.number catches it and we retry.
    const [row] = await db.execute(
      sql`SELECT COALESCE(MAX(CAST(SPLIT_PART(number, '-', 3) AS INTEGER)), 0) AS max_seq
          FROM invoices
          WHERE number LIKE ${'INV-' + year + '-%'}`
    ) as { max_seq: number }[];
    const nextSeq = (row?.max_seq ?? 0) + 1;
    const invoiceNumber = `INV-${year}-${String(nextSeq).padStart(4, '0')}`;

    try {
      const result = await db.transaction(async (tx) => {
        const [inv] = await tx.insert(invoices).values({
          number: invoiceNumber,
          clientId,
          projectId: projectId ?? null,
          status: status ?? 'draft',
          dueDate: dueDate ? new Date(dueDate) : null,
          subtotal,
          tax,
          total,
          notes: notes ?? null,
          createdBy: userId,
        }).returning();

        const li = await Promise.all(
          items.map((item: { description: string; quantity: number; unitPrice: number; serviceId?: number }) =>
            tx.insert(invoiceItems).values({
              invoiceId: inv.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.unitPrice * item.quantity,
              serviceId: item.serviceId ?? null,
            }).returning()
          )
        );
        return { inv, li };
      });

      invoice = result.inv;
      lineItemRows = result.li.map(r => r[0]);
      break;
    } catch (err) {
      // Postgres unique_violation code = 23505
      const pgErr = err as { code?: string };
      if (pgErr?.code === '23505' && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }

  if (!invoice) {
    return NextResponse.json({ success: false, message: 'Could not generate a unique invoice number after retries' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { invoice, items: lineItemRows } });
}
