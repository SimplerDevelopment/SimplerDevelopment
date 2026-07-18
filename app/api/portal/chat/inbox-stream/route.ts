/**
 * GET /api/portal/chat/inbox-stream
 *
 * Agent-side SSE feed scoped to the active client. Subscribes to
 * `chat_inbox_${clientId}` and forwards every conversation/message
 * notification to the inbox UI.
 */

import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { ChatRealtimePayload, inboxChannel, subscribeChannel } from '@/lib/chat/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return new Response('Client not found', { status: 404 });

  const encoder = new TextEncoder();
  let cleanup: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(sse('hello', { clientId: client.id })));

      const sub = subscribeChannel(inboxChannel(client.id), (payload: ChatRealtimePayload) => {
        try {
          controller.enqueue(encoder.encode(sse(payload.kind, payload)));
        } catch {
          // closed
        }
      });
      cleanup = sub.unsubscribe;

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 25_000);

      sub.ready.catch(() => {
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
