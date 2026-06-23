import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const listId = parseInt(id);

  const subscribers = await db
    .select()
    .from(emailSubscribers)
    .where(eq(emailSubscribers.listId, listId))
    .orderBy(emailSubscribers.createdAt);

  return NextResponse.json({ success: true, data: subscribers });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, description } = body;

  if (!name?.trim()) {
    return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
  }

  const [updated] = await db
    .update(emailLists)
    .set({ name: name.trim(), description: description?.trim() || null, updatedAt: new Date() })
    .where(eq(emailLists.id, parseInt(id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  await db.delete(emailLists).where(eq(emailLists.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
