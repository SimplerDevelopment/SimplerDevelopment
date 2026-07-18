import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getMeteredItem,
  updateMeteredItem,
  deleteMeteredItem,
} from '@/lib/billing/metered-items';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * PATCH /api/admin/portal/clients/:id/billing/metered-items/:itemId
 *
 * Body: { status?, unitPriceCents?, includedQuantity? }
 *
 * Note: we never mutate the Stripe Subscription Item from this route.
 * Status changes here only flip our local mirror (so the rollup worker
 * skips the item). To actually pause / cancel the Stripe item the operator
 * must do that in Stripe dashboard.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { id, itemId } = await params;
  const clientId = parseInt(id, 10);
  const meteredId = parseInt(itemId, 10);
  if (Number.isNaN(clientId) || Number.isNaN(meteredId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  // Tenant guard: confirm the item belongs to this client before mutating.
  const existing = await getMeteredItem(meteredId);
  if (!existing || existing.clientId !== clientId) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  let body: {
    status?: string;
    unitPriceCents?: number;
    includedQuantity?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.status !== undefined && !['active', 'paused', 'cancelled'].includes(body.status)) {
    return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
  }
  if (body.unitPriceCents !== undefined && (typeof body.unitPriceCents !== 'number' || !Number.isFinite(body.unitPriceCents))) {
    return NextResponse.json({ success: false, message: 'unitPriceCents must be a number' }, { status: 400 });
  }
  if (body.includedQuantity !== undefined && (typeof body.includedQuantity !== 'number' || !Number.isFinite(body.includedQuantity))) {
    return NextResponse.json({ success: false, message: 'includedQuantity must be a number' }, { status: 400 });
  }

  const updated = await updateMeteredItem(meteredId, body);
  if (!updated) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: updated });
}

/**
 * DELETE /api/admin/portal/clients/:id/billing/metered-items/:itemId
 *
 * Removes the local mapping only. The Stripe Subscription Item lives on
 * until manually deleted in the Stripe dashboard — this is intentional;
 * we never want this endpoint to silently destroy billing config.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { id, itemId } = await params;
  const clientId = parseInt(id, 10);
  const meteredId = parseInt(itemId, 10);
  if (Number.isNaN(clientId) || Number.isNaN(meteredId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const existing = await getMeteredItem(meteredId);
  if (!existing || existing.clientId !== clientId) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const ok = await deleteMeteredItem(meteredId);
  return NextResponse.json({ success: ok });
}
