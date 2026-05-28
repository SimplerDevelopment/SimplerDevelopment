/**
 * Automation Rule Engine
 *
 * Matches incoming events against client rules,
 * evaluates conditions, and executes actions via portal tools.
 */

import { db } from '@/lib/db';
import { automationRules, automationLogs, brainPlaybooks } from '@/lib/db/schema';
import type { AutomationCondition, AutomationAction, BrainPlaybookLinkEntityType } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { onEvent, type AutomationEvent } from './event-bus';
import { executePortalTool } from '@/lib/ai/portal-tools';
import { startRun } from '@/lib/brain/playbook-runs';

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
  ruleCreatedBy: number | null,
): Promise<{ tool: string; params: Record<string, unknown>; result: unknown; error?: string }> {
  const resolvedParams = resolveTemplate(action.params, payload) as Record<string, unknown>;

  // Handle delayed actions
  if (action.delay && action.delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, action.delay! * 1000));
  }

  // ─── start_playbook bridge ───────────────────────────────────────────────
  // Special action that crosses into the Brain playbook engine. Lets a
  // one-shot automation kick off a multi-step playbook run, sharing the
  // event payload as the run context (so step configs can template against
  // `{{person.fullName}}` etc.).
  if (action.tool === 'start_playbook') {
    try {
      // playbookId may be passed as a number or a numeric string (the NLP
      // parser emits strings). Slug-based lookup is supported as a
      // fallback so NLP-authored rules don't require a DB round-trip at
      // parse time — we resolve at execution time instead.
      let playbookId: number | undefined;
      const idRaw = resolvedParams.playbookId;
      if (typeof idRaw === 'number') {
        playbookId = idRaw;
      } else if (typeof idRaw === 'string' && idRaw.trim() !== '' && !Number.isNaN(Number(idRaw))) {
        playbookId = Number(idRaw);
      }
      const slugRaw = resolvedParams.playbookSlug;
      if (playbookId == null && typeof slugRaw === 'string' && slugRaw.trim() !== '') {
        const [row] = await db.select({ id: brainPlaybooks.id }).from(brainPlaybooks)
          .where(and(
            eq(brainPlaybooks.clientId, clientId),
            eq(brainPlaybooks.slug, slugRaw.trim()),
          ))
          .limit(1);
        if (!row) {
          throw new Error(`Playbook with slug "${slugRaw}" not found for clientId=${clientId}`);
        }
        playbookId = row.id;
      }
      if (playbookId == null) {
        throw new Error('start_playbook: params.playbookId or params.playbookSlug is required');
      }

      const label = typeof resolvedParams.label === 'string' && resolvedParams.label.trim() !== ''
        ? resolvedParams.label
        : `Triggered by ${String(payload._event ?? 'automation')}`;
      const context = (resolvedParams.context && typeof resolvedParams.context === 'object'
        ? resolvedParams.context as Record<string, unknown>
        : payload);
      const links = Array.isArray(resolvedParams.links)
        ? (resolvedParams.links as unknown[]).flatMap((l): { entityType: BrainPlaybookLinkEntityType; entityId: number }[] => {
            if (!l || typeof l !== 'object') return [];
            const entityType = (l as Record<string, unknown>).entityType;
            const entityId = (l as Record<string, unknown>).entityId;
            if (typeof entityType !== 'string') return [];
            if (typeof entityId !== 'number') return [];
            return [{ entityType: entityType as BrainPlaybookLinkEntityType, entityId }];
          })
        : [];

      const actorId = ruleCreatedBy ?? (userId > 0 ? userId : null);
      const res = await startRun(clientId, actorId, {
        playbookId,
        label: String(label),
        context,
        triggerPayload: payload,
        links,
      });
      return { tool: action.tool, params: resolvedParams, result: res };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { tool: action.tool, params: resolvedParams, result: null, error };
    }
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
  // user context, and public events (e.g. anonymous survey submits) emit
  // userId=0 — neither is a real user we want stamped on a created row,
  // so we fall back to the rule's creator for attribution. Final fallback
  // is 0 (executePortalTool / handlers may then choose to coalesce to null).
  const explicitUid = payload._userId as number | undefined;
  const userId = (typeof explicitUid === 'number' && explicitUid > 0)
    ? explicitUid
    : (rule.createdBy ?? 0);
  const results: { tool: string; params: Record<string, unknown>; result: unknown; error?: string }[] = [];
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errorMessage: string | undefined;

  for (const action of actions) {
    const result = await executeAction(action, rule.clientId, userId, payload, rule.createdBy ?? null);
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
    // `_event` is also threaded through so start_playbook can synthesize a
    // default label without re-plumbing the trigger event name.
    const payload = { ...event.payload, _userId: event.userId, _event: event.event };
    await runRule(rule, payload, event.event);
  }
}

