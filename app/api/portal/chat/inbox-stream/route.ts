/**
 * GET /api/portal/chat/inbox-stream
 *
 * Agent-side SSE feed scoped to the active client. Subscribes to
 * `chat_inbox_${clientId}` and forwards every conversation/message
 * notification to the inbox UI.
 */

import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { inboxChannel, subscribeChannel } from '@/lib/chat/realtime';
import { createEventStream } from '@/lib/chat/event-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return new Response('Client not found', { status: 404 });

  const stream = createEventStream(req.signal, { clientId: client.id }, emit =>
    subscribeChannel(inboxChannel(client.id), payload => emit(payload.kind, payload)),
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
