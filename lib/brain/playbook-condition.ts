/**
 * Brain playbook condition evaluator.
 *
 * Pure function — given a condition expression (the JSON shape stored on
 * `brain_playbook_steps.condition`) and a run context, return a boolean.
 *
 * Condition shape:
 *   { field: 'person.title', op: 'eq', value: 'engineer' }
 *   null  ⇒ unconditional (always pass)
 *
 * Operators:
 *   eq         — strict-deep equality
 *   neq        — strict-deep inequality
 *   in         — value must be an array; left side must be a member
 *   not_in     — value must be an array; left side must NOT be a member
 *   exists     — left side is defined + truthy
 *   not_exists — left side is undefined / null / falsy
 *   gt         — numeric comparison (both sides coerced to Number)
 *   lt         — numeric comparison (both sides coerced to Number)
 *
 * Throws if `op` is unknown. NaN comparisons always return false (gt/lt).
 *
 * Dotted-path resolution walks JSON objects — missing intermediate keys
 * resolve to `undefined`. Array indexing via numeric segments is supported
 * (`tags.0`).
 *
 * Phase 6 (Wave 2b). See .planning/brain-playbooks/PLAN.md.
 */

export type PlaybookConditionOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'gt'
  | 'lt';

export interface PlaybookCondition {
  field: string;
  op: PlaybookConditionOp;
  value?: unknown;
}

/** Walk `obj` via a dotted path. Returns undefined if any segment is missing. */
export function resolvePath(obj: unknown, path: string): unknown {
  if (path === '' || path == null) return undefined;
  const segments = path.split('.');
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

function coerceNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return n;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return NaN;
}

/**
 * Evaluate a condition against a context. `null` condition is unconditional —
 * always returns true.
 */
export function evaluateCondition(
  condition: PlaybookCondition | null | undefined,
  context: Record<string, unknown>,
): boolean {
  if (condition == null) return true;
  if (typeof condition !== 'object') {
    throw new Error('evaluateCondition: condition must be an object or null');
  }
  const { field, op, value } = condition;
  if (typeof field !== 'string') {
    throw new Error('evaluateCondition: condition.field must be a string');
  }
  const left = resolvePath(context, field);

  switch (op) {
    case 'eq':
      return deepEqual(left, value);
    case 'neq':
      return !deepEqual(left, value);
    case 'in': {
      if (!Array.isArray(value)) {
        throw new Error("evaluateCondition: 'in' requires value to be an array");
      }
      return value.some((v) => deepEqual(left, v));
    }
    case 'not_in': {
      if (!Array.isArray(value)) {
        throw new Error("evaluateCondition: 'not_in' requires value to be an array");
      }
      return !value.some((v) => deepEqual(left, v));
    }
    case 'exists':
      return left !== undefined && left !== null && left !== false && left !== '';
    case 'not_exists':
      return left === undefined || left === null || left === false || left === '';
    case 'gt': {
      const l = coerceNumber(left);
      const r = coerceNumber(value);
      if (Number.isNaN(l) || Number.isNaN(r)) return false;
      return l > r;
    }
    case 'lt': {
      const l = coerceNumber(left);
      const r = coerceNumber(value);
      if (Number.isNaN(l) || Number.isNaN(r)) return false;
      return l < r;
    }
    default: {
      const exhaustive: never = op as never;
      throw new Error(`evaluateCondition: unknown op '${String(exhaustive)}'`);
    }
  }
}
