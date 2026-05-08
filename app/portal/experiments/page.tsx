// /portal/experiments — list of A/B experiments across the active client's
// posts AND pitch decks. SSR list, links into the per-experiment detail page.
//
// The header + data fetch is a server component; the rendered table itself is
// a client component (`ExperimentsTable`) so it can own status / target-type
// filter state without forcing query-string round-trips.

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, posts, clientWebsites, pitchDecks } from '@/lib/db/schema';
import { eq, inArray, desc, and, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import ExperimentsTable, { type ExperimentRow } from '@/components/portal/ExperimentsTable';
import { NewExperimentLauncher } from '@/components/portal/NewExperimentModal';

export const dynamic = 'force-dynamic';

export default async function ExperimentsListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  // Resolve every (post, deck) the active client owns so we know what target
  // ids are reachable. `clientWebsites` → posts; `pitch_decks.client_id` →
  // decks (no website join needed).
  const [sites, clientDecks] = await Promise.all([
    db
      .select({ id: clientWebsites.id, name: clientWebsites.name })
      .from(clientWebsites)
      .where(eq(clientWebsites.clientId, client.id)),
    db
      .select({ id: pitchDecks.id, title: pitchDecks.title, slug: pitchDecks.slug })
      .from(pitchDecks)
      .where(eq(pitchDecks.clientId, client.id)),
  ]);
  const siteIds = sites.map(s => s.id);
  const siteNameById = new Map(sites.map(s => [s.id, s.name] as const));
  const deckById = new Map(clientDecks.map(d => [d.id, d] as const));
  const deckIds = clientDecks.map(d => d.id);

  let sitePosts: Array<{ id: number; title: string; websiteId: number | null }> = [];
  if (siteIds.length > 0) {
    sitePosts = await db
      .select({ id: posts.id, title: posts.title, websiteId: posts.websiteId })
      .from(posts)
      .where(inArray(posts.websiteId, siteIds));
  }
  const postById = new Map(sitePosts.map(p => [p.id, p] as const));
  const postIds = sitePosts.map(p => p.id);

  // Pull every experiment whose target is something the active client owns.
  // We OR over (target_type='post', target_id IN postIds) and
  // (target_type='deck', target_id IN deckIds). When either set is empty
  // we skip that branch entirely so we don't emit `IN ()`.
  let experiments: ExperimentRow[] = [];
  const filters = [];
  if (postIds.length > 0) {
    filters.push(and(eq(abExperiments.targetType, 'post'), inArray(abExperiments.targetId, postIds)));
  }
  if (deckIds.length > 0) {
    filters.push(and(eq(abExperiments.targetType, 'deck'), inArray(abExperiments.targetId, deckIds)));
  }

  if (filters.length > 0) {
    const rows = await db
      .select()
      .from(abExperiments)
      .where(filters.length === 1 ? filters[0] : or(...filters))
      .orderBy(desc(abExperiments.createdAt));

    experiments = rows.map(r => {
      if (r.targetType === 'deck') {
        const d = deckById.get(r.targetId);
        return {
          id: r.id,
          name: r.name,
          status: r.status,
          goalMetric: r.goalMetric,
          startedAt: r.startedAt ? r.startedAt.toISOString() : null,
          endedAt: r.endedAt ? r.endedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          targetType: r.targetType,
          targetId: r.targetId,
          targetTitle: d?.title || `Deck #${r.targetId}`,
          targetEditHref: d ? `/portal/tools/pitch-decks/${d.id}` : null,
          targetSubLabel: null,
        };
      }
      // Default: post
      const p = postById.get(r.targetId);
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        goalMetric: r.goalMetric,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        targetType: r.targetType,
        targetId: r.targetId,
        targetTitle: p?.title || `Post #${r.targetId}`,
        targetEditHref: p?.websiteId
          ? `/portal/websites/${p.websiteId}/posts/${p.id}/edit`
          : null,
        targetSubLabel: p?.websiteId ? siteNameById.get(p.websiteId) ?? null : null,
      };
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span className="material-icons">science</span>
            A/B Experiments
          </h1>
          <p className="text-sm text-gray-500 mt-1">Run head-to-head tests on any page. Track conversion lift with statistical significance.</p>
        </div>
        <NewExperimentLauncher />
      </div>

      {experiments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-8 py-16 text-center">
          <span className="material-icons text-4xl text-gray-400 mb-2">science</span>
          <h2 className="text-lg font-medium mb-2">No experiments yet</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Pick a page or pitch deck to test, give it a name, and we&apos;ll spin up a draft experiment with two variants ready to edit.
          </p>
          <NewExperimentLauncher variant="cta" label="Create your first experiment" />
        </div>
      ) : (
        <ExperimentsTable experiments={experiments} />
      )}
    </div>
  );
}
