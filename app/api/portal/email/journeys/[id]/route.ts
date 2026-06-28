import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailJourneys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
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

  const [journey] = await db
    .select()
    .from(emailJourneys)
    .where(eq(emailJourneys.id, journeyId))
    .limit(1);

  return NextResponse.json({ success: true, data: journey });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { name, description, status, triggerType, triggerConfig } = body;

  const updates: Partial<typeof emailJourneys.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (triggerType !== undefined) updates.triggerType = triggerType;
  if (triggerConfig !== undefined) updates.triggerConfig = triggerConfig;

  const [updated] = await db
    .update(emailJourneys)
    .set(updates)
    .where(eq(emailJourneys.id, journeyId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const journeyId = parseInt(id, 10);

  if (!await ownsJourney(client.id, journeyId)) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  await db.delete(emailJourneys).where(eq(emailJourneys.id, journeyId));

  return NextResponse.json({ success: true, data: { id: journeyId } });
}
