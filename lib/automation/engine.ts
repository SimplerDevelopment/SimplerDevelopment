/**
 * Automation Rule Engine
 *
 * Matches incoming events against client rules,
 * evaluates conditions, and executes actions via portal tools.
 */

import { db } from '@/lib/db';
import { automationRules, automationLogs } from '@/lib/db/schema';
import type { AutomationCondition, AutomationAction } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { onEvent, type AutomationEvent } from './event-bus';
import { executePortalTool } from '@/lib/ai/portal-tools';

// AutomationRule type as returned by drizzle SELECT * (kept loose since
// schedule + nextRunAt columns may or may not be present on read paths that
// predate migration 0107). The runRule helper only reads id/clientId/conditions/actions.
type AutomationRule = typeof automationRules.$inferSelect;

// ─── TEMPLATE RESOLUTION ───────────────────────────────────────────────────

/**
 * Resolve {{event.field}} and {{event.nested.field}} template variables
 * in action params using the event payload.
 */
function resolveTemplate(value: unknown, payload: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{event\.([^}]+)\}\}/g, (_match, path: string) => {
      const parts = path.split('.');
      let current: unknown = payload;
      for (const part of parts) {
        if (current == null || typeof current !== 'object') return '';
        current = (current as Record<string, unknown>)[part];
      }
      return current != null ? String(current) : '';
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveTemplate(v, payload));
  }
  if (value && typeof value === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveTemplate(v, payload);
    }
    return resolved;
  }
  return value;
}

// ─── CONDITION EVALUATION ──────────────────────────────────────────────────

function evaluateCondition(condition: AutomationCondition, payload: Record<string, unknown>): boolean {
  const parts = condition.field.split('.');
  let current: unknown = payload;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      current = undefined;
      break;
    }
    current = (current as Record<string, unknown>)[part];
  }

  switch (condition.operator) {
    case 'equals': return current === condition.value;
    case 'not_equals': return current !== condition.value;
    case 'contains': return typeof current === 'string' && typeof condition.value === 'string' && current.includes(condition.value);
    case 'gt': return typeof current === 'number' && typeof condition.value === 'number' && current > condition.value;
    case 'lt': return typeof current === 'number' && typeof condition.value === 'number' && current < condition.value;
    case 'exists': return current !== undefined && current !== null;
    case 'not_exists': return current === undefined || current === null;
    default: return false;
  }
}

// ─── TRIGGER MATCHING ──────────────────────────────────────────────────────

function matchesTrigger(
  ruleTrigger: { event: string; filters?: Record<string, unknown> },
  event: AutomationEvent,
): boolean {
  // Event name must match exactly
  if (ruleTrigger.event !== event.event) return false;

  // Check optional filters (shallow equality on payload fields)
  if (ruleTrigger.filters) {
    for (const [key, expected] of Object.entries(ruleTrigger.filters)) {
      if (event.payload[key] !== expected) return false;
    }
  }

  return true;
}

// ─── ACTION EXECUTION ──────────────────────────────────────────────────────

