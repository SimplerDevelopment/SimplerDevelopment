import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import Link from 'next/link';
import ContentCalendar from '@/components/content-calendar/ContentCalendar';

export default async function PortalCalendarPage({
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

  const basePath = `/portal/websites/${siteId}`;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/websites" className="hover:text-foreground transition-colors">
          Websites
        </Link>
        <span className="material-icons text-xs">chevron_right</span>
        <Link href={basePath} className="hover:text-foreground transition-colors">
          {site.name}
        </Link>
        <span className="material-icons text-xs">chevron_right</span>
        <span className="text-foreground">Calendar</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan, schedule, and manage content for {site.name}.
          </p>
        </div>
        <Link
          href={`${basePath}/posts/new`}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
        >
          <span className="material-icons text-lg">add</span>
          New Post
        </Link>
      </div>

      <ContentCalendar websiteId={site.id} basePath={basePath} />
    </div>
  );
}
