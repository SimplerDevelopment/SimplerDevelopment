import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invoices, invoiceItems, clients, users } from '@/lib/db/schema';
import { eq, desc, count } from 'drizzle-orm';

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

  const [result] = await db.select({ count: count() }).from(invoices);
  const year = new Date().getFullYear();
  const invoiceNumber = `INV-${year}-${String((result?.count ?? 0) + 1).padStart(4, '0')}`;

  const userId = parseInt(session.user!.id!, 10);
  const [invoice] = await db.insert(invoices).values({
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

  const lineItems = await Promise.all(
    items.map((item: { description: string; quantity: number; unitPrice: number; serviceId?: number }) =>
      db.insert(invoiceItems).values({
        invoiceId: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.unitPrice * item.quantity,
        serviceId: item.serviceId ?? null,
      }).returning()
    )
  );

  return NextResponse.json({ success: true, data: { invoice, items: lineItems.map(r => r[0]) } });
}
