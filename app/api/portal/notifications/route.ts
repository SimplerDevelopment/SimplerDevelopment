// In-app inbox feed. Scoped to the authenticated user. The notifications
// table is itself per-user, so the read query is just userId; multi-tenant
// safety comes from the row insert path always using the recipient's user id.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifications, users } from '@/lib/db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));

  const where = unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId);

  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      cardId: notifications.cardId,
      projectId: notifications.projectId,
      title: notifications.title,
      body: notifications.body,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorUserId: notifications.actorUserId,
      actorName: users.name,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorUserId))
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return NextResponse.json({
    success: true,
    data: { rows, unread: unread ?? 0 },
  });
}
