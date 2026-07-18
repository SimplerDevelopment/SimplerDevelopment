import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

// POST /api/storefront/[siteId]/designs/claim
//
// Body: { sessionId: string, customerId: number }
//
// Transfers ownership of all anonymous productDesigns rows that match the
// given sessionId (and have no customerId yet) to the authenticated
// customer. Unlike the legacy `/api/auth/claim-designs` endpoint this does
// NOT create an account — sd2026 has its own signup flow; this endpoint is
// strictly an ownership-transfer step run after sign-up / sign-in.
//
// Auth: requires a valid customer Bearer token whose customerId matches the
// posted `customerId`. This prevents one customer from grabbing another
// customer's session designs by guessing a session id.
//
// Wave 2I — Storefront refactor.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => null) as
    | { sessionId?: string; customerId?: number }
    | null;

  if (!body || typeof body.sessionId !== 'string' || typeof body.customerId !== 'number') {
    return NextResponse.json(
      { success: false, message: 'sessionId (string) and customerId (number) are required' },
      { status: 400 },
    );
  }

  const session = await requireCustomer(req, websiteId);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 });
  }
  if (session.customerId !== body.customerId) {
    return NextResponse.json(
      { success: false, message: 'customerId does not match authenticated customer' },
      { status: 403 },
    );
  }

  const updated = await db.update(productDesigns)
    .set({ customerId: body.customerId, sessionId: null, updatedAt: new Date() })
    .where(and(
      eq(productDesigns.websiteId, websiteId),
      eq(productDesigns.sessionId, body.sessionId),
      isNull(productDesigns.customerId),
    ))
    .returning({ id: productDesigns.id });

  return NextResponse.json({
    success: true,
    designsTransferred: updated.length,
  });
}
