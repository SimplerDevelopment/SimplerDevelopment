import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const pages = await db
    .select()
    .from(bookingPages)
    .where(eq(bookingPages.clientId, client.id))
    .orderBy(desc(bookingPages.updatedAt));

  return NextResponse.json({ success: true, data: pages });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { title, description, duration, timezone } = await req.json();
  if (!title?.trim()) return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });

  // Generate slug from title + random suffix
  const baseSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const [page] = await db.insert(bookingPages).values({
    clientId: client.id,
    title: title.trim(),
    slug,
    description: description?.trim() || null,
    duration: duration || 30,
    timezone: timezone || 'America/New_York',
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: page });
}
