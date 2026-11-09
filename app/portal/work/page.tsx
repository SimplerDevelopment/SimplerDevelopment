import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { hasFlag } from '@/lib/feature-flags';
import { collectNeedsYou } from '@/lib/portal/needs-you';
import { collectKanbanTasks, collectBrainTasks } from '@/lib/portal/my-tasks-collect';
import { listReviewItems } from '@/lib/brain/review';
import { quickAddTargets } from '@/lib/portal/my-tasks-quick-add';
import { fromNeedsYou, fromTaskGroups, fromReviewItems } from '@/lib/work/inbox';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import WorkInbox from '@/components/portal/work/WorkInbox';

export const dynamic = 'force-dynamic';

/**
 * PUX-198 (design doc screen 57): My work. A server page because the
 * queues it unites are server collectors — collectNeedsYou has no API
 * route — so nothing new is exposed and every read keeps its own scoping
 * (needs-you by client, tasks by session user, review items by client).
 * Flag off: the route sends you to My tasks, today's closest room.
 */
export default async function WorkPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string }).role;
  const isStaff = role === 'admin' || role === 'employee';
  const client = await getPortalClient(userId);
  if (!client || !hasFlag(client, 'portal-redesign')) redirect('/portal/my-tasks');

  const [needs, kanban, brain, review] = await Promise.all([
    collectNeedsYou(client.id),
    collectKanbanTasks({ userId, isStaff, openOnly: true }),
    collectBrainTasks({ userId, isStaff, openOnly: true }),
    // ponytail: a tenant without the Brain simply has no review rows; any other failure hides the queue rather than the page.
    listReviewItems(client.id, { status: 'pending', limit: 25 }).catch(() => []),
  ]);
  const groups = [...kanban, ...brain];
  const rows = [...fromNeedsYou(needs.items), ...fromTaskGroups(groups), ...fromReviewItems(review)];
  // ponytail: the Brain quick-add target shows once the user already has Brain tasks; entitlement isn't re-checked here.
  const targets = quickAddTargets(groups, brain.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PortalPageHeader eyebrow="Work" title="My work" subtitle={`${rows.length} ${rows.length === 1 ? 'thing needs' : 'things need'} you — cards, tasks, tickets, approvals and reviews in one list.`} />
      <WorkInbox rows={rows} targets={targets} />
    </div>
  );
}
