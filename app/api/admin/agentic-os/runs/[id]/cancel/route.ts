/**
 * POST /api/admin/agentic-os/runs/:id/cancel
 *
 * Cancel a running Agentic OS run. Sends SIGTERM, then SIGKILL after 5s if
 * the child is still alive. Updates the row to status='cancelled'.
 *
 * Responses:
 *   200 { success: true }                  — kill signal sent
 *   410 { success: false, message: 'Run is not running (no in-process child)' }
 *                                            — server restarted, child already
 *                                              exited, or run is already terminal
 *   404 { success: false, message: 'Run not found' }
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agenticOsRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getChild } from '@/lib/agentic-os/executor';
import { isLocalDev } from '@/lib/agentic-os/local-only';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isLocalDev()) return new NextResponse(null, { status: 404 });
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await params;
  const runId = Number.parseInt(id, 10);
  if (!Number.isFinite(runId) || runId <= 0) {
    return NextResponse.json(
      { success: false, message: 'Invalid run id' },
      { status: 400 }
    );
  }

  const [run] = await db
    .select({ id: agenticOsRuns.id, status: agenticOsRuns.status })
    .from(agenticOsRuns)
    .where(eq(agenticOsRuns.id, runId))
    .limit(1);

  if (!run) {
    return NextResponse.json(
      { success: false, message: 'Run not found' },
      { status: 404 }
    );
  }

  const entry = getChild(runId);
  if (!entry) {
    return NextResponse.json(
      {
        success: false,
        message: 'Run is not running (no in-process child)',
      },
      { status: 410 }
    );
  }

  // Flip the row status first so the exit handler in /run/route.ts preserves
  // 'cancelled' instead of overwriting with 'failed'.
  await db
    .update(agenticOsRuns)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(eq(agenticOsRuns.id, runId));

  try {
    entry.child.kill('SIGTERM');
  } catch {
    /* may already be dead */
  }

  // Escalate to SIGKILL after 5s if still alive.
  const killTimer = setTimeout(() => {
    try {
      if (!entry.child.killed && entry.child.exitCode === null) {
        entry.child.kill('SIGKILL');
      }
    } catch {
      /* swallow */
    }
  }, 5_000);
  // Don't hold the event loop open just for this fallback timer.
  // (Node's Timeout has .unref(); jsdom/DOM types do not — be defensive.)
  if (typeof (killTimer as unknown as { unref?: () => void }).unref === 'function') {
    (killTimer as unknown as { unref: () => void }).unref();
  }

  return NextResponse.json({ success: true });
}
