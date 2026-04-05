import { describe, it, expect } from 'vitest';
import { isFieldVisible, getConditionalOptions } from '@/lib/survey-logic';

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
