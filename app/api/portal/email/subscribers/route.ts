import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateUnsubscribeToken } from '@/lib/email';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { emitEvent } from '@/lib/automation';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

async function ownsList(clientId: number, listId: number) {
  const [list] = await db
    .select({ id: emailLists.id })
    .from(emailLists)
    .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId)))
    .limit(1);
  return !!list;
}

export async function POST(req: Request) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { listId, email, name } = await req.json();
  if (!listId || !email?.trim()) return NextResponse.json({ success: false, message: 'listId and email required' }, { status: 400 });

  if (!await ownsList(client.id, parseInt(listId))) {
    return NextResponse.json({ success: false, message: 'List not found' }, { status: 404 });
  }

  const [existing] = await db
    .select({ id: emailSubscribers.id })
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, parseInt(listId)), eq(emailSubscribers.email, email.toLowerCase().trim())))
    .limit(1);

  if (existing) return NextResponse.json({ success: false, message: 'Already subscribed to this list' }, { status: 409 });

  const [subscriber] = await db
    .insert(emailSubscribers)
    .values({ listId: parseInt(listId), email: email.toLowerCase().trim(), name: name?.trim() || null, unsubscribeToken: generateUnsubscribeToken() })
    .returning();

  emitEvent('email.subscriber.added', client.id, parseInt(session.user.id, 10), {
    subscriberId: subscriber.id,
    listId: subscriber.listId,
    email: subscriber.email,
    name: subscriber.name,
  });

  return NextResponse.json({ success: true, data: subscriber }, { status: 201 });
}

// Bulk import
export async function PUT(req: Request) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { listId, subscribers } = await req.json() as { listId: number; subscribers: { email: string; name?: string }[] };
  if (!listId || !Array.isArray(subscribers)) return NextResponse.json({ success: false, message: 'listId and subscribers required' }, { status: 400 });

  if (!await ownsList(client.id, listId)) {
    return NextResponse.json({ success: false, message: 'List not found' }, { status: 404 });
  }

  const rows = subscribers
    .filter(s => s.email?.includes('@'))
    .map(s => ({ listId, email: s.email.toLowerCase().trim(), name: s.name?.trim() || null, unsubscribeToken: generateUnsubscribeToken() }));

  const inserted = await db.insert(emailSubscribers).values(rows).onConflictDoNothing().returning();

  // Emit one event per newly-inserted subscriber so automations fire for each.
  const userId = parseInt(session.user.id, 10);
  for (const sub of inserted) {
    emitEvent('email.subscriber.added', client.id, userId, {
      subscriberId: sub.id,
      listId: sub.listId,
      email: sub.email,
      name: sub.name,
    });
  }

  return NextResponse.json({ success: true, data: { imported: inserted.length, total: rows.length } });
}

export async function DELETE(req: Request) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 });

  // Verify the subscriber belongs to one of the client's lists
  const [sub] = await db
    .select({ listId: emailSubscribers.listId })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.id, parseInt(id)))
    .limit(1);

  if (!sub || !await ownsList(client.id, sub.listId)) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  await db.delete(emailSubscribers).where(eq(emailSubscribers.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
