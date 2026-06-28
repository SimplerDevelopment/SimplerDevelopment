import { db } from '@/lib/db';
import { abExperiments, abVariants, posts, pitchDecks, surveys, clientWebsites } from '@/lib/db/schema';
import { eq, and, count, desc, inArray, or } from 'drizzle-orm';
import Link from 'next/link';

export default async function AbExperimentsWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  // Resolve all target IDs owned by this client so we can scope experiments.
  // abExperiments has no clientId — it's linked via (targetType, targetId).
  const [siteRows, deckRows, surveyRows] = await Promise.all([
    db
      .select({ id: clientWebsites.id })
      .from(clientWebsites)
      .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.active, true))),
    db
      .select({ id: pitchDecks.id })
      .from(pitchDecks)
      .where(eq(pitchDecks.clientId, clientId)),
    db
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.clientId, clientId)),
  ]);

  const siteIds = siteRows.map((r) => r.id);
  let postIds: number[] = [];
  if (siteIds.length > 0) {
    const postRows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(inArray(posts.websiteId, siteIds));
    postIds = postRows.map((r) => r.id);
  }

  const deckIds = deckRows.map((r) => r.id);
  const surveyIds = surveyRows.map((r) => r.id);

  // Build OR filters for all owned target types
  const filters = [];
  if (postIds.length > 0) filters.push(and(eq(abExperiments.targetType, 'post'), inArray(abExperiments.targetId, postIds)));
  if (deckIds.length > 0) filters.push(and(eq(abExperiments.targetType, 'deck'), inArray(abExperiments.targetId, deckIds)));
  if (surveyIds.length > 0) filters.push(and(eq(abExperiments.targetType, 'survey'), inArray(abExperiments.targetId, surveyIds)));

  if (filters.length === 0) {
    return (
      <div>
        <div className="mb-3">
          <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">0</span>
          <span className="ml-2 text-sm text-muted-foreground">experiments</span>
        </div>
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No experiments yet.</p>
          <Link
            href="/portal/experiments"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">science</span>
            Start an experiment
          </Link>
        </div>
      </div>
    );
  }

  const whereClause = filters.length === 1 ? filters[0]! : or(...filters)!;

  const [allExperiments, countResult] = await Promise.all([
    db
      .select({
        id: abExperiments.id,
        name: abExperiments.name,
        status: abExperiments.status,
        targetType: abExperiments.targetType,
      })
      .from(abExperiments)
      .where(whereClause)
      .orderBy(desc(abExperiments.createdAt))
      .limit(3),
    db
      .select({ count: count() })
      .from(abExperiments)
      .where(and(whereClause, eq(abExperiments.status, 'running'))),
  ]);

  const runningCount = countResult[0]?.count ?? 0;

  // Fetch variant counts for the listed experiments
  const experimentIds = allExperiments.map((e) => e.id);
  const variantCounts = experimentIds.length > 0
    ? await db
        .select({ experimentId: abVariants.experimentId, count: count() })
        .from(abVariants)
        .where(inArray(abVariants.experimentId, experimentIds))
        .groupBy(abVariants.experimentId)
    : [];

  const variantCountMap = new Map(variantCounts.map((r) => [r.experimentId, r.count]));

  return (
    <div>
      <div className="mb-3">
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{runningCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          running experiment{runningCount !== 1 ? 's' : ''}
        </span>
      </div>
      {allExperiments.length === 0 ? (
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No experiments yet.</p>
          <Link
            href="/portal/experiments"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">science</span>
            Start an experiment
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {allExperiments.map((e) => {
            const vCount = variantCountMap.get(e.id) ?? 0;
            return (
              <li key={e.id}>
                <Link
                  href={`/portal/experiments/${e.id}`}
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {e.targetType} · {vCount} variant{vCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      e.status === 'running'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : e.status === 'completed'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : e.status === 'archived'
                            ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}
                  >
                    {e.status}
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
