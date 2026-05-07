/**
 * POST /api/public/chat/start
 *
 * Public surface — no auth. Widget posts `{ widgetId, visitorId, name?, email? }`,
 * gets back `{ conversationId, ephemeralToken }`. Idempotent on
 * (widget, visitorId): the same visitor returning to the same site reuses
 * their open conversation.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatWidgets, chatConversations } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { issueVisitorToken } from '@/lib/chat/token';
import { publishConversationUpdate } from '@/lib/chat/realtime';

export async function POST(req: Request) {
  let body: {
    widgetId?: number | string;
    visitorId?: string;
    name?: string;
    email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const widgetId = typeof body.widgetId === 'string' ? Number.parseInt(body.widgetId, 10) : body.widgetId;
  const visitorId = (body.visitorId || '').trim();
  if (!Number.isInteger(widgetId) || (widgetId as number) <= 0) {
    return NextResponse.json({ success: false, message: 'widgetId is required' }, { status: 400 });
  }
  if (!visitorId || visitorId.length > 64) {
    return NextResponse.json({ success: false, message: 'visitorId is required' }, { status: 400 });
  }

  const [widget] = await db
    .select()
    .from(chatWidgets)
    .where(eq(chatWidgets.id, widgetId as number))
    .limit(1);
  if (!widget || !widget.enabled) {
    return NextResponse.json({ success: false, message: 'Widget not available' }, { status: 404 });
  }

  // Reuse the visitor's existing open/assigned conversation if one exists.
  const [existing] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.widgetId, widget.id),
        eq(chatConversations.visitorId, visitorId),
        ne(chatConversations.status, 'closed'),
      ),
    )
    .limit(1);

  if (existing) {
    // Patch contact details if newly provided.
    if ((body.name && !existing.visitorName) || (body.email && !existing.visitorEmail)) {
      await db
        .update(chatConversations)
        .set({
          visitorName: body.name?.slice(0, 255) ?? existing.visitorName,
          visitorEmail: body.email?.slice(0, 255) ?? existing.visitorEmail,
          updatedAt: new Date(),
        })
        .where(eq(chatConversations.id, existing.id));
    }
    return NextResponse.json({
      success: true,
      data: {
        conversationId: existing.id,
        widgetId: widget.id,
        ephemeralToken: issueVisitorToken(existing.id),
        greetingMessage: widget.greetingMessage,
        primaryColor: widget.primaryColor,
        position: widget.position,
        awayMessage: widget.awayMessage,
      },
    });
  }

  const [created] = await db
    .insert(chatConversations)
    .values({
      widgetId: widget.id,
      clientId: widget.clientId,
      visitorId,
      visitorName: body.name?.slice(0, 255) ?? null,
      visitorEmail: body.email?.slice(0, 255) ?? null,
      status: 'open',
      lastMessageAt: new Date(),
    })
    .returning();

  publishConversationUpdate(widget.clientId, {
    conversationId: created.id,
    status: 'open',
    visitorName: created.visitorName,
    lastMessageAt: created.lastMessageAt,
    kind: 'created',
  }).catch(() => {
    // Best-effort — don't fail the request on a notify hiccup.
  });

  return NextResponse.json({
    success: true,
    data: {
      conversationId: created.id,
      widgetId: widget.id,
      ephemeralToken: issueVisitorToken(created.id),
      greetingMessage: widget.greetingMessage,
      primaryColor: widget.primaryColor,
      position: widget.position,
      awayMessage: widget.awayMessage,
    },
  });
}
