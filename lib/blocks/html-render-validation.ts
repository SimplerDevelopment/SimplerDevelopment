/**
 * Pure helpers for the right-panel form. Two responsibilities:
 *
 *   1. `validateField(field, value)` — returns an error string or null.
 *      Rules: required, minLength, maxLength, pattern. Plain values only —
 *      composite values (groups, arrays) are validated by recursing on each
 *      sub-field at the call site.
 *
 *   2. `isFieldVisible(field, values)` — evaluates the field's conditional
 *      logic against the current value bag. Fields with no `conditional`
 *      are always visible.
 *
 * Both are pure so they can be unit-tested and called from anywhere (panel,
 * inline iframe edit, future server-side enforcement, etc.).
 */

import type { HtmlRenderField } from '@/types/blocks';

type ScalarValue = string;
type ArrayValue = Array<Record<string, string>>;
type GroupValue = Record<string, string>;
export type AnyValue = ScalarValue | ArrayValue | GroupValue | undefined;

export function validateField(field: HtmlRenderField, value: AnyValue): string | null {
  // Composite types — caller is expected to recurse into items/sub-fields.
  if (field.type === 'array' || field.type === 'group' || field.type === 'tab') {
    if (field.required && (!value || (Array.isArray(value) && value.length === 0))) {
      return field.errorMessage || `${field.label || field.name} is required`;
    }
    return null;
  }

  // Scalar — coerce to a string and apply rules
  const s = typeof value === 'string' ? value : '';

  if (field.required) {
    const isEmpty = !s.trim() || (field.type === 'richtext' && !s.replace(/<[^>]+>/g, '').trim());
    if (isEmpty) return field.errorMessage || `${field.label || field.name} is required`;
  }
  if (s) {
    if (typeof field.minLength === 'number' && s.length < field.minLength) {
      return field.errorMessage || `Must be at least ${field.minLength} characters`;
    }
    if (typeof field.maxLength === 'number' && s.length > field.maxLength) {
      return field.errorMessage || `Must be at most ${field.maxLength} characters`;
    }
    if (field.pattern) {
      try {
        const rx = new RegExp(field.pattern);
        if (!rx.test(s)) return field.errorMessage || 'Format is invalid';
      } catch {
        // Invalid regex in schema — silent fail rather than crash the form
      }
    }
    if (field.type === 'number') {
      const n = Number(s);
      if (Number.isNaN(n)) return field.errorMessage || 'Must be a number';
      if (typeof field.min === 'number' && n < field.min) return field.errorMessage || `Must be ≥ ${field.min}`;
      if (typeof field.max === 'number' && n > field.max) return field.errorMessage || `Must be ≤ ${field.max}`;
    }
  }
  return null;
}

export function isFieldVisible(field: HtmlRenderField, values: Record<string, AnyValue>): boolean {
  const c = field.conditional;
  if (!c) return true;
  const otherRaw = values[c.field];
  // Coerce other value to a comparable string for eq/neq/in/notIn.
  const other = typeof otherRaw === 'string' ? otherRaw : (otherRaw == null ? '' : '');
  switch (c.operator) {
    case 'truthy':
      return Boolean(other);
    case 'falsy':
      return !other;
    case 'eq':
      return other === (c.value ?? '');
    case 'neq':
      return other !== (c.value ?? '');
    case 'in': {
      const set = (c.value || '').split('|').map(s => s.trim()).filter(Boolean);
      return set.includes(other);
    }
    case 'notIn': {
      const set = (c.value || '').split('|').map(s => s.trim()).filter(Boolean);
      return !set.includes(other);
    }
    default:
      return true;
  }
}
