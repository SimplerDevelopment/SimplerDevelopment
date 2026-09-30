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
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  // role-matrix: automations are admin+. The preview is a pure computation, but it only serves the
  // rule editor, which only admins can open. observeRole keeps it log-only until AUTH_ROLE_ENFORCE=1.
  const authResult = await authorizePortal({ action: 'admin', observeRole: true });
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
