import { db } from '@/lib/db';
import { clientWebsites, posts, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
import ContentList from './ContentList';

export default async function PortalCmsSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ created?: string; type?: string }>;
}) {
  const { siteId } = await params;
  const { created, type: activeType } = await searchParams;
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

  const [sitePosts, contentTypes] = await Promise.all([
    db.select().from(posts).where(eq(posts.websiteId, site.id)).orderBy(posts.updatedAt),
    db.select().from(postTypes).where(
      eq(postTypes.websiteId, site.id),
    ),
  ]);

  // Also get global (built-in) content types
  const globalTypes = await db.select().from(postTypes).where(eq(postTypes.active, true));
  const allTypes = [...globalTypes.filter(t => !t.websiteId), ...contentTypes];

  const filteredPosts = activeType
    ? sitePosts.filter(p => p.postType === activeType)
    : sitePosts;
  const published = filteredPosts.filter(p => p.published);
  const drafts = filteredPosts.filter(p => !p.published);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/portal/websites"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        All Websites
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{site.name}</h1>
          {site.subdomain && (
            <p className="text-muted-foreground font-mono text-sm mt-1">
              {site.subdomain}.simplerdevelopment.com
              {site.domain && <span className="text-muted-foreground/60"> | {site.domain}</span>}
            </p>
          )}
          {!site.subdomain && site.domain && <p className="text-muted-foreground font-mono text-sm mt-1">{site.domain}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/portal/websites/${site.id}/calendar`}
            className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors"
          >
            <span className="material-icons text-base">calendar_month</span>
            Calendar
          </Link>
          <Link
            href={`/portal/websites/${site.id}/posts/new`}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add</span>
            New Page
          </Link>
        </div>
      </div>

      {created === '1' && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
          <span className="material-icons text-green-600">check_circle</span>
          <div>
            <p className="font-medium text-sm">Website created successfully!</p>
            <p className="text-xs mt-0.5">Create your first page to start building your site.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Pages</p>
          <p className="text-2xl font-bold text-foreground">{sitePosts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Published</p>
          <p className="text-2xl font-bold text-green-600">{published.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Drafts</p>
          <p className="text-2xl font-bold text-muted-foreground">{drafts.length}</p>
        </div>
      </div>

      {/* Content type tabs + list */}
      <ContentList
        siteId={site.id}
        posts={filteredPosts}
        contentTypes={allTypes.map(t => ({ slug: t.slug, name: t.name, icon: t.icon || 'description' }))}
        activeType={activeType || null}
      />
    </div>
  );
}
