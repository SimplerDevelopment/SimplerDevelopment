// SCORE-01: tests for `computeSurveyScore`. Exercises every scoring shape
// plus the "no scoring rules anywhere" null-return case and a combined
// multi-field survey.

import { describe, it, expect } from 'vitest';
import { computeSurveyScore } from '@/lib/surveys/score';
import type { SurveyFieldDef } from '@/lib/db/schema/surveys';

function field(partial: Partial<SurveyFieldDef> & { id: string; type: SurveyFieldDef['type'] }): SurveyFieldDef {
  return {
    label: '',
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: 0,
    ...partial,
  };
}

describe('computeSurveyScore', () => {
  it('returns null when no field has a scoring rule', () => {
    const fields: SurveyFieldDef[] = [
      field({ id: 'q1', type: 'text' }),
      field({ id: 'q2', type: 'rating' }),
    ];
    expect(computeSurveyScore(fields, { q1: 'hi', q2: 5 })).toBeNull();
  });

  it('returns null for an empty field set', () => {
    expect(computeSurveyScore([], { q1: 5 })).toBeNull();
  });

  it('option_map: sums correctly for a single-value select/radio answer', () => {
    const fields: SurveyFieldDef[] = [
      field({
        id: 'q1',
        type: 'select',
        options: ['Low', 'Mid', 'High'],
        scoring: { type: 'option_map', options: { Low: 1, Mid: 3, High: 5 } },
      }),
    ];
    expect(computeSurveyScore(fields, { q1: 'High' })).toBe(5);
    expect(computeSurveyScore(fields, { q1: 'Mid' })).toBe(3);
  });

  it('option_map: sums correctly for a checkbox (multi-value) answer', () => {
    const fields: SurveyFieldDef[] = [
      field({
        id: 'q1',
        type: 'checkbox',
        options: ['A', 'B', 'C'],
        scoring: { type: 'option_map', options: { A: 2, B: 3, C: 5 } },
      }),
    ];
    expect(computeSurveyScore(fields, { q1: ['A', 'C'] })).toBe(7);
    expect(computeSurveyScore(fields, { q1: ['A', 'B', 'C'] })).toBe(10);
    expect(computeSurveyScore(fields, { q1: [] })).toBe(0);
  });

  it('option_map: returns 0 for unknown answer keys (single + multi)', () => {
    const fields: SurveyFieldDef[] = [
      field({
        id: 'q1',
        type: 'select',
        options: ['Yes', 'No'],
        scoring: { type: 'option_map', options: { Yes: 5, No: 0 } },
      }),
    ];
    // Unknown single-value
    expect(computeSurveyScore(fields, { q1: 'Maybe' })).toBe(0);
    // Missing answer
    expect(computeSurveyScore(fields, {})).toBe(0);

    const checkboxFields: SurveyFieldDef[] = [
      field({
        id: 'q1',
        type: 'checkbox',
        options: ['A', 'B'],
        scoring: { type: 'option_map', options: { A: 1, B: 2 } },
      }),
    ];
    // Unknown entries in a checkbox array contribute 0; known ones still count.
    expect(computeSurveyScore(checkboxFields, { q1: ['A', 'Z'] })).toBe(1);
  });

  it('option_map: normalizes boolean toggle answers to Yes/No labels', () => {
    const fields: SurveyFieldDef[] = [
      field({
        id: 'q1',
        type: 'toggle',
        scoring: { type: 'option_map', options: { Yes: 10, No: 0 } },
      }),
    ];
    expect(computeSurveyScore(fields, { q1: true })).toBe(10);
    expect(computeSurveyScore(fields, { q1: false })).toBe(0);
    expect(computeSurveyScore(fields, { q1: 'Yes' })).toBe(10);
  });

  it('numeric: multiplies by weight and rounds (half-up)', () => {
    const fields: SurveyFieldDef[] = [
      field({ id: 'q1', type: 'rating', scoring: { type: 'numeric', weight: 2 } }),
    ];
    expect(computeSurveyScore(fields, { q1: 5 })).toBe(10);
    expect(computeSurveyScore(fields, { q1: '4' })).toBe(8);

    // Round half-up: 0.5 -> 1, 1.5 -> 2.
    const halves: SurveyFieldDef[] = [
      field({ id: 'q1', type: 'rating', scoring: { type: 'numeric', weight: 0.5 } }),
    ];
    expect(computeSurveyScore(halves, { q1: 1 })).toBe(1); // 0.5 → 1
    expect(computeSurveyScore(halves, { q1: 3 })).toBe(2); // 1.5 → 2
  });

  it('numeric: returns 0 for non-numeric or missing answers', () => {
    const fields: SurveyFieldDef[] = [
      field({ id: 'q1', type: 'number', scoring: { type: 'numeric', weight: 1 } }),
    ];
    expect(computeSurveyScore(fields, { q1: 'abc' })).toBe(0);
    expect(computeSurveyScore(fields, { q1: '' })).toBe(0);
    expect(computeSurveyScore(fields, { q1: null })).toBe(0);
    expect(computeSurveyScore(fields, {})).toBe(0);
  });

  it('nps: buckets 0-6 → -1, 7-8 → 0, 9-10 → +1', () => {
    const fields: SurveyFieldDef[] = [
      field({ id: 'q1', type: 'rating', scoring: { type: 'nps' } }),
    ];
    for (let n = 0; n <= 6; n++) {
      expect(computeSurveyScore(fields, { q1: n })).toBe(-1);
    }
    expect(computeSurveyScore(fields, { q1: 7 })).toBe(0);
    expect(computeSurveyScore(fields, { q1: 8 })).toBe(0);
    expect(computeSurveyScore(fields, { q1: 9 })).toBe(1);
    expect(computeSurveyScore(fields, { q1: 10 })).toBe(1);
    // Out-of-range / non-numeric → 0.
    expect(computeSurveyScore(fields, { q1: 11 })).toBe(0);
    expect(computeSurveyScore(fields, { q1: -1 })).toBe(0);
    expect(computeSurveyScore(fields, { q1: 'NaN' })).toBe(0);
    expect(computeSurveyScore(fields, {})).toBe(0);
  });

  it('combines numeric + option_map fields', () => {
    const fields: SurveyFieldDef[] = [
      field({ id: 'rating', type: 'rating', scoring: { type: 'numeric', weight: 2 } }),
      field({
        id: 'priority',
        type: 'select',
        options: ['Low', 'High'],
        scoring: { type: 'option_map', options: { Low: 1, High: 10 } },
      }),
      // Unscored field — should not contribute and should not flip the null
      // path (the scored fields above are enough to make the survey scorable).
      field({ id: 'name', type: 'text' }),
    ];
    expect(computeSurveyScore(fields, { rating: 4, priority: 'High', name: 'x' })).toBe(18);
    expect(computeSurveyScore(fields, { rating: 0, priority: 'Low' })).toBe(1);
  });
});
