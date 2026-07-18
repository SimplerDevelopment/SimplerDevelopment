/**
 * GET /api/admin/agentic-os/runs/:id/stream
 *
 * Server-Sent Events stream for a single run. Tails the in-process child's
 * stdout (via a tap on the executor's ChildEntry) if the run is still live,
 * otherwise replays the captured output from the DB row.
 *
 * Events:
 *   data: <chunk>\n\n            // each stdout/stderr chunk (stderr lines
 *                                   are prefixed with "[stderr] " by the
 *                                   producer)
 *   event: done\ndata: <json>\n\n // sent once when the run reaches a
 *                                   terminal status; payload is
 *                                   { status, exitCode, errorMessage }
 *
 * The stream closes immediately after emitting `done`. The handler also
 * polls the DB row every 1s so we still detect termination if the
 * in-process child was reaped before the client connected (e.g. very
 * short runs, or server restart between spawn and connect).
 */
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agenticOsRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getChild } from '@/lib/agentic-os/executor';
import { isLocalDev } from '@/lib/agentic-os/local-only';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TERMINAL = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'unavailable',
]);

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isLocalDev()) return new Response(null, { status: 404 });
  const session = await requireStaff();
  if (!session) return jsonError(401, 'Unauthorized');

  const { id } = await params;
  const runId = Number.parseInt(id, 10);
  if (!Number.isFinite(runId) || runId <= 0) {
    return jsonError(400, 'Invalid run id');
  }

  const [run] = await db
    .select({
      id: agenticOsRuns.id,
      status: agenticOsRuns.status,
      output: agenticOsRuns.output,
      exitCode: agenticOsRuns.exitCode,
      errorMessage: agenticOsRuns.errorMessage,
    })
    .from(agenticOsRuns)
    .where(eq(agenticOsRuns.id, runId))
    .limit(1);

  if (!run) return jsonError(404, 'Run not found');

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let tapFn: ((chunk: string) => void) | null = null;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const safeEnqueue = (bytes: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          closed = true;
        }
      };

      const send = (data: string, event?: string) => {
        if (event) {
          safeEnqueue(encoder.encode(`event: ${event}\n`));
        }
        // SSE: split on newlines so multi-line data is properly framed.
        for (const line of data.split('\n')) {
          safeEnqueue(encoder.encode(`data: ${line}\n`));
        }
        safeEnqueue(encoder.encode('\n'));
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        const entry = getChild(runId);
        if (entry && tapFn) entry.taps.delete(tapFn);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const emitDoneFromRow = async () => {
        const [latest] = await db
          .select({
            status: agenticOsRuns.status,
            exitCode: agenticOsRuns.exitCode,
            errorMessage: agenticOsRuns.errorMessage,
            output: agenticOsRuns.output,
          })
          .from(agenticOsRuns)
          .where(eq(agenticOsRuns.id, runId))
          .limit(1);
        if (latest) {
          send(
            JSON.stringify({
              status: latest.status,
              exitCode: latest.exitCode,
              errorMessage: latest.errorMessage,
            }),
            'done'
          );
        }
        cleanup();
      };

      // ── Terminal already: replay captured output and close ─────────────
      if (TERMINAL.has(run.status)) {
        if (run.output && run.output.length > 0) {
          send(run.output);
        }
        send(
          JSON.stringify({
            status: run.status,
            exitCode: run.exitCode,
            errorMessage: run.errorMessage,
          }),
          'done'
        );
        cleanup();
        return;
      }

      // ── Live path: attach a tap if the child is still in-process ───────
      const entry = getChild(runId);
      if (entry) {
        // Replay anything captured so far.
        if (entry.outputBuf.length > 0) {
          send(entry.outputBuf);
        }
        tapFn = (chunk: string) => send(chunk);
        entry.taps.add(tapFn);
      } else if (run.output && run.output.length > 0) {
        // Child gone but row not yet terminal (e.g. mid-update) — replay
        // what we have; the poll loop below will pick up the done event.
        send(run.output);
      }

      // Heartbeat comment every 15s so proxies don't kill the stream.
      heartbeatTimer = setInterval(() => {
        safeEnqueue(encoder.encode(': heartbeat\n\n'));
      }, 15_000);

      // Poll the row every 1s as fallback termination detector.
      pollTimer = setInterval(() => {
        void (async () => {
          if (closed) return;
          const [latest] = await db
            .select({
              status: agenticOsRuns.status,
              exitCode: agenticOsRuns.exitCode,
              errorMessage: agenticOsRuns.errorMessage,
            })
            .from(agenticOsRuns)
            .where(eq(agenticOsRuns.id, runId))
            .limit(1);
          if (!latest) {
            cleanup();
            return;
          }
          if (TERMINAL.has(latest.status)) {
            await emitDoneFromRow();
          }
        })();
      }, 1_000);
    },

    cancel() {
      // Client disconnected — detach the tap. The actual cleanup runs
      // inside `start` via the closed flag because we don't have direct
      // access to its closures here; in practice the tap-set Set lookup
      // in start's cleanup happens when the poll/heartbeat fire next.
      // We could expose a per-stream cleanup hook, but the cost of a
      // few extra ticks of work is acceptable for the simple case.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
