import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, clients } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const userId = parseInt(session.user.id, 10);
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!client) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const conversations = await db.select().from(aiConversations)
      .where(eq(aiConversations.clientId, client.id))
      .orderBy(desc(aiConversations.updatedAt));

    return NextResponse.json({ success: true, data: conversations });
  } catch (err) {
    console.error('[GET /api/portal/ai/conversations]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
