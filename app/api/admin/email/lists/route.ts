import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq, count, sql } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const lists = await db
    .select({
      id: emailLists.id,
      name: emailLists.name,
      description: emailLists.description,
      clientId: emailLists.clientId,
      createdAt: emailLists.createdAt,
      subscriberCount: count(emailSubscribers.id),
    })
    .from(emailLists)
    .leftJoin(emailSubscribers, eq(emailSubscribers.listId, emailLists.id))
    .groupBy(emailLists.id)
    .orderBy(sql`${emailLists.createdAt} desc`);

  return NextResponse.json({ success: true, data: lists });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, clientId } = body;

  if (!name?.trim()) {
    return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
  }

  const userId = parseInt((session.user as { id: string }).id);

  const [list] = await db
    .insert(emailLists)
    .values({
      name: name.trim(),
      description: description?.trim() || null,
      clientId: clientId ? parseInt(clientId) : null,
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: list }, { status: 201 });
}
