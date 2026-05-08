// /portal/experiments — list of A/B experiments across the active client's
// posts. SSR list, links into the per-experiment detail page.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, posts, clientWebsites } from '@/lib/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { NewExperimentLauncher } from '@/components/portal/NewExperimentModal';

export const dynamic = 'force-dynamic';

const STATUS_ICONS: Record<string, string> = {
  draft: 'edit',
  running: 'play_circle',
  completed: 'task_alt',
  archived: 'inventory_2',
};

export default async function ExperimentsListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  // Sites belonging to this client → posts on those sites → experiments.
  const sites = await db
    .select({ id: clientWebsites.id, name: clientWebsites.name })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id));

  const siteIds = sites.map(s => s.id);
  const siteNameById = new Map(sites.map(s => [s.id, s.name] as const));

  let experiments: Array<{
    id: number;
    name: string;
    status: string;
    goalMetric: string;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    postId: number;
    postTitle: string;
    siteId: number;
  }> = [];

  if (siteIds.length > 0) {
    const sitePosts = await db
      .select({ id: posts.id, title: posts.title, websiteId: posts.websiteId })
      .from(posts)
      .where(inArray(posts.websiteId, siteIds));
    const postById = new Map(sitePosts.map(p => [p.id, p] as const));
    const postIds = sitePosts.map(p => p.id);

    if (postIds.length > 0) {
      const rows = await db
        .select()
        .from(abExperiments)
        .where(inArray(abExperiments.postId, postIds))
        .orderBy(desc(abExperiments.createdAt));

      experiments = rows.map(r => {
        const p = postById.get(r.postId);
        return {
          id: r.id,
          name: r.name,
          status: r.status,
          goalMetric: r.goalMetric,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          createdAt: r.createdAt,
          postId: r.postId,
          postTitle: p?.title || `Post #${r.postId}`,
          siteId: p?.websiteId ?? 0,
        };
      });
    }
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
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Experiment</th>
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-4 py-3 font-medium">Goal</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {experiments.map(exp => (
                <tr key={exp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{exp.name}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/portal/websites/${exp.siteId}/posts/${exp.postId}/edit`}
                      className="text-blue-600 hover:underline"
                    >
                      {exp.postTitle}
                    </Link>
                    <div className="text-xs text-gray-400">{siteNameById.get(exp.siteId) || ''}</div>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
