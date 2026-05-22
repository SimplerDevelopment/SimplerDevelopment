/**
 * Brain playbook templating engine.
 *
 * Pure functions — substitute `{{var.path}}` placeholders inside string
 * templates against a run context. Used by playbook step dispatchers to
 * render step configs (task titles, note bodies, etc.) just before the
 * side-effect runs.
 *
 * Conventions (intentional, called out in PLAN.md):
 *   - Missing paths render as empty string. (Different from the daily-notes
 *     `applyTemplate` engine which preserves literal `{{var}}` text — there
 *     the user might *want* the literal; here we treat missing context as
 *     a dispatcher problem the operator can spot in the UI.)
 *   - Resolved values are coerced to string via String(value). Objects fall
 *     back to JSON.stringify so a misuse like `{{person}}` doesn't render
 *     `[object Object]` for the human reading the kanban card.
 *   - No escaping. Templates are plain text — caller is responsible for any
 *     HTML/markdown safety.
 *
 * Phase 6 (Wave 2b). See .planning/brain-playbooks/PLAN.md.
 */

import { resolvePath } from './playbook-condition';

const VAR_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

function stringifyValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
    return String(v);
  }
  // Object / array — JSON.stringify as a last resort so we don't render
  // `[object Object]`. Errors (circular refs) degrade to empty string.
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

/**
 * Substitute `{{var.path}}` placeholders in a template string. Missing
 * paths render as empty string. Returns the template verbatim if there
 * are no placeholders.
 */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  if (typeof template !== 'string') return '';
  if (!template.includes('{{')) return template;
  return template.replace(VAR_PATTERN, (_full, name: string) => {
    const v = resolvePath(context, name);
    return stringifyValue(v);
  });
}

/**
 * Recursively render every string value inside `obj`. Non-string leaves are
 * left untouched. Arrays are walked element-by-element. Plain objects are
 * walked key-by-key.
 *
 * Used by step dispatchers to render an entire config block in one call:
 *
 *   const rendered = renderObject(step.config, run.context);
 *   await createTask({ title: rendered.title, ... });
 *
 * Keys are NOT templated. Only values.
 */
export function renderObject(
  obj: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = renderValue(v, context);
  }
  return out;
}

function renderValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') return renderTemplate(value, context);
  if (Array.isArray(value)) return value.map((item) => renderValue(item, context));
  if (value !== null && typeof value === 'object') {
    return renderObject(value as Record<string, unknown>, context);
  }
  return value;
}
