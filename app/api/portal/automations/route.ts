import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { automationRules } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, desc } from 'drizzle-orm';
import { computeNextRunAt, validateSchedule } from '@/lib/automation/schedule';
import type { AutomationSchedule } from '@/lib/db/schema';
import { deriveRuleScopes } from '@/lib/ai/portal-tools/derive-rule-scopes';

// GET /api/portal/automations — list all automation rules for client
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const rules = await db.select()
    .from(automationRules)
    .where(eq(automationRules.clientId, client.id))
    .orderBy(desc(automationRules.createdAt));

  return NextResponse.json({ success: true, rules });
}

// POST /api/portal/automations — create a new automation rule
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const body = await req.json();
  const { name, description, trigger, conditions, actions, source, productScope, schedule } = body;

  if (!name || !trigger || !actions?.length) {
    return NextResponse.json({ success: false, error: 'name, trigger, and actions are required' }, { status: 400 });
  }

  // Optional time-based trigger. When set, the scheduler cron fires this
  // rule independently of the event bus. `trigger` is still required by the
  // existing schema — callers should pass a sentinel like
  // `{ event: 'automation.scheduled' }` for scheduled-only rules.
  let scheduleValue: AutomationSchedule | null = null;
  let nextRunAt: Date | null = null;
  if (schedule != null) {
    const result = validateSchedule(schedule);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    scheduleValue = result.schedule;
    nextRunAt = computeNextRunAt(result.schedule, new Date());
  }

  const [rule] = await db.insert(automationRules).values({
    clientId: client.id,
    name,
    description,
    trigger,
    conditions: conditions || [],
    actions,
    scopes: deriveRuleScopes(actions),
    source: source || 'manual',
    productScope: productScope || null,
    schedule: scheduleValue,
    nextRunAt,
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, rule });
}
