import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import { eq, count, desc } from 'drizzle-orm';
import Link from 'next/link';

export default async function PitchDecksWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [countResult, recent] = await Promise.all([
    db
      .select({ count: count() })
      .from(pitchDecks)
      .where(eq(pitchDecks.clientId, clientId)),
    db
      .select({
        id: pitchDecks.id,
        title: pitchDecks.title,
        status: pitchDecks.status,
        updatedAt: pitchDecks.updatedAt,
      })
      .from(pitchDecks)
      .where(eq(pitchDecks.clientId, clientId))
      .orderBy(desc(pitchDecks.updatedAt))
      .limit(3),
  ]);

  const deckCount = countResult[0]?.count ?? 0;

  return (
    <div>
      <div className="mb-3">
        <span className="text-2xl font-bold text-foreground">{deckCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          pitch deck{deckCount !== 1 ? 's' : ''}
        </span>
      </div>

      {recent.length === 0 ? (
        <div>
          <p className="text-sm text-muted-foreground py-2 text-center">No pitch decks yet.</p>
          <div className="mt-3 text-center">
            <Link
              href="/portal/tools/pitch-decks"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <span className="material-icons text-sm">add_circle_outline</span>
              Create your first deck
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {recent.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/portal/tools/pitch-decks/${deck.id}`}
                className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{deck.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(deck.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium border border-border ${
                    deck.status === 'published'
                      ? 'text-green-700 bg-green-50'
                      : deck.status === 'archived'
                        ? 'text-muted-foreground bg-accent'
                        : 'text-foreground bg-accent'
                  }`}
                >
                  {deck.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
