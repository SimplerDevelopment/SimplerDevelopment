import { describe, it, expect } from 'vitest';
import { isFieldVisible, getConditionalOptions, resolvePiping } from '@/lib/survey-logic';

describe('isFieldVisible', () => {
  it('returns true when field has no showIf condition', () => {
    expect(isFieldVisible({ showIf: undefined }, {})).toBe(true);
  });

  it('returns false when dependency field has no answer (undefined)', () => {
    expect(isFieldVisible({ showIf: { fieldId: 'q1', values: ['yes'] } }, {})).toBe(false);
  });

  it('returns false when dependency field answer is null', () => {
    expect(isFieldVisible({ showIf: { fieldId: 'q1', values: ['yes'] } }, { q1: null })).toBe(false);
  });

  it('returns true when answer matches one of the values in the values array', () => {
    expect(isFieldVisible({ showIf: { fieldId: 'q1', values: ['yes', 'maybe'] } }, { q1: 'yes' })).toBe(true);
  });

  it('returns false when answer does not match any value in values array', () => {
    expect(isFieldVisible({ showIf: { fieldId: 'q1', values: ['yes'] } }, { q1: 'no' })).toBe(false);
  });

  it('coerces answer to string before comparison (number 5 matches string "5")', () => {
    expect(isFieldVisible({ showIf: { fieldId: 'q1', values: ['5'] } }, { q1: 5 })).toBe(true);
  });
});

describe('getConditionalOptions', () => {
  it('returns field.options when no conditionalOptions defined', () => {
    const field = { options: ['A', 'B'], conditionalOptions: undefined };
    expect(getConditionalOptions(field, {})).toEqual(['A', 'B']);
  });

  it('returns mapped options when dependency answer matches a key in the map', () => {
    const field = {
      options: ['A', 'B'],
      conditionalOptions: { fieldId: 'q1', map: { 'cat': ['Tabby', 'Siamese'] }, default: ['Dog'] },
    };
    expect(getConditionalOptions(field, { q1: 'cat' })).toEqual(['Tabby', 'Siamese']);
  });

  it('returns conditionalOptions.default when answer matches no map key and default exists', () => {
    const field = {
      options: ['A', 'B'],
      conditionalOptions: { fieldId: 'q1', map: { 'cat': ['Tabby'] }, default: ['Other'] },
    };
    expect(getConditionalOptions(field, { q1: 'fish' })).toEqual(['Other']);
  });

  it('returns field.options when answer matches no map key and no default exists', () => {
    const field = {
      options: ['A', 'B'],
      conditionalOptions: { fieldId: 'q1', map: { 'cat': ['Tabby'] } },
    };
    expect(getConditionalOptions(field, { q1: 'fish' })).toEqual(['A', 'B']);
  });
});

describe('isFieldVisible — compound conditions', () => {
  it('returns true for legacy shape when answer matches (backward compat)', () => {
    expect(isFieldVisible({ showIf: { fieldId: 'q1', values: ['yes'] } }, { q1: 'yes' })).toBe(true);
  });

  it('returns true for compound AND when BOTH rules match', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [
        { fieldId: 'q1', operator: 'equals' as const, values: ['yes'] },
        { fieldId: 'q2', operator: 'equals' as const, values: ['blue'] },
      ],
    };
    expect(isFieldVisible({ showIf }, { q1: 'yes', q2: 'blue' })).toBe(true);
  });

  it('returns false for compound AND when only one rule matches', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [
        { fieldId: 'q1', operator: 'equals' as const, values: ['yes'] },
        { fieldId: 'q2', operator: 'equals' as const, values: ['blue'] },
      ],
    };
    expect(isFieldVisible({ showIf }, { q1: 'yes', q2: 'red' })).toBe(false);
  });

  it('returns false for compound AND when dependency answer is undefined', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [
        { fieldId: 'q1', operator: 'equals' as const, values: ['yes'] },
      ],
    };
    expect(isFieldVisible({ showIf }, {})).toBe(false);
  });

  it('evaluates not_equals operator — returns true when answer is NOT in values', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [
        { fieldId: 'q1', operator: 'not_equals' as const, values: ['no'] },
      ],
    };
    expect(isFieldVisible({ showIf }, { q1: 'yes' })).toBe(true);
  });

  it('evaluates not_equals operator — returns false when answer IS in values', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [
        { fieldId: 'q1', operator: 'not_equals' as const, values: ['no'] },
      ],
    };
    expect(isFieldVisible({ showIf }, { q1: 'no' })).toBe(false);
  });

  it('works with single-rule compound shape', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [
        { fieldId: 'q1', operator: 'equals' as const, values: ['yes'] },
      ],
    };
    expect(isFieldVisible({ showIf }, { q1: 'yes' })).toBe(true);
  });
});

