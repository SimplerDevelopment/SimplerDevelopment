import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { resolvePortalSite } from '@/lib/portal-client';
import Link from 'next/link';
import ContentCalendar from '@/components/content-calendar/ContentCalendar';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary } from '@/components/portal/portal-ui';

export default async function PortalCalendarPage({
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

  const basePath = `/portal/websites/${siteId}`;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Website"
        title="Content Calendar"
        subtitle={`Plan, schedule, and manage content for ${site.name}.`}
        actions={
          <Link href={`${basePath}/posts/new`} className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>
            New Post
          </Link>
        }
      />

      <ContentCalendar websiteId={site.id} siteId={site.id} basePath={basePath} />
    </div>
  );
}
