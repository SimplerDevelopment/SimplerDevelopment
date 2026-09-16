/**
 * GET /api/public/chat/stream?conversationId=…&token=…
 *
 * Visitor-side SSE feed. Subscribes to `chat_conv_${conversationId}` via
 * Postgres LISTEN/NOTIFY (lib/chat/realtime.ts) and streams every message
 * the agent posts back to the browser as `event: message`.
 *
 * Edge runtime would let us avoid the long-lived Node connection, but
 * postgres-js's LISTEN needs a real socket — keep this on Node.
 */

import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyVisitorToken } from '@/lib/chat/token';
import { conversationChannel, subscribeChannel } from '@/lib/chat/realtime';
import { createEventStream } from '@/lib/chat/event-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = Number.parseInt(url.searchParams.get('conversationId') || '', 10);
  const token = url.searchParams.get('token');

  const verified = verifyVisitorToken(token);
  if (!verified || verified.conversationId !== conversationId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!conversation) {
    return new Response('Not found', { status: 404 });
  }

  const stream = createEventStream(req.signal, { conversationId }, emit =>
    subscribeChannel(conversationChannel(conversationId), payload => emit(payload.kind, payload)),
  );

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
