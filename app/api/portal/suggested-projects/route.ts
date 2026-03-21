import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { suggestedProjects, clients } from '@/lib/db/schema';
import { eq, isNull, or, and } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  // Return global suggestions + client-specific ones
  const data = await db
    .select()
    .from(suggestedProjects)
    .where(
      and(
        eq(suggestedProjects.active, true),
        or(
          isNull(suggestedProjects.clientId),
          eq(suggestedProjects.clientId, client.id),
        ),
      ),
    )
    .orderBy(suggestedProjects.order, suggestedProjects.createdAt);

  return NextResponse.json({ success: true, data });
}
