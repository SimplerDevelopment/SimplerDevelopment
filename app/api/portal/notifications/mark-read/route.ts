// POST /api/portal/notifications/mark-read
//   body: { id?: number, all?: boolean }   — mark one row, or every row, read.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);

  const body = await req.json().catch(() => ({}));
  const { id, all } = body as { id?: number; all?: boolean };

  if (all) {
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return NextResponse.json({ success: true });
  }

  if (typeof id !== 'number') {
    return NextResponse.json({ success: false, message: 'id or all=true required' }, { status: 400 });
  }
  await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));

  return NextResponse.json({ success: true });
}
