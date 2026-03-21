import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

function requireAdmin(session: Awaited<ReturnType<typeof auth>>) {
  const role = (session?.user as { role?: string })?.role;
  return role === 'admin' || role === 'employee';
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    if (!requireAdmin(session)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const convId = parseInt(id, 10);
    const adminId = parseInt(session.user.id, 10);

    const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, convId)).limit(1);
    if (!conv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const { message } = await req.json();
    if (!message?.trim()) return NextResponse.json({ success: false, message: 'message is required' }, { status: 400 });

    const [msg] = await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'assistant',
      content: message.trim(),
      injectedBy: adminId,
      inputTokens: 0,
      outputTokens: 0,
    }).returning();

    await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, convId));

    return NextResponse.json({ success: true, data: msg });
  } catch (err) {
    console.error('[POST /api/admin/ai/conversations/[id]/inject]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
