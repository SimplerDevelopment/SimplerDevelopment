// internal_jobs handler for 'automation.delayed_action' (PUX-047).
//
// An automation action with `delay > 0` is enqueued by executeAction
// (./engine.ts) with runAt = now + delay instead of sleeping inside the
// serverless invocation. This module is the fire-time half: it re-reads the
// rule, re-executes the snapshotted action, and leaves its own audit row.
//
// Security invariant — scopes are NEVER replayed from a snapshot. The enqueued
// payload carries the action and event payload, but authorization state
// (enabled flag, granted scopes, requiresApproval) is re-read from the rule
// row at fire time. A grant revoked — or a rule disabled or deleted — during
// the delay window must win over what was true at enqueue; replaying
// snapshotted scopes would let a revoked rule keep executing for up to the
// longest configured delay (days).

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import { automationRules, automationLogs } from '@/lib/db/schema';
import type { AutomationAction } from '@/lib/db/schema';

type Db = typeof defaultDb;

const TRIGGER_LABEL = 'automation.delayed_action';

/**
 * Best-effort audit row. Log failure must never turn into a queue retry:
 * by the time we log, the action may already have executed, and a retry
 * would re-run a non-idempotent tool (a second CRM row, a second email).
 */
async function logDelayedRun(
  db: Db,
  row: typeof automationLogs.$inferInsert,
): Promise<void> {
  try {
    await db.insert(automationLogs).values(row);
  } catch (err) {
    console.error('[automation] delayed-action log insert failed (swallowed)', {
      ruleId: row.ruleId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function runDelayedAutomationAction(
  payload: Record<string, unknown>,
  db: Db,
): Promise<void> {
  const ruleId = payload.ruleId;
  const clientId = payload.clientId;
  const action = payload.action as AutomationAction | undefined;
  const eventPayload = (payload.eventPayload ?? {}) as Record<string, unknown>;
  if (
    typeof ruleId !== 'number' ||
    typeof clientId !== 'number' ||
    !action ||
    typeof action.tool !== 'string'
  ) {
    throw new Error('automation.delayed_action: malformed payload');
  }

  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId))
    .limit(1);

  // Rule deleted (or, paranoia, re-tenanted) during the delay window → the
  // action is dropped, but an audit row explains why the follow-up never
  // fired. ruleId stays null here — automation_logs.ruleId is a set-null FK
  // precisely so the trail survives rule deletion, and on a tenant mismatch
  // we must not point one tenant's log at another tenant's rule.
  if (!rule || rule.clientId !== clientId) {
    await logDelayedRun(db, {
      clientId,
      ruleId: null,
      triggerEvent: TRIGGER_LABEL,
      triggerPayload: eventPayload,
      actionsExecuted: [],
      status: 'failed',
      duration: 0,
      errorMessage: !rule
        ? `delayed action dropped: rule ${ruleId} no longer exists`
        : `delayed action dropped: rule ${ruleId} no longer belongs to client ${clientId}`,
    });
    return;
  }

  if (!rule.enabled) {
    await logDelayedRun(db, {
      clientId: rule.clientId,
      ruleId: rule.id,
      triggerEvent: TRIGGER_LABEL,
      triggerPayload: eventPayload,
      actionsExecuted: [],
      status: 'failed',
      duration: 0,
      errorMessage: 'delayed action dropped: rule is disabled',
    });
    return;
  }

  // Same attribution fallback as runRule: prefer the userId resolved at
  // enqueue time, else the rule's creator.
  const enqueuedUid = payload.userId;
  const userId =
    typeof enqueuedUid === 'number' && enqueuedUid > 0
      ? enqueuedUid
      : (rule.createdBy ?? 0);

  const started = Date.now();
  const { executeAction } = await import('./engine');
  const result = await executeAction(
    action,
    rule.clientId,
    userId,
    eventPayload,
    rule.createdBy ?? null,
    rule.id,
    (rule.scopes ?? []) as string[],
    rule.requiresApproval ?? undefined,
  );

  await logDelayedRun(db, {
    clientId: rule.clientId,
    ruleId: rule.id,
    triggerEvent: TRIGGER_LABEL,
    triggerPayload: eventPayload,
    actionsExecuted: [result],
    status: result.error ? 'failed' : 'success',
    duration: Date.now() - started,
    errorMessage: result.error,
  });
  // Deliberately no throw when result.error is set: executeAction already
  // swallowed the tool failure into the result (same contract as the inline
  // path), and a queue retry would re-run a non-idempotent tool. Only
  // pre-execution failures (rule fetch, malformed payload) retry via throw.
}
