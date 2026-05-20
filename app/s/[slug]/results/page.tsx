/**
 * Public aggregated-results page for a survey (DIST-03).
 *
 * Server-rendered, behind the `surveys.publish_results` gate. Aggregate-only
 * by construction — the page consumes `aggregateSurveyResults`, which never
 * surfaces individual responses (DIST-04).
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { aggregateSurveyResults } from '@/lib/surveys/aggregate-results';
import { getBrandingBySurveySlug, brandingToCssVars } from '@/lib/branding';

// Aggregate counts shift as new responses arrive, so disable static caching.
export const dynamic = 'force-dynamic';

async function loadSurvey(slug: string) {
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);
  if (!survey || !survey.publishResults) return null;
  return survey;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const survey = await loadSurvey(slug);
  if (!survey) return { title: 'Results not found' };
  return {
    title: `${survey.title} — Results`,
    description: survey.description ?? `Aggregated results for ${survey.title}.`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicSurveyResultsPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const survey = await loadSurvey(slug);
  if (!survey) notFound();

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

  const branding = await getBrandingBySurveySlug(slug);
  const cssVars = branding ? brandingToCssVars(branding) : undefined;
  const brandColor = branding?.primaryColor || survey.color || '#2563eb';

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-950"
      style={cssVars as React.CSSProperties}
    >
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {data.surveyTitle}
          </h1>
          {data.surveyDescription && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.surveyDescription}</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Aggregated public results — no individual responses are shown.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard label="Total responses" value={data.totalResponses} />
          <SummaryCard
            label="Questions"
            value={data.questions.length}
          />
        </div>

        {data.totalResponses === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-10 text-center">
            <span className="material-icons text-4xl text-gray-300 dark:text-gray-700">bar_chart</span>
            <p className="text-gray-500 mt-2 text-sm">No responses yet. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.questions.map((q) => (
              <QuestionCard key={q.fieldId} question={q} brandColor={brandColor} />
            ))}
          </div>
        )}

        <footer className="pt-4 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-600">Powered by SimplerDevelopment</p>
        </footer>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function QuestionCard({
  question,
  brandColor,
}: {
  question: import('@/lib/surveys/aggregate-results').QuestionResult;
  brandColor: string;
}) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
      <header>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{question.label}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {question.answerCount} {question.answerCount === 1 ? 'response' : 'responses'}
        </p>
      </header>

      {question.optionCounts && Object.keys(question.optionCounts).length > 0 && (
        <OptionBars counts={question.optionCounts} brandColor={brandColor} />
      )}

      {question.numericStats && (
        <NumericSummary stats={question.numericStats} fieldType={question.type} brandColor={brandColor} />
      )}

      {question.textSamples && question.textSamples.length > 0 && (
        <TextSamples samples={question.textSamples} />
      )}

      {!question.optionCounts && !question.numericStats && !question.textSamples?.length && (
        <p className="text-xs text-gray-400">No data for this question yet.</p>
      )}
    </section>
  );
}

function OptionBars({
  counts,
  brandColor,
}: {
  counts: Record<string, number>;
  brandColor: string;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const maxCount = Math.max(...entries.map(([, n]) => n), 1);

  return (
    <div className="space-y-1.5">
      {entries.map(([label, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-28 text-right text-gray-600 dark:text-gray-400 truncate shrink-0">{label}</span>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all flex items-center px-2"
                style={{
                  width: `${Math.max((count / maxCount) * 100, 2)}%`,
                  backgroundColor: brandColor,
                }}
              >
                {count > 0 && <span className="text-white text-xs font-medium">{count}</span>}
              </div>
            </div>
            <span className="w-10 text-right text-gray-500 dark:text-gray-500">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function NumericSummary({
  stats,
  fieldType,
  brandColor,
}: {
  stats: { average: number; min: number; max: number; count: number };
  fieldType: string;
  brandColor: string;
}) {
  if (fieldType === 'rating') {
    const rounded = Math.round(stats.average);
    return (
      <div className="flex items-center gap-3">
        <span className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{stats.average.toFixed(1)}</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              className="text-xl"
              style={{ color: s <= rounded ? brandColor : '#d1d5db' }}
            >
              {'★'}
            </span>
          ))}
        </div>
        <span className="text-xs text-gray-500">({stats.count} ratings)</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-4">
      <div>
        <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.average.toFixed(1)}</span>
        <span className="text-xs text-gray-500 ml-1">avg</span>
      </div>
      <span className="text-xs text-gray-500">Min {stats.min} · Max {stats.max} · n={stats.count}</span>
    </div>
  );
}

function TextSamples({ samples }: { samples: string[] }) {
  // Show up to 5 trimmed samples — the API caps at 20 but a public page
  // doesn't need to scroll through dozens of free-text answers.
  const shown = samples.slice(0, 5);
  return (
    <div className="space-y-1.5">
      {shown.map((s, i) => (
        <blockquote
          key={i}
          className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 border-l-2 border-gray-300 dark:border-gray-700 px-3 py-2 rounded"
        >
          {s}
        </blockquote>
      ))}
      {samples.length > shown.length && (
        <p className="text-xs text-gray-400">+ {samples.length - shown.length} more answers</p>
      )}
    </div>
  );
}
