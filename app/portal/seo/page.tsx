// /portal/seo — project list. Thin server wrapper (auth + entitlement only,
// mirrors app/portal/surveys/page.tsx); all data comes from the REST API via
// the client body below.

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';
import SeoProjectsList from './_components/SeoProjectsList';

export default async function SeoProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const entitled = await hasServiceAccess(client.id, 'seo');
  if (!entitled) redirect('/portal/services');

  return <SeoProjectsList />;
}
