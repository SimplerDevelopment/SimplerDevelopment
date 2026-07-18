import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmDeals, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * POST /api/admin/portal/invoices/from-deal
 *
 * Pre-fills an invoice payload from a CRM deal so the caller can review
 * and then POST to /api/admin/portal/invoices to create the invoice.
 *
 * Body: { dealId: number }
 * Returns: { success: true, data: { prefill: <invoice POST body> } }
 *
 * The response is intentionally a *prefill* (not a saved invoice) —
 * the admin reviews it in the new-invoice form before confirming.
 */
export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { dealId } = body as { dealId?: number };

  if (!dealId) {
    return NextResponse.json({ success: false, message: 'dealId is required' }, { status: 400 });
  }

  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId)).limit(1);
  if (!deal) {
    return NextResponse.json({ success: false, message: 'Deal not found' }, { status: 404 });
  }

  // Resolve the portal client that owns this deal. crmDeals.clientId = clients.id.
  const [client] = await db.select().from(clients).where(eq(clients.id, deal.clientId)).limit(1);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found for this deal' }, { status: 404 });
  }

  // Build notes from deal metadata.
  const noteParts: string[] = [`Generated from CRM deal: ${deal.title} (ID ${deal.id})`];
  if (deal.notes) noteParts.push(deal.notes);

  // Build line items from deal value. The CRM deal has a single value field
  // (no dedicated deal-line-items table). We create one line item representing
  // the deal total. If billingCycle is set we annotate it in the description.
  const cycleLabel = deal.billingCycle && deal.billingCycle !== 'one-time'
    ? ` (${deal.billingCycle})`
    : '';
  const unitPrice = deal.value ?? 0; // already in cents

  const items: Array<{ description: string; quantity: number; unitPrice: number }> = [
    {
      description: `${deal.title}${cycleLabel}`,
      quantity: 1,
      unitPrice,
    },
  ];

  // Compute a suggested due date of 30 days from now.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const prefill = {
    clientId: client.id,
    dueDate: dueDate.toISOString().split('T')[0],
    notes: noteParts.join('\n\n'),
    status: 'draft',
    tax: 0,
    items,
    // Carry-forward metadata for the UI to display.
    _meta: {
      dealId: deal.id,
      dealTitle: deal.title,
      dealStatus: deal.status,
      clientCompany: client.company,
      contactId: deal.contactId ?? null,
      companyId: deal.companyId ?? null,
    },
  };

  return NextResponse.json({ success: true, data: { prefill } });
}
