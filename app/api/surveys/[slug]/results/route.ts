/**
 * Public survey results API.
 * GET /api/surveys/[slug]/results
 *
 * Returns aggregated results for a survey:
 * - Per-question breakdowns (option counts for select/radio/checkbox, averages for rating/slider)
 * - Text response samples
 * - Total response count
 *
 * Gated by `surveys.publish_results` (DIST-03). When false, the route returns
 * 404 — drive-by callers shouldn't be able to discover whether a slug exists.
 * Aggregate-only by construction; no individual responses are exposed (DIST-04).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { aggregateSurveyResults } from '@/lib/surveys/aggregate-results';

export type { QuestionResult, SurveyResultsData } from '@/lib/surveys/aggregate-results';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);

  if (!survey || !survey.publishResults) {
    return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });
  }

  const responses = await db
    .select({ answers: surveyResponses.answers })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, survey.id));

  const data = aggregateSurveyResults(
    {
      title: survey.title,
      description: survey.description,
      fields: (survey.fields ?? []) as SurveyFieldDef[],
    },
    responses,
  );

  return NextResponse.json({ success: true, data });
}
