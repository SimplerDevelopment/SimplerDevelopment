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
  event: AutomationEvent,
): Promise<{ tool: string; params: Record<string, unknown>; result: unknown; error?: string }> {
  const resolvedParams = resolveTemplate(action.params, event.payload) as Record<string, unknown>;

  // Handle delayed actions
  if (action.delay && action.delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, action.delay! * 1000));
  }

  try {
    const result = await executePortalTool(action.tool, resolvedParams, event.clientId, event.userId);
    return { tool: action.tool, params: resolvedParams, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { tool: action.tool, params: resolvedParams, result: null, error };
  }
}

// ─── MAIN ENGINE ───────────────────────────────────────────────────────────

async function processEvent(event: AutomationEvent): Promise<void> {
  // Fetch all enabled rules for this client
  const rules = await db.select()
    .from(automationRules)
    .where(and(
      eq(automationRules.clientId, event.clientId),
      eq(automationRules.enabled, true),
    ));

  for (const rule of rules) {
    // Check trigger match
    if (!matchesTrigger(rule.trigger, event)) continue;

    // Check conditions (all must pass)
    const conditions = (rule.conditions || []) as AutomationCondition[];
    if (conditions.length > 0) {
      const allPass = conditions.every((c) => evaluateCondition(c, event.payload));
      if (!allPass) continue;
    }

    // Execute actions sequentially
    const startTime = Date.now();
    const actions = rule.actions as AutomationAction[];
    const results: { tool: string; params: Record<string, unknown>; result: unknown; error?: string }[] = [];
    let status: 'success' | 'partial' | 'failed' = 'success';
    let errorMessage: string | undefined;

    for (const action of actions) {
      const result = await executeAction(action, event);
      results.push(result);
      if (result.error) {
        status = results.some((r) => !r.error) ? 'partial' : 'failed';
        errorMessage = result.error;
      }
    }

    const duration = Date.now() - startTime;

    // Log execution
    await db.insert(automationLogs).values({
      clientId: event.clientId,
      ruleId: rule.id,
      triggerEvent: event.event,
      triggerPayload: event.payload,
      actionsExecuted: results,
      status,
      duration,
      errorMessage,
    });

    // Update rule stats
    await db.update(automationRules)
      .set({
        executionCount: sql`${automationRules.executionCount} + 1`,
        lastExecutedAt: new Date(),
      })
      .where(eq(automationRules.id, rule.id));
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
