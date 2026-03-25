import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, aiMessages, users } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

function requireAdmin(session: unknown) {
  const s = session as { user?: { role?: string } } | null;
  const role = s?.user?.role;
  return role === 'admin' || role === 'employee';
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    if (!requireAdmin(session)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const convId = parseInt(id, 10);

    const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, convId)).limit(1);
    if (!conv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const messages = await db
      .select({
        id: aiMessages.id,
        role: aiMessages.role,
        content: aiMessages.content,
        toolCalls: aiMessages.toolCalls,
        injectedBy: aiMessages.injectedBy,
        injectedByName: users.name,
        inputTokens: aiMessages.inputTokens,
        outputTokens: aiMessages.outputTokens,
        createdAt: aiMessages.createdAt,
      })
      .from(aiMessages)
      .leftJoin(users, eq(aiMessages.injectedBy, users.id))
      .where(eq(aiMessages.conversationId, convId))
      .orderBy(asc(aiMessages.createdAt));

    return NextResponse.json({ success: true, data: { conversation: conv, messages } });
  } catch (err) {
    console.error('[GET /api/admin/ai/conversations/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    if (!requireAdmin(session)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const { flagged } = await req.json();

    const [conv] = await db.update(aiConversations)
      .set({ flagged, updatedAt: new Date() })
      .where(eq(aiConversations.id, parseInt(id, 10)))
      .returning();

    if (!conv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: conv });
  } catch (err) {
    console.error('[PATCH /api/admin/ai/conversations/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
