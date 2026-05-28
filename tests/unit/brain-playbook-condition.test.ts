// @vitest-environment node
/**
 * Pure-function unit tests for lib/brain/playbook-condition.
 *
 * Covers all seven supported operators plus null/undefined conditions,
 * dotted-path resolution, missing fields, and unknown-op throw.
 */
import { describe, it, expect } from 'vitest';
import { evaluateCondition, resolvePath } from '@/lib/brain/playbook-condition';

const CTX = {
  person: { fullName: 'Jane Doe', title: 'engineer', age: 30, active: true },
  tags: ['eng', 'remote'],
  count: 5,
  empty: '',
  zero: 0,
  nothing: null,
};

describe('resolvePath', () => {
  it('walks dotted paths', () => {
    expect(resolvePath(CTX, 'person.fullName')).toBe('Jane Doe');
    expect(resolvePath(CTX, 'person.title')).toBe('engineer');
  });

  it('returns undefined for missing segments', () => {
    expect(resolvePath(CTX, 'person.missing')).toBeUndefined();
    expect(resolvePath(CTX, 'absent.deep.path')).toBeUndefined();
  });

  it('returns undefined for empty/null input', () => {
    expect(resolvePath(CTX, '')).toBeUndefined();
    expect(resolvePath(null, 'x')).toBeUndefined();
    expect(resolvePath(undefined, 'x')).toBeUndefined();
  });

  it('handles top-level scalars', () => {
    expect(resolvePath(CTX, 'count')).toBe(5);
    expect(resolvePath(CTX, 'empty')).toBe('');
    expect(resolvePath(CTX, 'nothing')).toBeNull();
  });
});

describe('evaluateCondition — null / unconditional', () => {
  it('returns true when condition is null', () => {
    expect(evaluateCondition(null, CTX)).toBe(true);
  });
  it('returns true when condition is undefined', () => {
    expect(evaluateCondition(undefined, CTX)).toBe(true);
  });
});

describe('evaluateCondition — eq / neq', () => {
  it('eq matches on simple field', () => {
    expect(evaluateCondition({ field: 'person.title', op: 'eq', value: 'engineer' }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'person.title', op: 'eq', value: 'designer' }, CTX)).toBe(false);
  });
  it('neq is the inverse of eq', () => {
    expect(evaluateCondition({ field: 'person.title', op: 'neq', value: 'designer' }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'person.title', op: 'neq', value: 'engineer' }, CTX)).toBe(false);
  });
  it('eq against missing field — false unless value is also undefined', () => {
    expect(evaluateCondition({ field: 'person.missing', op: 'eq', value: 'x' }, CTX)).toBe(false);
    expect(evaluateCondition({ field: 'person.missing', op: 'eq', value: undefined }, CTX)).toBe(true);
  });
});

describe('evaluateCondition — in / not_in', () => {
  it("'in' returns true when left side is in the value array", () => {
    expect(evaluateCondition({ field: 'person.title', op: 'in', value: ['engineer', 'designer'] }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'person.title', op: 'in', value: ['designer'] }, CTX)).toBe(false);
  });
  it("'not_in' is the inverse of 'in'", () => {
    expect(evaluateCondition({ field: 'person.title', op: 'not_in', value: ['designer'] }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'person.title', op: 'not_in', value: ['engineer'] }, CTX)).toBe(false);
  });
  it("throws when 'in' value is not an array", () => {
    expect(() => evaluateCondition({ field: 'person.title', op: 'in', value: 'engineer' }, CTX)).toThrow(/array/);
  });
  it("throws when 'not_in' value is not an array", () => {
    expect(() => evaluateCondition({ field: 'person.title', op: 'not_in', value: 5 }, CTX)).toThrow(/array/);
  });
});

describe('evaluateCondition — exists / not_exists', () => {
  it("'exists' returns true for present truthy values", () => {
    expect(evaluateCondition({ field: 'person.fullName', op: 'exists' }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'person.active', op: 'exists' }, CTX)).toBe(true);
  });
  it("'exists' returns false for missing / null / false / empty string", () => {
    expect(evaluateCondition({ field: 'person.missing', op: 'exists' }, CTX)).toBe(false);
    expect(evaluateCondition({ field: 'nothing', op: 'exists' }, CTX)).toBe(false);
    expect(evaluateCondition({ field: 'empty', op: 'exists' }, CTX)).toBe(false);
  });
  it("'not_exists' is the inverse", () => {
    expect(evaluateCondition({ field: 'person.missing', op: 'not_exists' }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'nothing', op: 'not_exists' }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'person.fullName', op: 'not_exists' }, CTX)).toBe(false);
  });
});

describe('evaluateCondition — gt / lt (numeric)', () => {
  it("'gt' compares numerically", () => {
    expect(evaluateCondition({ field: 'count', op: 'gt', value: 3 }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'count', op: 'gt', value: 5 }, CTX)).toBe(false);
    expect(evaluateCondition({ field: 'count', op: 'gt', value: 10 }, CTX)).toBe(false);
  });
  it("'lt' compares numerically", () => {
    expect(evaluateCondition({ field: 'count', op: 'lt', value: 10 }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'count', op: 'lt', value: 5 }, CTX)).toBe(false);
  });
  it('coerces string numerics', () => {
    expect(evaluateCondition({ field: 'person.age', op: 'gt', value: '25' }, { ...CTX, person: { ...CTX.person } })).toBe(true);
  });
  it('returns false when left or right is not numeric', () => {
    expect(evaluateCondition({ field: 'person.fullName', op: 'gt', value: 1 }, CTX)).toBe(false);
    expect(evaluateCondition({ field: 'count', op: 'gt', value: 'banana' }, CTX)).toBe(false);
  });
});

describe('evaluateCondition — error cases', () => {
  it('throws on unknown op', () => {
    // @ts-expect-error — feeding a bogus op intentionally
    expect(() => evaluateCondition({ field: 'x', op: 'xor', value: 1 }, CTX)).toThrow(/unknown op/);
  });
  it('throws when field is not a string', () => {
    // @ts-expect-error — feeding a bogus field intentionally
    expect(() => evaluateCondition({ field: 42, op: 'eq', value: 'x' }, CTX)).toThrow(/field/);
  });
});

describe('evaluateCondition — deep equality', () => {
  it('eq compares arrays element-wise', () => {
    expect(evaluateCondition({ field: 'tags', op: 'eq', value: ['eng', 'remote'] }, CTX)).toBe(true);
    expect(evaluateCondition({ field: 'tags', op: 'eq', value: ['eng'] }, CTX)).toBe(false);
  });
  it('eq compares objects shallowly via recursion', () => {
    expect(evaluateCondition(
      { field: 'person', op: 'eq', value: { fullName: 'Jane Doe', title: 'engineer', age: 30, active: true } },
      CTX,
    )).toBe(true);
  });
});