// ─── EVENT-DRIVEN PLAYBOOK AUTO-START ──────────────────────────────────────

/**
 * In-process de-dup set for playbook auto-starts. Keyed by
 * `playbookId:event:bucket` where bucket = floor(timestampMs / 5000). A
 * webhook retry hitting the same event twice inside the same 5-second window
 * therefore collapses to a single auto-start. The set is cleared lazily — we
 * only keep at most ~1024 entries.
 *
 * Note: in-process means this is best-effort dedup — a multi-instance deploy
 * will lose the guarantee across instances. The trade-off is "no extra
 * infra"; if that ever bites, promote this to a Redis SET with PX expiration.
 */
const recentAutoStarts = new Set<string>();

function rememberAutoStart(key: string): boolean {
  if (recentAutoStarts.has(key)) return false;
  recentAutoStarts.add(key);
  if (recentAutoStarts.size > 1024) {
    // Cheap eviction — drop the first 256 entries (iteration order = insertion order).
    let dropped = 0;
    for (const k of recentAutoStarts) {
      if (dropped >= 256) break;
      recentAutoStarts.delete(k);
      dropped++;
    }
  }
  return true;
}

// Exposed for tests; production callers should never need this.
export function __resetPlaybookAutoStartDedup(): void {
  recentAutoStarts.clear();
}

/**
 * Event-bus handler that auto-starts any `triggerKind='event'` playbook whose
 * `triggerConfig.event` matches the emitted event name. Tenancy-scoped on
 * `clientId`; filters by `status='active'`. The `triggerConfig.filters`
 * object, if present, is checked shallowly against the event payload — same
 * semantics as `automation_rules.trigger.filters`.
 *
 * De-duplicates within a 5-second window per `(playbookId, event)` to absorb
 * webhook retries.
 *
 * Opt-out: `triggerConfig.disableAutoStart === true` skips the auto-start —
 * lets a playbook stay event-typed (so the UI shows the binding) while
 * temporarily requiring manual trigger.
 */
async function processEventForPlaybookAutoStart(event: AutomationEvent): Promise<void> {
  const matches = await db.select({
    id: brainPlaybooks.id,
    name: brainPlaybooks.name,
    triggerConfig: brainPlaybooks.triggerConfig,
    createdBy: brainPlaybooks.createdBy,
  }).from(brainPlaybooks)
    .where(and(
      eq(brainPlaybooks.clientId, event.clientId),
      eq(brainPlaybooks.status, 'active'),
      eq(brainPlaybooks.triggerKind, 'event'),
    ));

  for (const pb of matches) {
    const cfg = pb.triggerConfig ?? null;
    if (!cfg || cfg.event !== event.event) continue;
    if ((cfg as { disableAutoStart?: boolean }).disableAutoStart === true) continue;

    // Shallow payload filter, same shape as automation_rules.trigger.filters.
    if (cfg.filters && typeof cfg.filters === 'object') {
      let allMatch = true;
      for (const [key, expected] of Object.entries(cfg.filters)) {
        if (event.payload[key] !== expected) { allMatch = false; break; }
      }
      if (!allMatch) continue;
    }

    const bucket = Math.floor(event.timestamp.getTime() / 5000);
    const dedupKey = `${pb.id}:${event.event}:${bucket}`;
    if (!rememberAutoStart(dedupKey)) continue;

    try {
      const actorId = pb.createdBy ?? (event.userId > 0 ? event.userId : null);
      await startRun(event.clientId, actorId, {
        playbookId: pb.id,
        label: `Auto-started by ${event.event}`,
        context: event.payload,
        triggerPayload: event.payload,
      });
    } catch (err) {
      console.error('[automation] auto-start playbook failed', {
        playbookId: pb.id,
        event: event.event,
        err: err instanceof Error ? err.message : String(err),
      });
    }
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
  onEvent(processEventForPlaybookAutoStart);
  console.log('[automation] Engine initialized');
}

// Exposed for tests so we can drive the handler directly without spinning up
// the event-bus registration machinery.
export const __processEventForPlaybookAutoStart = processEventForPlaybookAutoStart;
