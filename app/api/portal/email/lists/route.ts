import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq, count, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function GET() {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const lists = await db
    .select({
      id: emailLists.id,
      name: emailLists.name,
      description: emailLists.description,
      createdAt: emailLists.createdAt,
      subscriberCount: count(emailSubscribers.id),
    })
    .from(emailLists)
    .leftJoin(emailSubscribers, eq(emailSubscribers.listId, emailLists.id))
    .where(eq(emailLists.clientId, client.id))
    .groupBy(emailLists.id)
    .orderBy(sql`${emailLists.createdAt} desc`);

  return NextResponse.json({ success: true, data: lists });
}

export async function POST(req: Request) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description } = body;
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const [list] = await db
    .insert(emailLists)
    .values({ name: name.trim(), description: description?.trim() || null, clientId: client.id })
    .returning();

  return NextResponse.json({ success: true, data: list }, { status: 201 });
}
