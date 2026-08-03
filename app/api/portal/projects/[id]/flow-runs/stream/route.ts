/**
 * GET /api/portal/projects/:id/flow-runs/stream
 *
 * Coarse SSE channel for a project's executions list. Carries run LIFECYCLE
 * only (started / waiting / finished) — node-level chatter stays on the
 * per-run channel, which is the whole reason the two are split: a list viewer
 * should not receive every node event of every concurrent run.
 *
 * Unlike the per-run stream, this deliberately does NOT ship event payloads.
 * The list renders run rows (status, progress, tokens), not events, so a
 * NOTIFY here is purely a wakeup: we emit a bare `ping` and the client
 * refetches /flow-runs. That keeps one source of truth for the list shape
 * (the REST route) instead of duplicating its projection into the stream.
 */

import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';
import { subscribeProjectChannel } from '@/lib/agent-flows/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

async function authorize(projectId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const [project] = await db.select({ id: projects.id, clientId: projects.clientId })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
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

      // Tell the client it's connected so it can distinguish "live" from
      // "still connecting" rather than silently showing stale rows.
      send(`event: ready\ndata: {}\n\n`);

      const sub = subscribeProjectChannel(projectId, (eventId) => {
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
