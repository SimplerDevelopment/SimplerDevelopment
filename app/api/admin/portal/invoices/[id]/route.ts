import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invoices, invoiceItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  return NextResponse.json({ success: true, data: { invoice, items } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  const body = await req.json();

  const [invoice] = await db.update(invoices).set({
    status: body.status,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    notes: body.notes,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId)).returning();

  return NextResponse.json({ success: true, data: invoice });
}
