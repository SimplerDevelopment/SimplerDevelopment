import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import Link from 'next/link';

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  published: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  archived: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default async function PitchDecksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const decks = await db
    .select()
    .from(pitchDecks)
    .where(eq(pitchDecks.clientId, client.id))
    .orderBy(desc(pitchDecks.updatedAt));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pitch Decks</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create AI-powered pitch decks branded to your company
          </p>
        </div>
        <Link
          href="/portal/tools/pitch-decks/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-lg">add</span>
          New Deck
        </Link>
      </div>

      {decks.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
          <span className="material-icons text-5xl text-muted-foreground/50">slideshow</span>
          <h2 className="text-lg font-semibold text-foreground">No pitch decks yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create your first AI-powered pitch deck. Enter a prompt describing what you need and optionally
            provide your website URL to automatically brand the deck.
          </p>
          <Link
            href="/portal/tools/pitch-decks/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-lg">auto_awesome</span>
            Create Your First Deck
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {decks.map((deck) => {
            const slides = (deck.slides as unknown[]) || [];
            return (
              <Link
                key={deck.id}
                href={`/portal/tools/pitch-decks/${deck.id}`}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-icons text-primary text-xl">slideshow</span>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {deck.title}
                    </h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[deck.status] || statusColor.draft}`}>
                    {deck.status}
                  </span>
                </div>
                {deck.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{deck.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">layers</span>
                    {slides.length} slide{slides.length !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">schedule</span>
                    {new Date(deck.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <span className="material-icons text-primary mt-0.5">tips_and_updates</span>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Tips</p>
          <p>Provide your website URL when creating a deck to automatically extract your brand colors, fonts, and company info.
          You can also edit individual slides with AI prompts after generation.</p>
        </div>
      </div>
    </div>
  );
}
