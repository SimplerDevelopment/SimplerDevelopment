/**
 * POST /api/public/chat/messages
 *
 * Visitor-side message send. Body:
 *   { conversationId, ephemeralToken, body }
 *
 * The ephemeralToken scopes the request to a single conversationId; an
 * attacker who learns one token cannot post to other tenants' inboxes.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyVisitorToken } from '@/lib/chat/token';
import { publishMessage } from '@/lib/chat/realtime';
import { checkVisitorRateLimit } from '@/lib/chat/rate-limit';

const MAX_BODY = 4_000;

export async function POST(req: Request) {
  let body: { conversationId?: number; ephemeralToken?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const verified = verifyVisitorToken(body.ephemeralToken);
  if (!verified) {
    return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 });
  }
  if (verified.conversationId !== body.conversationId) {
    return NextResponse.json({ success: false, message: 'Token / conversation mismatch' }, { status: 401 });
  }

  const text = (body.body || '').trim();
  if (!text) {
    return NextResponse.json({ success: false, message: 'Message body is required' }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return NextResponse.json({ success: false, message: 'Message too long' }, { status: 413 });
  }

  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, verified.conversationId))
    .limit(1);
  if (!conversation) {
    return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
  }
  if (conversation.status === 'closed') {
    return NextResponse.json({ success: false, message: 'Conversation is closed' }, { status: 409 });
  }

  // Rate-limit by visitor — they can only send so fast.
  const rl = checkVisitorRateLimit(`v:${conversation.visitorId}`);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, message: 'Too many messages, slow down' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 1) } },
    );
  }

  const now = new Date();
  const [inserted] = await db
    .insert(chatMessages)
    .values({
      conversationId: conversation.id,
      clientId: conversation.clientId,
      authorKind: 'visitor',
      authorName: conversation.visitorName ?? 'Visitor',
      body: text,
      occurredAt: now,
    })
    .returning();

  await db
    .update(chatConversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(chatConversations.id, conversation.id));

  publishMessage(conversation.id, conversation.clientId, {
    id: inserted.id,
    conversationId: conversation.id,
    authorKind: 'visitor',
    authorName: inserted.authorName,
    body: inserted.body,
    occurredAt: inserted.occurredAt,
  }).catch(() => {});

  return NextResponse.json({ success: true, data: inserted });
}
