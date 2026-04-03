import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { emitEvent } from '@/lib/automation';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [survey] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, parseInt(id, 10)), eq(surveys.clientId, client.id)));

  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: survey });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const body = await req.json();

  // Verify ownership
  const [existing] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id)));
  if (!existing) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.fields !== undefined) updates.fields = body.fields;
  if (body.pages !== undefined) updates.pages = body.pages;
  if (body.status !== undefined) updates.status = body.status;
  if (body.color !== undefined) updates.color = body.color;
  if (body.brandingProfileId !== undefined) updates.brandingProfileId = body.brandingProfileId || null;
  if (body.thankYouTitle !== undefined) updates.thankYouTitle = body.thankYouTitle;
  if (body.thankYouMessage !== undefined) updates.thankYouMessage = body.thankYouMessage;
  if (body.redirectUrl !== undefined) updates.redirectUrl = body.redirectUrl || null;
  if (body.allowMultiple !== undefined) updates.allowMultiple = body.allowMultiple;
  if (body.requireEmail !== undefined) updates.requireEmail = body.requireEmail;
  if (body.notifyOnResponse !== undefined) updates.notifyOnResponse = body.notifyOnResponse;
  if (body.notifyDigest !== undefined) updates.notifyDigest = body.notifyDigest;
  if (body.closesAt !== undefined) updates.closesAt = body.closesAt ? new Date(body.closesAt) : null;
  if (body.maxResponses !== undefined) updates.maxResponses = body.maxResponses || null;
  if (body.linkedType !== undefined) updates.linkedType = body.linkedType || null;
  if (body.linkedId !== undefined) updates.linkedId = body.linkedId || null;

  const [updated] = await db
    .update(surveys)
    .set(updates)
    .where(eq(surveys.id, surveyId))
    .returning();

  emitEvent('survey.updated', client.id, userId, { id: updated.id, title: updated.title, status: updated.status });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const [existing] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id)));
  if (!existing) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  await db.delete(surveys).where(eq(surveys.id, surveyId));

  emitEvent('survey.deleted', client.id, userId, { id: surveyId, title: existing.title });

  return NextResponse.json({ success: true });
}
