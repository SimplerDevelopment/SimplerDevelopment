import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  listMeteredItemsForClient,
  insertMeteredItem,
} from '@/lib/billing/metered-items';
import { createMeteredItemForSubscription } from '@/lib/stripe';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * GET /api/admin/portal/clients/:id/billing/metered-items
 *
 * Lists every metered subscription item we've configured for a client.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }
  const items = await listMeteredItemsForClient(clientId);
  return NextResponse.json({ success: true, data: items });
}

/**
 * POST /api/admin/portal/clients/:id/billing/metered-items
 *
 * Body: { resource, unitPriceCents, includedQuantity, stripePriceId, stripeSubscriptionId }
 *
 * Two paths:
 *   - If `stripeSubscriptionId` + `stripePriceId` are both supplied, we create
 *     a new Subscription Item on that Stripe Subscription and persist the
 *     mapping (this is the normal "wire it up" flow).
 *   - If `stripeSubscriptionItemId` is supplied directly, we just persist
 *     the mapping (escape hatch when the item already exists in Stripe).
 *
 * Either way an `unitPriceCents` snapshot is required for audit display.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }

  let body: {
    resource?: string;
    unitPriceCents?: number;
    includedQuantity?: number;
    stripePriceId?: string;
    stripeSubscriptionId?: string;
    stripeSubscriptionItemId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.resource || typeof body.resource !== 'string') {
    return NextResponse.json({ success: false, message: 'resource is required' }, { status: 400 });
  }
  if (typeof body.unitPriceCents !== 'number' || !Number.isFinite(body.unitPriceCents)) {
    return NextResponse.json({ success: false, message: 'unitPriceCents is required (number)' }, { status: 400 });
  }

  // Path 1: Stripe-side create + local persist.
  if (body.stripePriceId && body.stripeSubscriptionId) {
    try {
      const result = await createMeteredItemForSubscription(
        clientId,
        body.stripeSubscriptionId,
        body.stripePriceId,
        {
          resource: body.resource,
          unitPriceCents: body.unitPriceCents,
          includedQuantity: body.includedQuantity ?? 0,
        },
      );
      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe error';
      return NextResponse.json({ success: false, message }, { status: 502 });
    }
  }

  // Path 2: caller already has a Stripe Subscription Item ID — just persist mapping.
  if (!body.stripeSubscriptionItemId || !body.stripeSubscriptionId) {
    return NextResponse.json({
      success: false,
      message: 'Either (stripePriceId + stripeSubscriptionId) or (stripeSubscriptionItemId + stripeSubscriptionId) must be supplied',
    }, { status: 400 });
  }

  const row = await insertMeteredItem({
    clientId,
    stripeSubscriptionId: body.stripeSubscriptionId,
    stripeSubscriptionItemId: body.stripeSubscriptionItemId,
    resource: body.resource,
    unitPriceCents: body.unitPriceCents,
    includedQuantity: body.includedQuantity ?? 0,
  });

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
