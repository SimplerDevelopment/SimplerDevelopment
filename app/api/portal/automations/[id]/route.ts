import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { automationRules } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and } from 'drizzle-orm';
import { computeNextRunAt, validateSchedule } from '@/lib/automation/schedule';
import { deriveRuleScopes } from '@/lib/ai/portal-tools/derive-rule-scopes';

// PATCH /api/portal/automations/[id] — update a rule (toggle, edit, etc.)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  const body = await req.json();

  // Only allow updating specific fields
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.trigger !== undefined) updates.trigger = body.trigger;
  if (body.conditions !== undefined) updates.conditions = body.conditions;
  if (body.actions !== undefined) {
    updates.actions = body.actions;
    updates.scopes = deriveRuleScopes(body.actions);
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.productScope !== undefined) updates.productScope = body.productScope;

  // Schedule: explicit null clears both schedule and nextRunAt (rule reverts
  // to event-driven). Non-null is validated, then nextRunAt is recomputed
  // from `now` so the scheduler picks it up on the next minute.
  if (body.schedule !== undefined) {
    if (body.schedule === null) {
      updates.schedule = null;
      updates.nextRunAt = null;
    } else {
      const result = validateSchedule(body.schedule);
      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      updates.schedule = result.schedule;
      updates.nextRunAt = computeNextRunAt(result.schedule, new Date());
    }
  }

  const [updated] = await db.update(automationRules)
    .set(updates)
    .where(and(
      eq(automationRules.id, ruleId),
      eq(automationRules.clientId, client.id),
    ))
    .returning();

  if (!updated) return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });

  return NextResponse.json({ success: true, rule: updated });
}

// DELETE /api/portal/automations/[id] — delete a rule
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'admin' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const ruleId = parseInt(id, 10);

  await db.delete(automationRules)
    .where(and(
      eq(automationRules.id, ruleId),
      eq(automationRules.clientId, client.id),
    ));

  return NextResponse.json({ success: true });
}
