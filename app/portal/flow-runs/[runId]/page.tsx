/**
 * Resolver for a workflow-run permalink: /portal/flow-runs/<runId>.
 *
 * The Executions tab lives under the run's project
 * (/portal/projects/<projectId>?tab=runs), but a kanban_card_artifacts link
 * row carries only (artifactType, artifactId) — there is nowhere to put the
 * project id. Rather than widen the shared artifactUrl(type, id) signature
 * for a single caller, this page looks the project up and redirects.
 *
 * It deliberately does NOT authorize the run itself: the redirect target
 * already gates on staff-or-owning-client and sends non-members to the
 * dashboard. What it must not do is leak WHICH project a run belongs to, so
 * an unknown run id and another tenant's run id both land on the same
 * projects list — a redirect that resolved for one and not the other would
 * answer "does run 41 exist, and whose is it" to anyone who asked.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agentFlowRuns, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';

export default async function FlowRunRedirectPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { runId } = await params;
  const id = parseInt(runId, 10);
  if (!Number.isFinite(id)) redirect('/portal/projects');

  const [staff, portalClient] = await Promise.all([
    isPortalStaff(),
    getPortalClient(parseInt(session.user.id, 10)),
  ]);

  // Staff see every tenant's runs; everyone else is filtered to their own
  // client. Filtering in SQL rather than fetching-then-comparing keeps the
  // not-found and not-yours cases indistinguishable from here on.
  const where = staff
    ? eq(agentFlowRuns.id, id)
    : portalClient
      ? and(eq(agentFlowRuns.id, id), eq(agentFlowRuns.clientId, portalClient.id))
      : null;
  if (!where) redirect('/portal/dashboard');

  const [run] = await db
    .select({ projectId: agentFlowRuns.projectId })
    .from(agentFlowRuns)
    .innerJoin(projects, eq(projects.id, agentFlowRuns.projectId))
    .where(where)
    .limit(1);

  if (!run) redirect('/portal/projects');
  redirect(`/portal/projects/${run.projectId}?tab=runs`);
}
