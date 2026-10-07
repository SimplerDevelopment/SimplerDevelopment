/**
 * POST /api/public/chat/messages
 *
 * Visitor-side message send. Body:
 *   { conversationId, ephemeralToken, body }
 *
 * The ephemeralToken scopes the request to a single conversationId; an
 * attacker who learns one token cannot post to other tenants' inboxes.
 *
 * Persistence flows through ChannelGateway (lib/channels): contact
 * resolution, conversation linking and events run in one place instead of
 * ad-hoc inserts. Persistence is transactional and retryable with a visitor message id;
 * a failed step never causes a second insertion through another path.
 *
 * Auto-reply: when the conversation opted into AI (aiMode === 'ai'), the
 * deterministic router + reception agent answer from tenant data. Anything
 * the reception cannot answer flips the conversation back to 'human'.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  bookingPages,
  chatConversations,
  chatWidgets,
  clients,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyVisitorToken } from '@/lib/chat/token';
import { publishMessage } from '@/lib/chat/realtime';
import { checkVisitorRateLimit } from '@/lib/chat/rate-limit';
import { createWebchatGateway } from '@/lib/channels/webchat-flow';
import { persistWebchatInbound } from '@/lib/channels/webchat-inbound';
import { randomUUID } from 'node:crypto';
import { publishConversationUpdate } from '@/lib/chat/realtime';
import { classifyIntent } from '@/lib/channels/router';
import { buildReceptionReply, requiresHandoff } from '@/lib/channels/reception';

const MAX_BODY = 4_000;
type VisitorMessageBody = { conversationId?: number; ephemeralToken?: string; body?: string; messageId?: string };

function validateVisitorMessage(body: VisitorMessageBody) {
  const verified = verifyVisitorToken(body.ephemeralToken);
  if (!verified) return { error: 'Invalid token', status: 401 };
  if (verified.conversationId !== body.conversationId) return { error: 'Token / conversation mismatch', status: 401 };
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (body.messageId != null && (typeof body.messageId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.messageId))) {
    return { error: 'Invalid message id', status: 400 };
  }
  if (!text) return { error: 'Message body is required', status: 400 };
  if (text.length > MAX_BODY) return { error: 'Message too long', status: 413 };
  return { conversationId: verified.conversationId, text };
}

export async function POST(req: Request) {
  let body: VisitorMessageBody;
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid message object');
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const validated = validateVisitorMessage(body);
  if ('error' in validated) {
    return NextResponse.json({ success: false, message: validated.error }, { status: validated.status });
  }
  const { text } = validated;

  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, validated.conversationId))
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

  const visitorIdentity = { kind: 'webchat' as const, value: conversation.visitorId ?? `visitor:${conversation.id}` };
  const messageKey = `visitor:${conversation.id}:${body.messageId ?? randomUUID()}`;
  let stored: Awaited<ReturnType<typeof persistWebchatInbound>>;
  try {
    stored = await persistWebchatInbound({
      conversationId: conversation.id, clientId: conversation.clientId, widgetId: conversation.widgetId,
      visitorIdentity, text, messageKey,
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Message could not be stored. Retry the same send.' }, { status: 503 });
  }
  const { message: row } = stored;
  if (!stored.duplicate) await publishMessage(conversation.id, conversation.clientId, {
    id: row.id, conversationId: conversation.id, authorKind: 'visitor',
    authorName: row.authorName, body: row.body, occurredAt: row.occurredAt,
  }).catch(() => {});

  const autoReplied = await tryAutoReply(conversation, stored, { visitorIdentity, text, messageKey, baseUrl: new URL(req.url).origin });
  return NextResponse.json({ success: true, data: { ...row, autoReplied } });
}

async function tryAutoReply(
  conversation: typeof chatConversations.$inferSelect,
  { contactId, connectionId }: Awaited<ReturnType<typeof persistWebchatInbound>>,
  input: Pick<Parameters<typeof maybeAutoReply>[0], 'visitorIdentity' | 'text' | 'messageKey' | 'baseUrl'>,
): Promise<boolean> {
  if (contactId != null && connectionId != null && conversation.aiMode === 'ai') {
    try {
      return await maybeAutoReply({
        connectionId,
        conversationId: conversation.id,
        clientId: conversation.clientId,
        contactId,
        widgetId: conversation.widgetId,
        ...input,
      });
    } catch {
      // Auto-reply must never break the visitor send — the message above
      // is already stored and published.
    }
  }

  return false;
}

async function maybeAutoReply(input: {
  connectionId: number;
  conversationId: number;
  clientId: number;
  contactId: number;
  widgetId: number | null;
  visitorIdentity: { kind: 'webchat'; value: string };
  text: string;
  messageKey: string;
  baseUrl: string;
}): Promise<boolean> {
  const { gateway } = createWebchatGateway();
  const { intent } = classifyIntent(input.text);

  const [clientRow] = await db
    .select({ agencyName: clients.agencyName, company: clients.company, address: clients.address })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  const [widget] = input.widgetId
    ? await db
        .select({ greetingMessage: chatWidgets.greetingMessage, enabled: chatWidgets.enabled, brainEnabled: chatWidgets.brainEnabled })
        .from(chatWidgets)
        .where(and(eq(chatWidgets.id, input.widgetId), eq(chatWidgets.clientId, input.clientId)))
        .limit(1)
    : [];
  if (input.widgetId != null && (!widget?.enabled || !widget.brainEnabled)) return false;
  const serviceRows = await db
    .select({
      title: bookingPages.title,
      slug: bookingPages.slug,
      duration: bookingPages.duration,
      priceLabel: bookingPages.priceLabel,
    })
    .from(bookingPages)
    .where(and(eq(bookingPages.clientId, input.clientId), eq(bookingPages.active, true)))
    .limit(10);

  const outcome = buildReceptionReply(intent, {
    businessName: clientRow?.agencyName ?? clientRow?.company ?? 'nuestro negocio',
    address: clientRow?.address ?? null,
    greeting: widget?.greetingMessage ?? null,
    services: serviceRows.map((s) => ({
      title: s.title,
      durationMin: s.duration,
      priceLabel: s.priceLabel,
      bookingUrl: new URL(`/book/${encodeURIComponent(s.slug)}`, input.baseUrl).toString(),
    })),
  }, input.text);

  const sendResult = await gateway.send({
    channel: 'webchat',
    provider: 'webchat',
    connectionId: input.connectionId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    recipientIdentity: input.visitorIdentity,
    messageType: 'text',
    text: outcome.text,
    // Live reply inside an active conversation — policy always allows it.
    withinReplyWindow: true,
    idempotencyKey: `reply:${input.messageKey}`,
  });
  if (sendResult.status !== 'sent' && sendResult.status !== 'queued') return false;

  if (requiresHandoff(outcome)) {
    await db
      .update(chatConversations)
      .set({ aiMode: 'human', updatedAt: new Date() })
      .where(and(eq(chatConversations.id, input.conversationId), eq(chatConversations.clientId, input.clientId)));
    await publishConversationUpdate(input.clientId, { conversationId: input.conversationId, aiMode: 'human' }).catch(() => {});
  }
  return true;
}