describe('isFieldVisible — extended operators', () => {
  it('contains: matches substring case-insensitively', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [{ fieldId: 'q1', operator: 'contains' as const, values: ['Acme'] }],
    };
    expect(isFieldVisible({ showIf }, { q1: 'hello acme corp' })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: 'nothing here' })).toBe(false);
  });

  it('contains: matches if ANY value is a substring', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [{ fieldId: 'q1', operator: 'contains' as const, values: ['cat', 'dog'] }],
    };
    expect(isFieldVisible({ showIf }, { q1: 'I love dogs' })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: 'I love birds' })).toBe(false);
  });

  it('not_contains: true when answer is undefined (negative satisfies)', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [{ fieldId: 'q1', operator: 'not_contains' as const, values: ['foo'] }],
    };
    expect(isFieldVisible({ showIf }, {})).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: 'foo bar' })).toBe(false);
    expect(isFieldVisible({ showIf }, { q1: 'baz' })).toBe(true);
  });

  it('greater_than: numeric compare', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [{ fieldId: 'q1', operator: 'greater_than' as const, values: ['10'] }],
    };
    expect(isFieldVisible({ showIf }, { q1: 11 })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: '11' })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: 10 })).toBe(false);
    expect(isFieldVisible({ showIf }, { q1: 'not-a-number' })).toBe(false);
    expect(isFieldVisible({ showIf }, {})).toBe(false);
  });

  it('less_than: numeric compare', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [{ fieldId: 'q1', operator: 'less_than' as const, values: ['5'] }],
    };
    expect(isFieldVisible({ showIf }, { q1: 4 })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: 5 })).toBe(false);
  });

  it('is_empty: true for undefined / null / empty string / empty array', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [{ fieldId: 'q1', operator: 'is_empty' as const, values: [] }],
    };
    expect(isFieldVisible({ showIf }, {})).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: null })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: '' })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: '   ' })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: [] })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: 'hi' })).toBe(false);
    expect(isFieldVisible({ showIf }, { q1: 0 })).toBe(false);
  });

  it('is_not_empty: inverse of is_empty', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [{ fieldId: 'q1', operator: 'is_not_empty' as const, values: [] }],
    };
    expect(isFieldVisible({ showIf }, { q1: 'hi' })).toBe(true);
    expect(isFieldVisible({ showIf }, {})).toBe(false);
  });

  it('combines extended operators with equals under AND', () => {
    const showIf = {
      combinator: 'AND' as const,
      rules: [
        { fieldId: 'q1', operator: 'equals' as const, values: ['yes'] },
        { fieldId: 'q2', operator: 'greater_than' as const, values: ['100'] },
      ],
    };
    expect(isFieldVisible({ showIf }, { q1: 'yes', q2: 200 })).toBe(true);
    expect(isFieldVisible({ showIf }, { q1: 'yes', q2: 50 })).toBe(false);
    expect(isFieldVisible({ showIf }, { q1: 'no', q2: 200 })).toBe(false);
  });
});

describe('resolvePiping', () => {
  it('replaces {fieldId} token with the answer value', () => {
    expect(resolvePiping('You said {abc123}', { abc123: 'hello' })).toBe('You said hello');
  });

  it('renders empty string for unanswered token per D-10', () => {
    expect(resolvePiping('You said {abc123}', {})).toBe('You said ');
  });

  it('returns original string unchanged when no tokens present', () => {
    expect(resolvePiping('No tokens here', { abc123: 'hello' })).toBe('No tokens here');
  });

  it('handles multiple tokens in one string', () => {
    expect(resolvePiping('Hello {firstName}, you chose {color}', { firstName: 'Alice', color: 'blue' })).toBe('Hello Alice, you chose blue');
  });

  it('handles null answer as empty string', () => {
    expect(resolvePiping('You said {abc123}', { abc123: null })).toBe('You said ');
  });

  it('handles undefined answer as empty string', () => {
    expect(resolvePiping('You said {abc123}', { abc123: undefined })).toBe('You said ');
  });
});
