// /portal/brain/review — under the portal-redesign flag this is a real page
// (PUX-165, design doc screen 24); otherwise it stays the redirect to the
// Tasks page's Review tab, which renders the same ReviewTab.

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { hasFlag } from '@/lib/feature-flags';
import ReviewQueuePage from '@/components/brain/review/ReviewQueuePage';

export default async function BrainReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client || !hasFlag(client, 'portal-redesign')) redirect('/portal/brain/tasks?tab=review');
  return <ReviewQueuePage />;
}
