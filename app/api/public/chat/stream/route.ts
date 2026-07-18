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
import { conversationChannel, subscribeChannel, ChatRealtimePayload } from '@/lib/chat/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseFormat(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

  const encoder = new TextEncoder();
  let cleanup: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Hello frame so the browser registers the connection immediately.
      controller.enqueue(encoder.encode(sseFormat('hello', { conversationId })));

      const subscription = subscribeChannel(conversationChannel(conversationId), (payload: ChatRealtimePayload) => {
        try {
          controller.enqueue(encoder.encode(sseFormat(payload.kind, payload)));
        } catch {
          // controller closed — handled by cancel()
        }
      });
      cleanup = subscription.unsubscribe;

      // Heartbeat — keeps proxies / load balancers from killing the
      // socket on idle timeout. Comments are ignored by EventSource.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // closed
        }
      }, 25_000);

      // Surface listen errors as a stream close — EventSource auto-reconnects.
      subscription.ready.catch(() => {
        try {
          controller.close();
        } catch {}
      });
    },
    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (cleanup) await cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
