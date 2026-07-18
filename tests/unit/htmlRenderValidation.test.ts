import { describe, it, expect } from 'vitest';
import { validateField, isFieldVisible } from '@/lib/blocks/html-render-validation';
import type { HtmlRenderField } from '@/types/blocks';

describe('html-render validateField', () => {
  it('flags required scalar when empty / whitespace', () => {
    const f: HtmlRenderField = { name: 'title', type: 'text', required: true };
    expect(validateField(f, '')).toMatch(/required/i);
    expect(validateField(f, '   ')).toMatch(/required/i);
    expect(validateField(f, 'ok')).toBeNull();
  });

  it('treats empty richtext (only tags, no text) as empty for required', () => {
    const f: HtmlRenderField = { name: 'body', type: 'richtext', required: true };
    expect(validateField(f, '<p></p>')).toMatch(/required/i);
    expect(validateField(f, '<p>real</p>')).toBeNull();
  });

  it('uses errorMessage override when provided', () => {
    const f: HtmlRenderField = { name: 'title', type: 'text', required: true, errorMessage: 'Pick a name' };
    expect(validateField(f, '')).toBe('Pick a name');
  });

  it('enforces minLength / maxLength on text-shaped values', () => {
    const f: HtmlRenderField = { name: 'x', type: 'text', minLength: 3, maxLength: 5 };
    expect(validateField(f, 'ab')).toMatch(/at least 3/i);
    expect(validateField(f, 'abcdef')).toMatch(/at most 5/i);
    expect(validateField(f, 'abcd')).toBeNull();
  });

  it('skips length checks when value is empty (use required for that)', () => {
    const f: HtmlRenderField = { name: 'x', type: 'text', minLength: 3 };
    expect(validateField(f, '')).toBeNull();
  });

  it('honors regex pattern', () => {
    const f: HtmlRenderField = { name: 'slug', type: 'text', pattern: '^[a-z0-9-]+$' };
    expect(validateField(f, 'my-slug')).toBeNull();
    expect(validateField(f, 'Has Spaces')).toMatch(/format is invalid/i);
  });

  it('silently passes for an invalid regex in the schema', () => {
    const f: HtmlRenderField = { name: 'x', type: 'text', pattern: '[' /* unclosed class */ };
    expect(validateField(f, 'anything')).toBeNull();
  });

  it('validates number ranges', () => {
    const f: HtmlRenderField = { name: 'n', type: 'number', min: 1, max: 10 };
    expect(validateField(f, '0')).toMatch(/≥ 1/);
    expect(validateField(f, '11')).toMatch(/≤ 10/);
    expect(validateField(f, '5')).toBeNull();
    expect(validateField(f, 'not-a-number')).toMatch(/must be a number/i);
  });

  it('flags required array when empty / missing', () => {
    const f: HtmlRenderField = { name: 'items', type: 'array', required: true };
    expect(validateField(f, [])).toMatch(/required/i);
    expect(validateField(f, undefined)).toMatch(/required/i);
    expect(validateField(f, [{ x: '1' }])).toBeNull();
  });

  it('returns null for tab fields (purely organizational, no value)', () => {
    const f: HtmlRenderField = { name: 'tab1', type: 'tab' };
    expect(validateField(f, undefined)).toBeNull();
  });
});

describe('html-render isFieldVisible', () => {
  it('always visible when no conditional', () => {
    const f: HtmlRenderField = { name: 'x', type: 'text' };
    expect(isFieldVisible(f, {})).toBe(true);
  });

  it('truthy / falsy operators', () => {
    const f = (op: 'truthy' | 'falsy'): HtmlRenderField => ({
      name: 'x', type: 'text', conditional: { field: 'mode', operator: op },
    });
    expect(isFieldVisible(f('truthy'), { mode: 'on' })).toBe(true);
    expect(isFieldVisible(f('truthy'), { mode: '' })).toBe(false);
    expect(isFieldVisible(f('falsy'), { mode: '' })).toBe(true);
    expect(isFieldVisible(f('falsy'), { mode: 'on' })).toBe(false);
  });

  it('eq / neq compare against the literal value', () => {
    const eq: HtmlRenderField = {
      name: 'x', type: 'text', conditional: { field: 'mode', operator: 'eq', value: 'pro' },
    };
    expect(isFieldVisible(eq, { mode: 'pro' })).toBe(true);
    expect(isFieldVisible(eq, { mode: 'free' })).toBe(false);

    const neq: HtmlRenderField = {
      name: 'x', type: 'text', conditional: { field: 'mode', operator: 'neq', value: 'pro' },
    };
    expect(isFieldVisible(neq, { mode: 'pro' })).toBe(false);
    expect(isFieldVisible(neq, { mode: 'free' })).toBe(true);
  });

  it('in / notIn parse pipe-delimited values', () => {
    const inOp: HtmlRenderField = {
      name: 'x', type: 'text', conditional: { field: 'kind', operator: 'in', value: 'a|b|c' },
    };
    expect(isFieldVisible(inOp, { kind: 'b' })).toBe(true);
    expect(isFieldVisible(inOp, { kind: 'd' })).toBe(false);

    const notIn: HtmlRenderField = {
      name: 'x', type: 'text', conditional: { field: 'kind', operator: 'notIn', value: 'a|b|c' },
    };
    expect(isFieldVisible(notIn, { kind: 'd' })).toBe(true);
    expect(isFieldVisible(notIn, { kind: 'a' })).toBe(false);
  });

  it('non-string sibling values coerce to empty string for comparison', () => {
    // Array / object sibling values shouldn't crash the check; eq against
    // a configured value should fail because the coerced "" doesn't match.
    const f: HtmlRenderField = {
      name: 'x', type: 'text', conditional: { field: 'items', operator: 'eq', value: 'expected' },
    };
    expect(isFieldVisible(f, { items: [{ a: '1' }] })).toBe(false);
    expect(isFieldVisible(f, { items: { a: '1' } })).toBe(false);
    // truthy treats non-string-empty as falsy
    const t: HtmlRenderField = {
      name: 'x', type: 'text', conditional: { field: 'items', operator: 'truthy' },
    };
    expect(isFieldVisible(t, { items: [{ a: '1' }] })).toBe(false);
  });
});
