import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSubscriberTags } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET() {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const tags = await db.select().from(emailSubscriberTags)
    .where(eq(emailSubscriberTags.clientId, client.id))
    .orderBy(desc(emailSubscriberTags.createdAt));

  return NextResponse.json({ success: true, data: tags });
}

export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { name, color } = await req.json();
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });

  const [tag] = await db.insert(emailSubscriberTags).values({
    clientId: client.id,
    name: name.trim(),
    color: color || '#6366f1',
  }).returning();

  return NextResponse.json({ success: true, data: tag }, { status: 201 });
}
