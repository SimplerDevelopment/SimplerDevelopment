import { db } from '@/lib/db';
import { clientWebsites, posts, postTypes, mcpPendingChanges } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolvePortalSite } from '@/lib/portal-client';
import ContentList from '../ContentList';
import UploadHtmlPageButton from '@/components/portal/UploadHtmlPageButton';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { hasFlag } from '@/lib/feature-flags';
import { pageStatus, typeCounts } from '@/lib/sites/page-rows';
import PagesStudioTable from '@/components/portal/websites/PagesStudioTable';

export default async function PortalCmsEntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { siteId } = await params;
  const { type: activeType } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) notFound();
  const { site, client } = resolved;

  const [sitePosts, contentTypes] = await Promise.all([
    db.select().from(posts).where(eq(posts.websiteId, site.id)).orderBy(posts.updatedAt),
    db.select().from(postTypes).where(eq(postTypes.websiteId, site.id)),
  ]);

  const globalTypes = await db.select().from(postTypes).where(eq(postTypes.active, true));
  const allTypes = [...globalTypes.filter(t => !t.websiteId), ...contentTypes];

  const filteredPosts = activeType
    ? sitePosts.filter(p => p.postType === activeType)
    : sitePosts;

  // PUX-184 (design doc screen 43): under the redesign the list idiom, with "Pending approval" as a third status
  // (a pending mcp_pending_changes row targeting the post). posts carry no editor id and no per-page analytics
  // exist, so "Last edited" is the date and there is no views column. Flag off: ContentList, untouched below.
  if (hasFlag(client, 'portal-redesign')) {
    const ids = sitePosts.map(p => p.id);
    const pendingRows = ids.length === 0 ? [] : await db
      .select({ entityId: mcpPendingChanges.entityId })
      .from(mcpPendingChanges)
      .where(and(eq(mcpPendingChanges.clientId, client.id), eq(mcpPendingChanges.status, 'pending'), eq(mcpPendingChanges.entityType, 'post'), inArray(mcpPendingChanges.entityId, ids)));
    const pending = new Set(pendingRows.map(r => r.entityId).filter((v): v is number => v != null));
    const counts = typeCounts(sitePosts);
    const rows = [...filteredPosts].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(p => ({ id: p.id, title: p.title, postType: p.postType, status: pageStatus(p.published, pending, p.id), updatedAt: p.updatedAt.toISOString() }));
    const published = sitePosts.filter(p => p.published && !pending.has(p.id)).length;
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <PortalPageHeader
          eyebrow={`Websites · ${site.name}`}
          title="Pages"
          subtitle={`${sitePosts.length} total · ${published} published · ${sitePosts.length - published - pending.size} drafts · ${pending.size} pending approval`}
          actions={
            <div className="flex items-center gap-2">
              <Link href={`/portal/websites/${site.id}/calendar`} className={sBtnGhost}><span className="material-icons text-base">calendar_month</span>Calendar</Link>
              <UploadHtmlPageButton siteId={site.id} />
              <Link href={`/portal/websites/${site.id}/posts/new`} className={sBtn}><span className="material-icons text-base">add</span>New page</Link>
            </div>
          }
        />
        <PagesStudioTable
          siteId={site.id}
          rows={rows}
          total={sitePosts.length}
          activeType={activeType || null}
          tabs={allTypes.filter(t => counts[t.slug]).map(t => ({ slug: t.slug, name: t.name, count: counts[t.slug] ?? 0 }))}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Website"
        title="Entries"
        subtitle={<>{sitePosts.length} total &middot; {sitePosts.filter(p => p.published).length} published &middot; {sitePosts.filter(p => !p.published).length} drafts</>}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/portal/websites/${site.id}/calendar`} className={pBtnGhost}>
              <span className="material-icons text-base">calendar_month</span>
              Calendar
            </Link>
            <UploadHtmlPageButton siteId={site.id} />
            <Link href={`/portal/websites/${site.id}/posts/new`} className={pBtnPrimary}>
              <span className="material-icons text-base">add</span>
              New Entry
            </Link>
          </div>
        }
      />

      <ContentList
        siteId={site.id}
        posts={filteredPosts}
        contentTypes={allTypes.map(t => ({ slug: t.slug, name: t.name, icon: t.icon || 'description' }))}
        activeType={activeType || null}
      />
    </div>
  );
}
