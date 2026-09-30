// /portal/crm/deals/[id] — a deal's own URL under the portal-redesign flag
// (PUX-172, design doc screen 31). Flag off: the deal opens as today's
// drawer on the board via ?dealId=, so old and new links both resolve.

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { hasFlag } from '@/lib/feature-flags';
import DealPage from './_components/DealPage';

export default async function CrmDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (!Number.isFinite(dealId)) redirect('/portal/crm/deals');
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client || !hasFlag(client, 'portal-redesign')) redirect(`/portal/crm/deals?dealId=${dealId}`);
  return <DealPage id={dealId} />;
}
