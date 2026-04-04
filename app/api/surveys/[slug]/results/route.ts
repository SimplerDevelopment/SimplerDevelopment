/**
 * Public survey results API.
 * GET /api/surveys/[slug]/results
 *
 * Returns aggregated results for a survey:
 * - Per-question breakdowns (option counts for select/radio/checkbox, averages for rating/slider)
 * - Text response samples
 * - Total response count
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface QuestionResult {
  fieldId: string;
  label: string;
  type: SurveyFieldDef['type'];
  /** For option-based questions: { optionLabel: count } */
  optionCounts?: Record<string, number>;
  /** For rating/slider/number: average, min, max */
  numericStats?: { average: number; min: number; max: number; count: number };
  /** For text-based questions: sample responses */
  textSamples?: string[];
  /** Total answers for this question */
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

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [survey] = await db.select()
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);

  if (!survey) {
    return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });
  }

  const fields = (survey.fields || []) as SurveyFieldDef[];
  const responses = await db.select({ answers: surveyResponses.answers })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, survey.id));

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
      // Initialize all options to 0
      for (const opt of (field.options || [])) {
        counts[opt] = 0;
      }

      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers[field.id];
        if (val == null || val === '') continue;
        result.answerCount++;

        if (Array.isArray(val)) {
          // checkbox: multiple selections
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
        const val = answers[field.id];
        if (val == null || val === '') continue;
        const num = Number(val);
        if (!isNaN(num)) {
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
        const val = answers[field.id];
        if (val && typeof val === 'string' && val.trim()) {
          result.answerCount++;
          if (samples.length < 20) samples.push(val.trim());
        }
      }
      result.textSamples = samples;

    } else if (field.type === 'toggle') {
      const counts: Record<string, number> = { Yes: 0, No: 0 };
      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers[field.id];
        if (val == null) continue;
        result.answerCount++;
        counts[val ? 'Yes' : 'No']++;
      }
      result.optionCounts = counts;

    } else if (field.type === 'date') {
      const samples: string[] = [];
      for (const resp of responses) {
        const answers = resp.answers as Record<string, unknown>;
        const val = answers[field.id];
        if (val && typeof val === 'string' && val.trim()) {
          result.answerCount++;
          if (samples.length < 20) samples.push(val);
        }
      }
      result.textSamples = samples;
    }

    questions.push(result);
  }

  const data: SurveyResultsData = {
    surveyTitle: survey.title,
    surveyDescription: survey.description,
    totalResponses,
    questions,
  };

  return NextResponse.json({ success: true, data });
}
