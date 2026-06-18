import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiConversations } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    // Bearer-aware (mobile) + NextAuth (web). Read access = any member.
    const authResult = await authorizePortal({ action: 'read' });
    if (isAuthError(authResult)) return authResult.response;
    const { client } = authResult;

    const conversations = await db.select().from(aiConversations)
      .where(eq(aiConversations.clientId, client.id))
      .orderBy(desc(aiConversations.updatedAt));

    return NextResponse.json({ success: true, data: conversations });
  } catch (err) {
    console.error('[GET /api/portal/ai/conversations]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
