import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingPageMembers, clientMembers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function resolveBookingPage(pageId: number, userId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, pageId), eq(bookingPages.clientId, client.id)))
    .limit(1);
  return page ?? null;
}

// GET — list members assigned to this booking page + available team members
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const userId = parseInt(session.user.id, 10);
  const page = await resolveBookingPage(parseInt(id), userId);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Get assigned members for this page
  const members = await db
    .select({
      id: bookingPageMembers.id,
      userId: bookingPageMembers.userId,
      displayName: bookingPageMembers.displayName,
      color: bookingPageMembers.color,
      availability: bookingPageMembers.availability,
      active: bookingPageMembers.active,
      userName: users.name,
      userEmail: users.email,
    })
    .from(bookingPageMembers)
    .innerJoin(users, eq(users.id, bookingPageMembers.userId))
    .where(eq(bookingPageMembers.bookingPageId, page.id));

  // Get all team members for this client (for the "add member" dropdown)
  const client = await getPortalClient(userId);
  const teamMembers = client ? await db
    .select({
      userId: clientMembers.userId,
      role: clientMembers.role,
      name: users.name,
      email: users.email,
    })
    .from(clientMembers)
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(eq(clientMembers.clientId, client.id)) : [];

  return NextResponse.json({ success: true, data: { members, teamMembers } });
}

// POST — add a member to this booking page
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const userId = parseInt(session.user.id, 10);
  const page = await resolveBookingPage(parseInt(id), userId);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { userId: memberUserId, displayName, color } = await req.json();
  if (!memberUserId) return NextResponse.json({ success: false, message: 'userId is required' }, { status: 400 });

  // Verify the user is a team member of this client
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [isMember] = await db.select().from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, memberUserId)))
    .limit(1);

  if (!isMember) return NextResponse.json({ success: false, message: 'User is not a team member' }, { status: 400 });

  // Upsert member
  const existing = await db.select().from(bookingPageMembers)
    .where(and(eq(bookingPageMembers.bookingPageId, page.id), eq(bookingPageMembers.userId, memberUserId)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db.update(bookingPageMembers)
      .set({ displayName: displayName || null, color: color || null, active: true })
      .where(eq(bookingPageMembers.id, existing[0].id))
      .returning();
    return NextResponse.json({ success: true, data: updated });
  }

  const [member] = await db.insert(bookingPageMembers).values({
    bookingPageId: page.id,
    userId: memberUserId,
    displayName: displayName || null,
    color: color || null,
  }).returning();

  // Update the assignedMembers JSON on the booking page
  const currentMembers = (page.assignedMembers as number[]) || [];
  if (!currentMembers.includes(memberUserId)) {
    await db.update(bookingPages)
      .set({ assignedMembers: [...currentMembers, memberUserId], updatedAt: new Date() })
      .where(eq(bookingPages.id, page.id));
  }

  return NextResponse.json({ success: true, data: member });
}

// PUT — bulk update members (availability, color, displayName)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const userId = parseInt(session.user.id, 10);
  const page = await resolveBookingPage(parseInt(id), userId);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { memberId, displayName, color, availability, active } = await req.json();
  if (!memberId) return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.displayName = displayName || null;
  if (color !== undefined) updates.color = color || null;
  if (availability !== undefined) updates.availability = availability;
  if (active !== undefined) updates.active = active;

  const [updated] = await db.update(bookingPageMembers)
    .set(updates)
    .where(and(eq(bookingPageMembers.id, memberId), eq(bookingPageMembers.bookingPageId, page.id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

// DELETE — remove a member from this booking page
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const userId = parseInt(session.user.id, 10);
  const page = await resolveBookingPage(parseInt(id), userId);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const memberId = parseInt(searchParams.get('memberId') || '');
  if (!memberId) return NextResponse.json({ success: false, message: 'memberId query param is required' }, { status: 400 });

  const [deleted] = await db.delete(bookingPageMembers)
    .where(and(eq(bookingPageMembers.id, memberId), eq(bookingPageMembers.bookingPageId, page.id)))
    .returning();

  if (deleted) {
    // Update assignedMembers JSON
    const currentMembers = ((page.assignedMembers as number[]) || []).filter(id => id !== deleted.userId);
    await db.update(bookingPages)
      .set({ assignedMembers: currentMembers, updatedAt: new Date() })
      .where(eq(bookingPages.id, page.id));
  }

  return NextResponse.json({ success: true });
}
