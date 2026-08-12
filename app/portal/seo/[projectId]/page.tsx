// /portal/seo/[projectId] — audit dashboard. Thin server wrapper (auth +
// entitlement + param parsing only); defers to the client dashboard shell
// for the actual data fetch, tabs, and run polling.

import { auth } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';
import SeoProjectDashboard from '../_components/SeoProjectDashboard';

export default async function SeoProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const entitled = await hasServiceAccess(client.id, 'seo');
  if (!entitled) redirect('/portal/services');

  const { projectId } = await params;
  const id = parseInt(projectId, 10);
  if (!Number.isFinite(id)) notFound();

  return <SeoProjectDashboard projectId={id} />;
}
