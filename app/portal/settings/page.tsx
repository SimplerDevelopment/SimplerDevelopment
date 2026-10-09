import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { hasFlag } from '@/lib/feature-flags';
import SettingsIndex from './_components/SettingsIndex';

/**
 * PUX-195: /portal/settings. The next.config redirect that sent this path
 * straight to /profile moved here so the flag can decide: flag off keeps
 * today's behaviour (redirect to Profile); flag on lands on the index.
 */
export default async function SettingsIndexPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client || !hasFlag(client, 'portal-redesign')) redirect('/portal/settings/profile');
  return <SettingsIndex />;
}
