import { db } from '@/lib/db';
import { clientWebsites, posts, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolvePortalSite } from '@/lib/portal-client';
import ContentList from '../ContentList';
import UploadHtmlPageButton from '@/components/portal/UploadHtmlPageButton';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

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
  const { site } = resolved;

  const [sitePosts, contentTypes] = await Promise.all([
    db.select().from(posts).where(eq(posts.websiteId, site.id)).orderBy(posts.updatedAt),
    db.select().from(postTypes).where(eq(postTypes.websiteId, site.id)),
  ]);

  const globalTypes = await db.select().from(postTypes).where(eq(postTypes.active, true));
  const allTypes = [...globalTypes.filter(t => !t.websiteId), ...contentTypes];

  const filteredPosts = activeType
    ? sitePosts.filter(p => p.postType === activeType)
    : sitePosts;

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
