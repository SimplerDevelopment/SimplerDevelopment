/**
 * GET /api/portal/projects/:id/board-stream
 *
 * SSE wakeup channel for one project's Kanban board. Carries NO payload: a
 * NOTIFY here means "something on this board changed", and the client refetches
 * the board's REST projection. That keeps one source of truth for the board
 * shape (the REST route) instead of duplicating its projection into the stream —
 * the same call the flow-runs list stream makes, for the same reason.
 *
 * Two consequences of the empty payload, both deliberate:
 *   - a burst of writes collapses into one refetch on the client's debounce
 *     rather than N messages each carrying a partial diff;
 *   - a NOTIFY missed while disconnected costs nothing, because the client
 *     refetches on `ready` too. That matters: Vercel caps function duration, so
 *     a long-lived board WILL be cut off and reconnected by EventSource, and
 *     Postgres NOTIFY has no replay.
 *
 * Tenancy: the channel name is derived from the project id, but subscribing is
 * gated here — a caller must be staff, or a member of the client that owns the
 * project. The payload carries no tenant data regardless, so the worst a leaked
 * channel could reveal is the timing of a write, not its content.
 */

import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';
import { subscribeBoardChannel } from '@/lib/kanban/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

async function authorize(projectId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const [project] = await db
    .select({ id: projects.id, clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return { project };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return new Response('Invalid id', { status: 400 });

  const access = await authorize(projectId);
  if (!access) return new Response('Not found', { status: 404 });

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

      // Tell the client it is connected. It refetches on this, which is what
      // closes the gap left by a reconnect after Vercel cuts the function.
      send(`event: ready\ndata: {}\n\n`);

      const sub = subscribeBoardChannel(projectId, () => {
        send(`data: ${JSON.stringify({ ping: true })}\n\n`);
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
