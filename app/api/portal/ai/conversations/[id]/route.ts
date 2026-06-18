import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, asc } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Bearer-aware (mobile) + NextAuth (web). Read access = any member.
    const authResult = await authorizePortal({ action: 'read' });
    if (isAuthError(authResult)) return authResult.response;
    const { client } = authResult;

    const { id } = await params;
    const convId = parseInt(id, 10);

    const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, convId)).limit(1);
    if (!conv || conv.clientId !== client.id) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const messages = await db.select().from(aiMessages)
      .where(eq(aiMessages.conversationId, convId))
      .orderBy(asc(aiMessages.createdAt));

    return NextResponse.json({ success: true, data: { conversation: conv, messages } });
  } catch (err) {
    console.error('[GET /api/portal/ai/conversations/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
