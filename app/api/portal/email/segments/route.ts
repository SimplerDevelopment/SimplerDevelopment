import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSegments } from '@/lib/db/schema';
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

  const segments = await db.select().from(emailSegments)
    .where(eq(emailSegments.clientId, client.id))
    .orderBy(desc(emailSegments.createdAt));

  return NextResponse.json({ success: true, data: segments });
}

export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { name, description, rules, matchType } = await req.json();
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });

  const [segment] = await db.insert(emailSegments).values({
    clientId: client.id,
    name: name.trim(),
    description: description?.trim() || null,
    rules: rules || [],
    matchType: matchType || 'all',
  }).returning();

  return NextResponse.json({ success: true, data: segment }, { status: 201 });
}
