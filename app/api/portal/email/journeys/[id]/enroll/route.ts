import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailJourneys, emailSubscribers, emailLists } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { enrollSubscriber } from '@/lib/email/journey-engine';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

async function ownsJourney(clientId: number, journeyId: number) {
  const [j] = await db
    .select({ id: emailJourneys.id, status: emailJourneys.status })
    .from(emailJourneys)
    .where(and(eq(emailJourneys.id, journeyId), eq(emailJourneys.clientId, clientId)))
    .limit(1);
  return j ?? null;
}

/**
 * POST /api/portal/email/journeys/[id]/enroll
 * Body: { subscriberIds: number[] }
 *
 * Manually enroll one or more subscribers into a journey.
 * Re-enrollment is not allowed (unique index silently ignores duplicates).
 * Cross-tenant subscriber IDs that don't belong to this client return 403.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const journeyId = parseInt(id, 10);

  const journey = await ownsJourney(client.id, journeyId);
  if (!journey) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const { subscriberIds } = body;

  if (!Array.isArray(subscriberIds) || subscriberIds.length === 0) {
    return NextResponse.json({ success: false, message: 'subscriberIds[] is required' }, { status: 400 });
  }

  // Validate all subscriber IDs belong to this client's lists (tenant isolation)
  const subs = await db
    .select({ id: emailSubscribers.id, listId: emailSubscribers.listId })
    .from(emailSubscribers)
    .where(inArray(emailSubscribers.id, subscriberIds));

  // Cross-check that every subscriber's list belongs to this client.
  // We rely on emailLists.clientId scoping — fetch those list IDs.
  const listIds = [...new Set(subs.map(s => s.listId))];
  const clientLists = listIds.length > 0
    ? await db
        .select({ id: emailLists.id })
        .from(emailLists)
        .where(and(inArray(emailLists.id, listIds), eq(emailLists.clientId, client.id)))
    : [];
  const clientListIds = new Set(clientLists.map(l => l.id));

  const allowedSubIds = new Set(
    subs.filter(s => clientListIds.has(s.listId)).map(s => s.id),
  );

  const forbidden = subscriberIds.filter(sid => !allowedSubIds.has(sid));
  if (forbidden.length > 0) {
    return NextResponse.json(
      { success: false, message: 'One or more subscriber IDs do not belong to this client' },
      { status: 403 },
    );
  }

  let enrolled = 0;
  let skipped = 0;
  for (const subscriberId of subscriberIds) {
    const result = await enrollSubscriber(journeyId, subscriberId, client.id);
    if (result) {
      enrolled++;
    } else {
      skipped++; // already enrolled
    }
  }

  return NextResponse.json({ success: true, data: { enrolled, skipped } });
}
