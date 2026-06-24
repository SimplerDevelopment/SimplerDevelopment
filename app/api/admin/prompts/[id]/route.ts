import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, promptVersions, evalRuns } from '@/lib/db/schema';
import { eq, asc, desc } from 'drizzle-orm';
import { requireStaff, requireAdmin } from '../_auth';
import { logPromptAudit } from '@/lib/ai/evals/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/prompts/[id] — a single prompt with its version history and
 * full run timeline (ascending by createdAt, so the chart reads left→right).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const promptId = parseInt(id, 10);
  if (Number.isNaN(promptId)) {
    return NextResponse.json({ success: false, message: 'Invalid prompt id' }, { status: 400 });
  }

  const [prompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!prompt) return NextResponse.json({ success: false, message: 'Prompt not found' }, { status: 404 });

  const versions = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.promptId, promptId))
    .orderBy(desc(promptVersions.version));

  const runs = await db
    .select({
      id: evalRuns.id,
      status: evalRuns.status,
      trigger: evalRuns.trigger,
      promptVersionId: evalRuns.promptVersionId,
      total: evalRuns.total,
      passed: evalRuns.passed,
      passRate: evalRuns.passRate,
      aggregate: evalRuns.aggregate,
      avgLatencyMs: evalRuns.avgLatencyMs,
      totalTokens: evalRuns.totalTokens,
      costUsd: evalRuns.costUsd,
      createdAt: evalRuns.createdAt,
      finishedAt: evalRuns.finishedAt,
    })
    .from(evalRuns)
    .where(eq(evalRuns.promptId, promptId))
    .orderBy(asc(evalRuns.createdAt));

  return NextResponse.json({ success: true, data: { prompt, versions, runs } });
}

// Light cron-expr validator — 5 space-separated fields (lenient).
const CRON_RE = /^(\S+\s+){4}\S+$/;

/**
 * PATCH /api/admin/prompts/[id] — edit prompt metadata and/or schedule.
 *
 * Body (all optional): { title?, description?, scheduleCron? }
 * Requires admin role.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const promptId = parseInt(id, 10);
  if (Number.isNaN(promptId)) {
    return NextResponse.json({ success: false, message: 'Invalid prompt id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    title,
    description,
    scheduleCron,
  } = body as { title?: unknown; description?: unknown; scheduleCron?: unknown };

  // Validate scheduleCron if provided
  const hasCron = 'scheduleCron' in (body as object);
  if (hasCron && scheduleCron != null && scheduleCron !== '') {
    if (typeof scheduleCron !== 'string' || !CRON_RE.test(scheduleCron.trim())) {
      return NextResponse.json({ success: false, message: 'scheduleCron must be a valid 5-field cron expression or null/empty' }, { status: 400 });
    }
  }

  const [existing] = await db.select({ id: promptRegistry.id }).from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Prompt not found' }, { status: 404 });
  }

  // Collect allowed field mutations, then spread into a typed set() call
  // (same pattern as other PATCH routes in this codebase).
  const allowed: Record<string, unknown> = {};
  if (typeof title === 'string') allowed.title = title;
  if ('description' in (body as object)) allowed.description = (description as string | null | undefined) ?? null;
  if (hasCron) {
    allowed.scheduleCron =
      scheduleCron == null || scheduleCron === '' ? null : (scheduleCron as string).trim();
  }

  const [updated] = await db
    .update(promptRegistry)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(promptRegistry.id, promptId))
    .returning();

  const actorId = parseInt((session.user as { id: string }).id, 10);

  // Determine which audit action to log
  const auditAction = hasCron ? 'edit_schedule' : 'edit_prompt';
  await logPromptAudit({
    actorUserId: actorId,
    action: auditAction,
    promptId,
    versionId: null,
    detail: allowed,
  });

  return NextResponse.json({ success: true, data: { prompt: updated } });
}
