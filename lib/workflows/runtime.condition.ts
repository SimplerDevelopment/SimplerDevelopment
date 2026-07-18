// Condition-expression evaluation for the workflow runtime. Split out of
// runtime.ts — pure, side-effect-free, and self-contained (no DB/IO deps).

import type { WorkflowRunContext } from './types';

/**
 * Evaluate a workflow condition expression against the run context.
 *
 * Resolution priority:
 *
 * 1. **Explicit override map** — if `context.conditions` contains the expression key,
 *    that boolean wins. This keeps the test-harness path and any caller-supplied
 *    explicit-branch overrides working unchanged.
 *
 * 2. **Real field-path evaluation** — parse the expression and walk the dotted
 *    field path (e.g. `contact.tag`, `deal.amount`) into the run context, then
 *    apply an operator comparison that mirrors `evaluateCondition()` in
 *    `lib/automation/engine.ts`:
 *
 *    - Simple path only (e.g. `"deal.stale"`): truthy-check the resolved value.
 *    - Path with operator (e.g. `"deal.amount gt 100"`): apply the operator.
 *      Supported operators: `eq` / `equals`, `neq` / `not_equals`, `contains`,
 *      `gt`, `lt`, `exists`, `not_exists`.
 *
 * **Safe default**: if the field path cannot be resolved (the value is
 * `undefined`) and no operator overrides that case, the function returns `false`
 * — i.e. the "false / no-branch" path is taken, not the permissive `true`.
 * This prevents accidental branch execution when the run context is sparse or
 * the expression references a field that wasn't populated by the trigger.
 */
export function evaluateWorkflowExpression(
  context: WorkflowRunContext,
  expression: string,
): boolean {
  // ── 1. Explicit override map (test harness / caller-controlled branches) ──
  const conditionsOverride = context.conditions;
  if (conditionsOverride && typeof conditionsOverride === 'object') {
    const map = conditionsOverride as Record<string, boolean>;
    if (expression in map) return Boolean(map[expression]);
  }

  // ── 2. Parse expression: "field" | "field operator value" ─────────────────
  const trimmed = expression.trim();
  const parts = trimmed.split(/\s+/);
  const field = parts[0];
  // No operator token → use 'truthy' semantics (truthy check of the value).
  const operator = parts.length >= 2 ? parts[1].toLowerCase() : 'truthy';
  const rawValue = parts.length >= 3 ? parts.slice(2).join(' ') : undefined;

  // Parse the comparison value: coerce to number or boolean when unambiguous.
  let comparisonValue: unknown = rawValue;
  if (rawValue !== undefined) {
    if (rawValue === 'true') comparisonValue = true;
    else if (rawValue === 'false') comparisonValue = false;
    else if (rawValue !== '' && !Number.isNaN(Number(rawValue))) comparisonValue = Number(rawValue);
  }

  // ── 3. Walk the dotted field path into the run context ────────────────────
  const fieldParts = field.split('.');
  let current: unknown = context;
  for (const part of fieldParts) {
    if (current == null || typeof current !== 'object') {
      current = undefined;
      break;
    }
    current = (current as Record<string, unknown>)[part];
  }

  // ── 4. Apply operator (mirrors engine.ts evaluateCondition semantics) ─────
  switch (operator) {
    // No operator: truthy check. Unresolved path (undefined) → false (safe default).
    case 'truthy':
      return current !== undefined && current !== null && Boolean(current);
    case 'exists':
      return current !== undefined && current !== null;
    case 'not_exists':
      return current === undefined || current === null;
    case 'eq':
    case 'equals':
      return current === comparisonValue;
    case 'neq':
    case 'not_equals':
      return current !== comparisonValue;
    case 'contains':
      return (
        typeof current === 'string' &&
        typeof comparisonValue === 'string' &&
        current.includes(comparisonValue)
      );
    case 'gt':
      return (
        typeof current === 'number' &&
        typeof comparisonValue === 'number' &&
        current > comparisonValue
      );
    case 'lt':
      return (
        typeof current === 'number' &&
        typeof comparisonValue === 'number' &&
        current < comparisonValue
      );
    default:
      // Unknown operator → safe false (no-branch).
      return false;
  }
}
