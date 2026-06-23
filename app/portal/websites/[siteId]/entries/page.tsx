import { db } from '@/lib/db';
import { clientWebsites, posts, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolvePortalSite } from '@/lib/portal-client';
import ContentList from '../ContentList';
import UploadHtmlPageButton from '@/components/portal/UploadHtmlPageButton';

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sitePosts.length} total &middot; {sitePosts.filter(p => p.published).length} published &middot; {sitePosts.filter(p => !p.published).length} drafts
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/portal/websites/${site.id}/calendar`}
            className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors"
          >
            <span className="material-icons text-base">calendar_month</span>
            Calendar
          </Link>
          <UploadHtmlPageButton siteId={site.id} />
          <Link
            href={`/portal/websites/${site.id}/posts/new`}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add</span>
            New Entry
          </Link>
        </div>
      </div>

      <ContentList
        siteId={site.id}
        posts={filteredPosts}
        contentTypes={allTypes.map(t => ({ slug: t.slug, name: t.name, icon: t.icon || 'description' }))}
        activeType={activeType || null}
      />
    </div>
  );
}
