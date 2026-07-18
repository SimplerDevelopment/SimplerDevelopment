import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { resolvePortalSite } from '@/lib/portal-client';
import WebsiteAutomationSettings from '@/components/portal/WebsiteAutomationSettings';
import WebsiteNotificationSettings from '@/components/portal/WebsiteNotificationSettings';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pCard } from '@/components/portal/portal-ui';

export default async function WebsiteAutomationsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) notFound();
  const { site } = resolved;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Website"
        title="Automations & Notifications"
        subtitle="Configure automated workflows and notification alerts."
      />

      {/* Notifications */}
      <div className={`${pCard} p-6`}>
        <WebsiteNotificationSettings />
      </div>

      {/* Automations */}
      <div className={`${pCard} p-6`}>
        <WebsiteAutomationSettings />
      </div>
    </div>
  );
}
