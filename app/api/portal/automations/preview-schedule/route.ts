import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { computeNextRunAt, validateSchedule, describeSchedule } from '@/lib/automation/schedule';

/**
 * POST /api/portal/automations/preview-schedule
 *
 * Body: { schedule: AutomationSchedule }
 * Returns: { success, description, nextRunAt }
 *
 * Used by the rule editor for the live "Next runs at …" preview when the
 * user is configuring a time-based trigger. Keeps the cron-parser dependency
 * server-side — the editor doesn't need to bundle it.
 */
export async function POST(req: Request) { // role-gate: read-ok pure computation — schedule preview fired on page load
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  // role-matrix: read level on purpose. This is a pure computation that the rule editor fires from a
  // useEffect on page load, so any member who merely opens the page calls it; 'admin' would log a
  // would-be denial for each of them and, once enforced, reject valid schedules.
  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;

  const body = await req.json().catch(() => ({}));
  const result = validateSchedule(body?.schedule);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  const next = computeNextRunAt(result.schedule, new Date());
  return NextResponse.json({
    success: true,
    description: describeSchedule(result.schedule),
    nextRunAt: next ? next.toISOString() : null,
  });
}
