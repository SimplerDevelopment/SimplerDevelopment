import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { hasFlag } from '@/lib/feature-flags';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import AutomationsHub from '@/components/portal/automations/AutomationsHub';

export const dynamic = 'force-dynamic';

/**
 * PUX-213 (design doc screen 77): "Automations" gets its own room under the
 * portal-redesign flag. Flag off (or no client) keeps today's behaviour —
 * a plain redirect into the Brain's rules builder.
 */
export default async function AutomationsPage() {
  const session = await auth();
  const client = session?.user?.id ? await getPortalClient(parseInt(session.user.id, 10)) : null;
  if (!client || !hasFlag(client, 'portal-redesign')) redirect('/portal/brain/automations');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PortalPageHeader eyebrow="Automations" title="Automations" subtitle="Rules that run today, workflows you can draft, and trigger links that tag a contact." />
      <AutomationsHub />
    </div>
  );
}
