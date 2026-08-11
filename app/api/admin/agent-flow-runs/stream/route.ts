/**
 * GET /api/admin/agent-flow-runs/stream
 *
 * Coarse SSE channel for the cross-tenant executions monitor — the staff-wide
 * counterpart to /api/portal/projects/:id/flow-runs/stream, listening on the
 * single ADMIN_CHANNEL instead of one channel per project (an admin viewer
 * would otherwise have to re-subscribe every time a project is created).
 *
 * Carries run LIFECYCLE only, and ships no payload: a NOTIFY here is purely a
 * wakeup and the client refetches /api/admin/agent-flow-runs. That keeps one
 * source of truth for the list shape rather than duplicating its projection
 * into the stream — same reasoning as the portal route it mirrors.
 */

import { auth } from '@/lib/auth';
import { subscribeAdminChannel } from '@/lib/agent-flows/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

// Local staff gate, matching every sibling route under app/api/admin/**.
async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };

      // Lets the client distinguish "live" from "still connecting" rather than
      // silently showing stale rows.
      send(`event: ready\ndata: {}\n\n`);

      const sub = subscribeAdminChannel((eventId) => {
        send(`data: ${JSON.stringify({ ping: true, eventId })}\n\n`);
      });
      unsubscribe = sub.unsubscribe;
      await sub.ready;

      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
    },
    async cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
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
