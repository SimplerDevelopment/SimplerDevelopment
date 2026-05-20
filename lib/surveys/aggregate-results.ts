/**
 * Survey results aggregator (DIST-03 / DIST-04).
 *
 * Consumed by:
 *   - GET /api/surveys/[slug]/results (public JSON)
 *   - app/s/[slug]/results/page.tsx   (public HTML)
 *
 * The output is intentionally aggregate-only: option counts, numeric stats
 * (avg/min/max), and a capped sample of text answers. Individual response
 * rows never leave this function.
 */

import type { SurveyFieldDef } from '@/lib/db/schema';

export interface QuestionResult {
  fieldId: string;
  label: string;
  type: SurveyFieldDef['type'];
  /** For option-based questions: { optionLabel: count } */
  optionCounts?: Record<string, number>;
  /** For rating/slider/number: average (1dp), min, max, count of usable values. */
  numericStats?: { average: number; min: number; max: number; count: number };
  /** For text-based questions: up to 20 trimmed non-empty samples. */
  textSamples?: string[];
  /** Total answers that contributed to this question (non-null, non-empty). */
  answerCount: number;
}

export interface SurveyResultsData {
  surveyTitle: string;
  surveyDescription: string | null;
  totalResponses: number;
  questions: QuestionResult[];
}

const OPTION_TYPES = new Set(['select', 'radio', 'checkbox']);
const NUMERIC_TYPES = new Set(['rating', 'slider', 'number']);
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url']);
const SKIP_TYPES = new Set(['heading', 'page_break']);

const MAX_TEXT_SAMPLES = 20;

export function aggregateSurveyResults(
  survey: { title: string; description: string | null; fields: SurveyFieldDef[] | null },
  responses: { answers: unknown }[],
): SurveyResultsData {
  const fields = (survey.fields || []) as SurveyFieldDef[];
  const totalResponses = responses.length;
  const questions: QuestionResult[] = [];

  for (const field of fields) {
    if (SKIP_TYPES.has(field.type)) continue;

    const result: QuestionResult = {
      fieldId: field.id,
      label: field.label,
      type: field.type,
      answerCount: 0,
    };

    if (OPTION_TYPES.has(field.type)) {
      const counts: Record<string, number> = {};
      for (const opt of field.options || []) counts[opt] = 0;
      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers?.[field.id];
        if (val == null || val === '') continue;
        result.answerCount++;
        if (Array.isArray(val)) {
          for (const v of val) {
            const str = String(v);
            counts[str] = (counts[str] || 0) + 1;
          }
        } else {
          const str = String(val);
          counts[str] = (counts[str] || 0) + 1;
        }
      }
      result.optionCounts = counts;
    } else if (NUMERIC_TYPES.has(field.type)) {
      const values: number[] = [];
      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers?.[field.id];
        if (val == null || val === '') continue;
        const num = Number(val);
        if (!Number.isNaN(num)) {
          values.push(num);
          result.answerCount++;
        }
      }
      if (values.length > 0) {
        result.numericStats = {
          average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length,
        };
      }
    } else if (TEXT_TYPES.has(field.type)) {
      const samples: string[] = [];
      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers?.[field.id];
        if (val && typeof val === 'string' && val.trim()) {
          result.answerCount++;
          if (samples.length < MAX_TEXT_SAMPLES) samples.push(val.trim());
        }
      }
      result.textSamples = samples;
    } else if (field.type === 'toggle') {
      const counts: Record<string, number> = { Yes: 0, No: 0 };
      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers?.[field.id];
        if (val == null) continue;
        result.answerCount++;
        counts[val ? 'Yes' : 'No']++;
      }
      result.optionCounts = counts;
    } else if (field.type === 'date') {
      const samples: string[] = [];
      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers?.[field.id];
        if (val && typeof val === 'string' && val.trim()) {
          result.answerCount++;
          if (samples.length < MAX_TEXT_SAMPLES) samples.push(val);
        }
      }
      result.textSamples = samples;
    }

    questions.push(result);
  }

  return {
    surveyTitle: survey.title,
    surveyDescription: survey.description,
    totalResponses,
    questions,
  };
}
