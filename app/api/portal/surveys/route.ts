import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { emitEvent } from '@/lib/automation';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const list = await db
    .select()
    .from(surveys)
    .where(eq(surveys.clientId, client.id))
    .orderBy(desc(surveys.updatedAt));

  return NextResponse.json({ success: true, data: list });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { title, description, fields, linkedType, linkedId } = await req.json();
  if (!title?.trim()) return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });

  const baseSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const [survey] = await db.insert(surveys).values({
    clientId: client.id,
    title: title.trim(),
    slug,
    description: description?.trim() || null,
    fields: fields || [],
    linkedType: linkedType || null,
    linkedId: linkedId || null,
    createdBy: userId,
  }).returning();

  emitEvent('survey.created', client.id, userId, { id: survey.id, title: survey.title, slug: survey.slug });

  return NextResponse.json({ success: true, data: survey }, { status: 201 });
}
