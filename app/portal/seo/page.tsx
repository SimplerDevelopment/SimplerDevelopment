// /portal/seo — project list. Thin server wrapper (auth + entitlement only,
// mirrors app/portal/surveys/page.tsx); all data comes from the REST API via
// the client body below.

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';
import { hasFlag } from '@/lib/feature-flags';
import LockedRoom from '@/components/portal/LockedRoom';
import SeoProjectsList from './_components/SeoProjectsList';

export default async function SeoProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const entitled = await hasServiceAccess(client.id, 'seo');
  if (!entitled) {
    // PUX-146 (design doc screen 06): under the redesign the room sells itself
    // where it would live, instead of bouncing to the catalog. Flag off = the
    // redirect, as before.
    if (hasFlag(client, 'portal-redesign')) return <LockedRoom domainKey="seo" clientId={client.id} />;
    redirect('/portal/services');
  }

  return <SeoProjectsList />;
}
