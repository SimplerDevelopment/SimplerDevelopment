import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, aiMessages, clients, users } from '@/lib/db/schema';
import { eq, desc, count } from 'drizzle-orm';

function requireAdmin(session: Awaited<ReturnType<typeof auth>>) {
  const role = (session?.user as { role?: string })?.role;
  return role === 'admin' || role === 'employee';
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    if (!requireAdmin(session)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const rows = await db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        flagged: aiConversations.flagged,
        totalInputTokens: aiConversations.totalInputTokens,
        totalOutputTokens: aiConversations.totalOutputTokens,
        createdAt: aiConversations.createdAt,
        updatedAt: aiConversations.updatedAt,
        clientId: aiConversations.clientId,
        clientCompany: clients.company,
        clientUserName: users.name,
        clientUserEmail: users.email,
      })
      .from(aiConversations)
      .leftJoin(clients, eq(aiConversations.clientId, clients.id))
      .leftJoin(users, eq(clients.userId, users.id))
      .orderBy(desc(aiConversations.updatedAt));

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /api/admin/ai/conversations]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
