import { db } from '@/lib/db';
import { clients, kanbanCards, kanbanColumns, projects } from '@/lib/db/schema';
import { eq, and, count, asc, isNotNull, gte } from 'drizzle-orm';
import Link from 'next/link';

export default async function EditorialPipelineWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  // Resolve the publishing project id for this client
  const clientRow = await db
    .select({ publishingProjectId: clients.publishingProjectId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const publishingProjectId = clientRow[0]?.publishingProjectId;

  if (!publishingProjectId) {
    return (
      <div>
        <p className="text-sm text-muted-foreground py-2 text-center">
          Publishing board not set up yet.
        </p>
        <div className="mt-3 text-center">
          <Link
            href="/portal/publishing"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">add_circle_outline</span>
            Set up Publishing
          </Link>
        </div>
      </div>
    );
  }

  // Safety: confirm the project belongs to this client (tenancy guard)
  const projectRow = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, publishingProjectId), eq(projects.clientId, clientId)))
    .limit(1);

  if (!projectRow[0]) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Publishing board unavailable.
      </p>
    );
  }

  const now = new Date();

  // Parallel: per-column card counts + next 3 scheduled cards
  const [columnCounts, scheduledCards] = await Promise.all([
    db
      .select({
        columnName: kanbanColumns.name,
        count: count(),
      })
      .from(kanbanCards)
      .innerJoin(kanbanColumns, eq(kanbanCards.columnId, kanbanColumns.id))
      .where(eq(kanbanCards.projectId, publishingProjectId))
      .groupBy(kanbanColumns.name),
    db
      .select({
        id: kanbanCards.id,
        title: kanbanCards.title,
        scheduledFor: kanbanCards.scheduledFor,
      })
      .from(kanbanCards)
      .where(
        and(
          eq(kanbanCards.projectId, publishingProjectId),
          isNotNull(kanbanCards.scheduledFor),
          gte(kanbanCards.scheduledFor, now),
        ),
      )
      .orderBy(asc(kanbanCards.scheduledFor))
      .limit(3),
  ]);

  const totalCards = columnCounts.reduce((sum, c) => sum + (c.count ?? 0), 0);

  return (
    <div>
      <div className="mb-3">
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{totalCards}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          item{totalCards !== 1 ? 's' : ''} in pipeline
        </span>
      </div>

      {columnCounts.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
          {columnCounts.map((col) => (
            <div key={col.columnName} className="flex items-center gap-1 text-sm">
              <span className="font-semibold text-foreground">{col.count}</span>
              <span className="text-muted-foreground truncate max-w-[80px]">{col.columnName}</span>
            </div>
          ))}
        </div>
      )}

      {scheduledCards.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">No upcoming scheduled items.</p>
      ) : (
        <ul className="space-y-2">
          {scheduledCards.map((card) => (
            <li key={card.id}>
              <Link
                href={`/portal/publishing`}
                className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {card.scheduledFor
                      ? new Date(card.scheduledFor).toLocaleDateString()
                      : ''}
                  </p>
                </div>
                <span className="shrink-0 material-icons text-base text-muted-foreground">
                  schedule
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 text-center">
        <Link
          href="/portal/publishing"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          <span className="material-icons text-sm">dashboard</span>
          Open Publishing board
        </Link>
      </div>
    </div>
  );
}
