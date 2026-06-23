import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailJourneys, emailJourneySteps } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

async function ownsJourney(clientId: number, journeyId: number) {
  const [j] = await db
    .select({ id: emailJourneys.id })
    .from(emailJourneys)
    .where(and(eq(emailJourneys.id, journeyId), eq(emailJourneys.clientId, clientId)))
    .limit(1);
  return j ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const journeyId = parseInt(id, 10);

  if (!await ownsJourney(client.id, journeyId)) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const steps = await db
    .select()
    .from(emailJourneySteps)
    .where(eq(emailJourneySteps.journeyId, journeyId))
    .orderBy(asc(emailJourneySteps.stepOrder));

  return NextResponse.json({ success: true, data: steps });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const journeyId = parseInt(id, 10);

  if (!await ownsJourney(client.id, journeyId)) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const { stepOrder, stepType, config } = body;

  if (typeof stepOrder !== 'number') {
    return NextResponse.json({ success: false, message: 'stepOrder (number) is required' }, { status: 400 });
  }
  if (!stepType || typeof stepType !== 'string') {
    return NextResponse.json({ success: false, message: 'stepType is required' }, { status: 400 });
  }

  const [step] = await db
    .insert(emailJourneySteps)
    .values({
      journeyId,
      stepOrder,
      stepType,
      config: config ?? null,
    })
    .returning();

  return NextResponse.json({ success: true, data: step }, { status: 201 });
}
