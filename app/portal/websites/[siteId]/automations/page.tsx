import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { resolvePortalSite } from '@/lib/portal-client';
import WebsiteAutomationSettings from '@/components/portal/WebsiteAutomationSettings';
import WebsiteNotificationSettings from '@/components/portal/WebsiteNotificationSettings';

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
      {/* Header — site identity + back lives in WebsiteSubNav. */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automations &amp; Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure automated workflows and notification alerts.
        </p>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-xl p-6">
        <WebsiteNotificationSettings />
      </div>

      {/* Automations */}
      <div className="bg-card border border-border rounded-xl p-6">
        <WebsiteAutomationSettings />
      </div>
    </div>
  );
}
