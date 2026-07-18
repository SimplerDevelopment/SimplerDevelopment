/**
 * GET /api/admin/agentic-os/runs/:id
 *
 * Fetch a single run by id (used by the UI to get final status + full
 * output after the SSE stream closes).
 *
 * Response:
 *   { success: true, data: { run: { id, skillId, prompt, variables, status,
 *     output, exitCode, errorMessage, durationMs, host, createdBy,
 *     createdAt, startedAt, completedAt } } }
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agenticOsRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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

export async function GET(
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
    .select()
    .from(agenticOsRuns)
    .where(eq(agenticOsRuns.id, runId))
    .limit(1);

  if (!run) {
    return NextResponse.json(
      { success: false, message: 'Run not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: { run } });
}
