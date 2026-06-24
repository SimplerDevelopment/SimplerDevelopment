import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import { eq, count, desc, inArray } from 'drizzle-orm';
import Link from 'next/link';

export default async function SurveyResponsesWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  // Resolve all surveys owned by this client
  const clientSurveys = await db
    .select({ id: surveys.id, title: surveys.title, status: surveys.status, responseCount: surveys.responseCount })
    .from(surveys)
    .where(eq(surveys.clientId, clientId))
    .orderBy(desc(surveys.updatedAt))
    .limit(3);

  const activeSurveyCount = clientSurveys.filter((s) => s.status === 'active').length;

  // Get total response count and per-survey response counts in one shot.
  // surveys.responseCount is a denormalized counter — use it directly (cheap).
  const totalResponses = clientSurveys.reduce((sum, s) => sum + (s.responseCount ?? 0), 0);

  // For accuracy on the widget, verify with a live count if there are any surveys.
  const surveyIds = clientSurveys.map((s) => s.id);

  let liveTotal = totalResponses;
  let surveyResponseCounts: { surveyId: number; count: number }[] = [];

  if (surveyIds.length > 0) {
    const [totalResult, perSurveyResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(surveyResponses)
        .where(inArray(surveyResponses.surveyId, surveyIds)),
      db
        .select({ surveyId: surveyResponses.surveyId, count: count() })
        .from(surveyResponses)
        .where(inArray(surveyResponses.surveyId, surveyIds))
        .groupBy(surveyResponses.surveyId),
    ]);

    liveTotal = totalResult[0]?.count ?? 0;
    surveyResponseCounts = perSurveyResult.map((r) => ({
      surveyId: r.surveyId,
      count: r.count,
    }));
  }

  const responseCountBySurvey = new Map(surveyResponseCounts.map((r) => [r.surveyId, r.count]));

  return (
    <div>
      <div className="mb-3 flex gap-4">
        <div>
          <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{liveTotal}</span>
          <span className="ml-2 text-sm text-muted-foreground">total response{liveTotal !== 1 ? 's' : ''}</span>
        </div>
        <div>
          <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{activeSurveyCount}</span>
          <span className="ml-2 text-sm text-muted-foreground">active</span>
        </div>
      </div>
      {clientSurveys.length === 0 ? (
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No surveys yet.</p>
          <Link
            href="/portal/surveys"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">add_circle_outline</span>
            Create a survey
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {clientSurveys.map((s) => {
            const respCount = responseCountBySurvey.get(s.id) ?? 0;
            return (
              <li key={s.id}>
                <Link
                  href="/portal/surveys"
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {respCount} response{respCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : s.status === 'closed'
                          ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}
                  >
                    {s.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
