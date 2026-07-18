/**
 * GET /api/portal/chat/conversations
 *
 * Inbox listing for the active client. Filters: ?status=open|assigned|closed,
 * ?assignee=me|<userId>, ?limit=, ?offset=.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { and, desc, eq, SQL } from 'drizzle-orm';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const assignee = url.searchParams.get('assignee');
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const filters: SQL[] = [eq(chatConversations.clientId, client.id)];
  if (status === 'open' || status === 'assigned' || status === 'closed') {
    filters.push(eq(chatConversations.status, status));
  }
  if (assignee === 'me') {
    filters.push(eq(chatConversations.assignedUserId, userId));
  } else if (assignee && /^\d+$/.test(assignee)) {
    filters.push(eq(chatConversations.assignedUserId, Number.parseInt(assignee, 10)));
  }

  const data = await db
    .select()
    .from(chatConversations)
    .where(and(...filters))
    .orderBy(desc(chatConversations.lastMessageAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ success: true, data });
}
