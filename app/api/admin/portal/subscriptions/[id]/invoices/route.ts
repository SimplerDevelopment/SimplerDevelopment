// GET /api/admin/portal/subscriptions/:id/invoices
//
// Lists local `invoices` rows for the client owning this `clientServices`
// row — used by the Refund dialog on /admin/subscriptions to populate the
// invoice picker. Returns the most recent 25.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientServices, invoices } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const clientServiceId = parseInt(id, 10);
  if (!Number.isFinite(clientServiceId)) {
    return NextResponse.json({ success: false, message: 'Invalid subscription id' }, { status: 400 });
  }

  const [sub] = await db.select().from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
  if (!sub) return NextResponse.json({ success: false, message: 'Subscription not found' }, { status: 404 });

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
      paidAt: invoices.paidAt,
      stripePaymentIntentId: invoices.stripePaymentIntentId,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(eq(invoices.clientId, sub.clientId))
    .orderBy(desc(invoices.createdAt))
    .limit(25);

  return NextResponse.json({ success: true, data: rows });
}
