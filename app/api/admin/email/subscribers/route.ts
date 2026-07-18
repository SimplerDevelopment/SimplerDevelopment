import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSubscribers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateUnsubscribeToken } from '@/lib/email';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { listId, email, name } = body;

  if (!listId || !email?.trim()) {
    return NextResponse.json({ success: false, message: 'listId and email are required' }, { status: 400 });
  }

  // Check for duplicate in this list
  const [existing] = await db
    .select({ id: emailSubscribers.id })
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, parseInt(listId)), eq(emailSubscribers.email, email.toLowerCase().trim())))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'Email already subscribed to this list' }, { status: 409 });
  }

  const [subscriber] = await db
    .insert(emailSubscribers)
    .values({
      listId: parseInt(listId),
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      unsubscribeToken: generateUnsubscribeToken(),
    })
    .returning();

  return NextResponse.json({ success: true, data: subscriber }, { status: 201 });
}

// Bulk import via CSV data
export async function PUT(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { listId, subscribers } = body as { listId: number; subscribers: { email: string; name?: string }[] };

  if (!listId || !Array.isArray(subscribers) || subscribers.length === 0) {
    return NextResponse.json({ success: false, message: 'listId and subscribers array required' }, { status: 400 });
  }

  const rows = subscribers
    .filter(s => s.email?.includes('@'))
    .map(s => ({
      listId,
      email: s.email.toLowerCase().trim(),
      name: s.name?.trim() || null,
      unsubscribeToken: generateUnsubscribeToken(),
    }));

  // Insert, skip duplicates
  const inserted = await db
    .insert(emailSubscribers)
    .values(rows)
    .onConflictDoNothing()
    .returning();

  return NextResponse.json({ success: true, data: { imported: inserted.length, total: rows.length } });
}

export async function DELETE(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 });

  await db.delete(emailSubscribers).where(eq(emailSubscribers.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
