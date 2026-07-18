import { describe, it, expect } from 'vitest';
import { aggregateSurveyResults } from '@/lib/surveys/aggregate-results';
import type { SurveyFieldDef } from '@/lib/db/schema';

const fields: SurveyFieldDef[] = [
  { id: 'h1', type: 'heading', label: 'Section', placeholder: '', helpText: '', required: false, options: [], order: 0 },
  { id: 'q1', type: 'radio', label: 'Color', placeholder: '', helpText: '', required: false, options: ['Red', 'Blue'], order: 1 },
  { id: 'q2', type: 'checkbox', label: 'Pets', placeholder: '', helpText: '', required: false, options: ['Cat', 'Dog', 'Fish'], order: 2 },
  { id: 'q3', type: 'rating', label: 'Stars', placeholder: '', helpText: '', required: false, options: [], order: 3 },
  { id: 'q4', type: 'text', label: 'Feedback', placeholder: '', helpText: '', required: false, options: [], order: 4 },
  { id: 'q5', type: 'toggle', label: 'OK?', placeholder: '', helpText: '', required: false, options: [], order: 5 },
];

describe('aggregateSurveyResults', () => {
  it('skips heading + page_break fields', () => {
    const out = aggregateSurveyResults({ title: 'T', description: null, fields }, []);
    expect(out.questions.map((q) => q.fieldId)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
  });

  it('counts radio selections', () => {
    const out = aggregateSurveyResults(
      { title: 'T', description: null, fields },
      [{ answers: { q1: 'Red' } }, { answers: { q1: 'Red' } }, { answers: { q1: 'Blue' } }],
    );
    const q1 = out.questions.find((q) => q.fieldId === 'q1')!;
    expect(q1.answerCount).toBe(3);
    expect(q1.optionCounts).toEqual({ Red: 2, Blue: 1 });
  });

  it('counts checkbox multi-select per option', () => {
    const out = aggregateSurveyResults(
      { title: 'T', description: null, fields },
      [{ answers: { q2: ['Cat', 'Dog'] } }, { answers: { q2: ['Cat'] } }],
    );
    const q2 = out.questions.find((q) => q.fieldId === 'q2')!;
    expect(q2.answerCount).toBe(2);
    expect(q2.optionCounts).toEqual({ Cat: 2, Dog: 1, Fish: 0 });
  });

  it('computes rating average / min / max / count', () => {
    const out = aggregateSurveyResults(
      { title: 'T', description: null, fields },
      [{ answers: { q3: 5 } }, { answers: { q3: 3 } }, { answers: { q3: 4 } }, { answers: { q3: '' } }],
    );
    const q3 = out.questions.find((q) => q.fieldId === 'q3')!;
    expect(q3.numericStats).toEqual({ average: 4, min: 3, max: 5, count: 3 });
  });

  it('caps text samples at 20 and trims whitespace', () => {
    const responses = Array.from({ length: 25 }, (_, i) => ({ answers: { q4: `  ans ${i}  ` } }));
    const out = aggregateSurveyResults({ title: 'T', description: null, fields }, responses);
    const q4 = out.questions.find((q) => q.fieldId === 'q4')!;
    expect(q4.answerCount).toBe(25);
    expect(q4.textSamples).toHaveLength(20);
    expect(q4.textSamples?.[0]).toBe('ans 0');
  });

  it('aggregates toggle as Yes/No with truthy semantics', () => {
    const out = aggregateSurveyResults(
      { title: 'T', description: null, fields },
      [
        { answers: { q5: true } },
        { answers: { q5: false } },
        { answers: { q5: true } },
        { answers: { q5: null } }, // null ignored entirely
      ],
    );
    const q5 = out.questions.find((q) => q.fieldId === 'q5')!;
    expect(q5.optionCounts).toEqual({ Yes: 2, No: 1 });
    expect(q5.answerCount).toBe(3);
  });

  it('never surfaces individual response rows in the output', () => {
    const out = aggregateSurveyResults(
      { title: 'T', description: null, fields },
      [{ answers: { q4: 'secret PII' } }],
    );
    // Aggregate-only check: nothing on the top-level result should expose raw answers.
    // Text samples DO show the answer (intentionally — capped to 20 per question), but
    // they're per-question summaries, not per-row records.
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('answers');
  });

  it('handles totalResponses and empty answer maps', () => {
    const out = aggregateSurveyResults(
      { title: 'T', description: null, fields },
      [{ answers: {} }, { answers: { q1: 'Red' } }],
    );
    expect(out.totalResponses).toBe(2);
    const q1 = out.questions.find((q) => q.fieldId === 'q1')!;
    expect(q1.answerCount).toBe(1);
  });
});
