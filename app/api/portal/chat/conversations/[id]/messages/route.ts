/**
 * POST /api/portal/chat/conversations/[id]/messages
 *
 * Agent reply. NextAuth session required + the conversation must belong to
 * the active client.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatConversations, chatMessages, users } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { and, eq } from 'drizzle-orm';
import { publishMessage } from '@/lib/chat/realtime';

const MAX_BODY = 8_000;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const conversationId = Number.parseInt(id, 10);
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.clientId, client.id)))
    .limit(1);
  if (!conversation) return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
  if (conversation.status === 'closed') {
    return NextResponse.json({ success: false, message: 'Conversation is closed' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? '').trim();
  if (!text) return NextResponse.json({ success: false, message: 'Message body is required' }, { status: 400 });
  if (text.length > MAX_BODY) return NextResponse.json({ success: false, message: 'Message too long' }, { status: 413 });

  const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);

  const now = new Date();
  const [inserted] = await db
    .insert(chatMessages)
    .values({
      conversationId: conversation.id,
      clientId: conversation.clientId,
      authorKind: 'agent',
      authorUserId: userId,
      authorName: author?.name ?? 'Agent',
      body: text,
      occurredAt: now,
    })
    .returning();

  // First agent reply auto-claims the conversation.
  const conversationPatch: Partial<typeof chatConversations.$inferInsert> = {
    lastMessageAt: now,
    updatedAt: now,
  };
  if (conversation.status === 'open' && !conversation.assignedUserId) {
    conversationPatch.status = 'assigned';
    conversationPatch.assignedUserId = userId;
  }
  await db.update(chatConversations).set(conversationPatch).where(eq(chatConversations.id, conversation.id));

  publishMessage(conversation.id, conversation.clientId, {
    id: inserted.id,
    conversationId: conversation.id,
    authorKind: 'agent',
    authorName: inserted.authorName,
    body: inserted.body,
    occurredAt: inserted.occurredAt,
  }).catch(() => {});

  return NextResponse.json({ success: true, data: inserted });
}
