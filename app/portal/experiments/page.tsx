// /portal/experiments — list of A/B experiments across the active client's
// posts AND pitch decks. SSR list, links into the per-experiment detail page.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, posts, clientWebsites, pitchDecks } from '@/lib/db/schema';
import { eq, inArray, desc, and, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export const dynamic = 'force-dynamic';

const STATUS_ICONS: Record<string, string> = {
  draft: 'edit',
  running: 'play_circle',
  completed: 'task_alt',
  archived: 'inventory_2',
};

const TARGET_LABEL: Record<string, { icon: string; label: string }> = {
  post: { icon: 'web', label: 'Page' },
  deck: { icon: 'slideshow', label: 'Pitch deck' },
  survey: { icon: 'poll', label: 'Survey' },
  email: { icon: 'mail', label: 'Email' },
};

interface ExperimentRow {
  id: number;
  name: string;
  status: string;
  goalMetric: string;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  targetType: string;
  targetId: number;
  targetTitle: string;
  /** Stable URL to open the underlying entity in its native editor. */
  targetEditHref: string | null;
  /** Optional secondary label (site name for posts, etc). */
  targetSubLabel: string | null;
}

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
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          createdAt: r.createdAt,
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
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        createdAt: r.createdAt,
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span className="material-icons">science</span>
            A/B Experiments
          </h1>
          <p className="text-sm text-gray-500 mt-1">Run head-to-head tests on any page. Track conversion lift with statistical significance.</p>
        </div>
      </div>

      {experiments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-8 py-16 text-center">
          <span className="material-icons text-4xl text-gray-400 mb-2">science</span>
          <h2 className="text-lg font-medium mb-2">No experiments yet</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Open any page in the visual editor or any pitch deck and use the &quot;A/B test&quot; action to spin one up.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Experiment</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Goal</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {experiments.map(exp => {
                const meta = TARGET_LABEL[exp.targetType] ?? { icon: 'help', label: exp.targetType };
                return (
                  <tr key={exp.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{exp.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                        <span className="material-icons text-base">{meta.icon}</span>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {exp.targetEditHref ? (
                        <Link href={exp.targetEditHref} className="text-blue-600 hover:underline">
                          {exp.targetTitle}
                        </Link>
                      ) : (
                        <span>{exp.targetTitle}</span>
                      )}
                      {exp.targetSubLabel ? (
                        <div className="text-xs text-gray-400">{exp.targetSubLabel}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                        <span className="material-icons text-base">flag</span>
                        {exp.goalMetric}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="material-icons text-base">{STATUS_ICONS[exp.status] || 'help'}</span>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {exp.startedAt ? new Date(exp.startedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/portal/experiments/${exp.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