async function executeAction(
  action: AutomationAction,
  clientId: number,
  userId: number,
  payload: Record<string, unknown>,
): Promise<{ tool: string; params: Record<string, unknown>; result: unknown; error?: string }> {
  const resolvedParams = resolveTemplate(action.params, payload) as Record<string, unknown>;

  // Handle delayed actions
  if (action.delay && action.delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, action.delay! * 1000));
  }

  // ── Plugin-registry bridge ────────────────────────────────────────────────
  // `run_plugin_script` is a generic automation primitive: enqueue a run for
  // a script declared in a registered plugin's manifest. Params:
  //   { pluginSlug: string, scriptId: string, args?: Record<string, unknown> }
  // The drain cron then dispatches the run to the plugin host via the
  // existing system-JWT chain; the plugin's worker reports completion back
  // through /api/plugin-callback/<slug>/scripts/runs/:id/complete.
  //
  // This branch lives here (vs. as a portal-tool) so we don't pollute the
  // AI tool registry with a name that's only meant for automation glue.
  if (action.tool === 'run_plugin_script') {
    try {
      const result = await runPluginScriptAction(clientId, resolvedParams);
      return { tool: action.tool, params: resolvedParams, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { tool: action.tool, params: resolvedParams, result: null, error };
    }
  }

  try {
    const result = await executePortalTool(action.tool, resolvedParams, clientId, userId);
    return { tool: action.tool, params: resolvedParams, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { tool: action.tool, params: resolvedParams, result: null, error };
  }
}

/**
 * Enqueue a registered_app_runs row for the given (pluginSlug, scriptId)
 * pair. The plugin must be `status='active'` AND the client must be
 * entitled (allowlist | entitled | global per visibility) — same checks
 * the user-facing iframe path uses. The drain cron picks up the queued
 * row within ~60s and dispatches it to the plugin host.
 */
async function runPluginScriptAction(
  clientId: number,
  params: Record<string, unknown>,
): Promise<{ runId: number; pluginSlug: string; scriptId: string }> {
  const pluginSlug = typeof params.pluginSlug === 'string' ? params.pluginSlug : '';
  const scriptId = typeof params.scriptId === 'string' ? params.scriptId : '';
  const args = (params.args && typeof params.args === 'object' && !Array.isArray(params.args))
    ? (params.args as Record<string, unknown>)
    : {};

  if (!pluginSlug) {
    throw new Error("run_plugin_script: missing 'pluginSlug' param");
  }
  if (!scriptId) {
    throw new Error("run_plugin_script: missing 'scriptId' param");
  }

  // Dynamic import keeps the automation engine module-load surface narrow.
  const { findActivePluginBySlug, isClientEntitledToApp } = await import('@/lib/plugins/entitlement');
  const { enqueueRun } = await import('@/lib/plugins/handlers/postcaptain-tools/runner');

  const app = await findActivePluginBySlug(pluginSlug);
  if (!app) {
    throw new Error(`run_plugin_script: no active plugin '${pluginSlug}'`);
  }
  const entitled = await isClientEntitledToApp(clientId, app);
  if (!entitled) {
    throw new Error(
      `run_plugin_script: client ${clientId} not entitled to '${pluginSlug}'`,
    );
  }

  const { runId } = await enqueueRun({
    app,
    client: { id: clientId },
    // `kind` is the plugin-declared script id. RunKind is intentionally
    // widened with `(string & {})` so we don't need a cast — the plugin's
    // worker-side dispatch-router validates the kind against its SCRIPTS
    // registry on the way out.
    kind: scriptId,
    args,
  });
  return { runId, pluginSlug, scriptId };
}

// ─── PER-RULE EXECUTION ────────────────────────────────────────────────────

/**
 * Execute a single rule: evaluate `conditions` against `payload`, run actions
 * (with template var resolution), log the result, bump rule stats.
 *
 * Trigger-matching is a CALLER concern — both the event-driven path (which
 * matches the rule's trigger.event against the emitted event) and the
 * scheduler path (which short-circuits all event matching) end up calling
 * `runRule`. Conditions ARE still evaluated here so the two paths share that
 * logic; a scheduled rule with conditions that don't match `payload` will
 * still log nothing (no run happened).
 *
 * `payload` for the event-driven path is the event payload that would have
 * been passed to the action templates. For scheduled rules it's
 * `{ ruleId, firedAt: <iso> }` — see process-scheduled-automations.
 *
 * `triggerLabel` is what gets written to `automation_logs.trigger_event` so
 * the activity log can distinguish event firings from scheduled ones (e.g.
 * `'automation.scheduled'`).
 */
export async function runRule(
  rule: AutomationRule,
  payload: Record<string, unknown>,
  triggerLabel: string,
): Promise<void> {
  // Conditions are caller-shared: both event and scheduled paths gate on them.
  const conditions = (rule.conditions || []) as AutomationCondition[];
  if (conditions.length > 0) {
    const allPass = conditions.every((c) => evaluateCondition(c, payload));
    if (!allPass) return;
  }

  const startTime = Date.now();
  const actions = rule.actions as AutomationAction[];
  // Resolve userId for portal-tool calls. Scheduled rules don't have a
  // user context, so we fall back to the rule's creator if present, else 0
  // (executePortalTool treats 0/undefined as "system"). The event-driven
  // path used to pass event.userId directly; scheduled paths can't.
  const userId = (payload._userId as number | undefined) ?? rule.createdBy ?? 0;
  const results: { tool: string; params: Record<string, unknown>; result: unknown; error?: string }[] = [];
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errorMessage: string | undefined;

  for (const action of actions) {
    const result = await executeAction(action, rule.clientId, userId, payload);
    results.push(result);
    if (result.error) {
      status = results.some((r) => !r.error) ? 'partial' : 'failed';
      errorMessage = result.error;
    }
  }

  const duration = Date.now() - startTime;

  await db.insert(automationLogs).values({
    clientId: rule.clientId,
    ruleId: rule.id,
    triggerEvent: triggerLabel,
    triggerPayload: payload,
    actionsExecuted: results,
    status,
    duration,
    errorMessage,
  });

  await db.update(automationRules)
    .set({
      executionCount: sql`${automationRules.executionCount} + 1`,
      lastExecutedAt: new Date(),
    })
    .where(eq(automationRules.id, rule.id));
}

// ─── MAIN ENGINE (EVENT PATH) ──────────────────────────────────────────────

async function processEvent(event: AutomationEvent): Promise<void> {
  // Fetch all enabled rules for this client
  const rules = await db.select()
    .from(automationRules)
    .where(and(
      eq(automationRules.clientId, event.clientId),
      eq(automationRules.enabled, true),
    ));

  for (const rule of rules) {
    // Scheduled rules don't participate in the event-driven path.
    if (rule.schedule != null) continue;

    // Check trigger match (event-driven only)
    if (!matchesTrigger(rule.trigger, event)) continue;

    // Pass the event's userId through so action template resolution can use it.
    const payload = { ...event.payload, _userId: event.userId };
    await runRule(rule, payload, event.event);
  }
}

// ─── INITIALIZATION ────────────────────────────────────────────────────────

let initialized = false;

/**
 * Register the automation engine with the event bus.
 * Safe to call multiple times — only registers once.
 */
export function initAutomationEngine(): void {
  if (initialized) return;
  initialized = true;
  onEvent(processEvent);
  console.log('[automation] Engine initialized');
}
