import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
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
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link
        href={`/portal/websites/${site.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Back to {site.name}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automations & Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure automated workflows and notification alerts for {site.name}.
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
