import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

async function ownsList(client: { id: number }, listId: number) {
  const [list] = await db
    .select({ id: emailLists.id })
    .from(emailLists)
    .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, client.id)))
    .limit(1);
  return list ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const listId = parseInt(id);
  if (!await ownsList(client, listId)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const subscribers = await db
    .select()
    .from(emailSubscribers)
    .where(eq(emailSubscribers.listId, listId))
    .orderBy(emailSubscribers.createdAt);

  return NextResponse.json({ success: true, data: subscribers });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const listId = parseInt(id);
  if (!await ownsList(client, listId)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const [updated] = await db
    .update(emailLists)
    .set({ name: name.trim(), description: description?.trim() || null, updatedAt: new Date() })
    .where(eq(emailLists.id, listId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const listId = parseInt(id);
  if (!await ownsList(client, listId)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(emailLists).where(eq(emailLists.id, listId));
  return NextResponse.json({ success: true });
}
