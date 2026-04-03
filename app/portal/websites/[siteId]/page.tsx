import { db } from '@/lib/db';
import { clientWebsites, posts, postTypes } from '@/lib/db/schema';
import { and, eq, count, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';

export default async function PortalCmsDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { siteId } = await params;
  const { created } = await searchParams;
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
    db.select().from(postTypes).where(eq(postTypes.active, true)),
  ]);

  const published = sitePosts.filter(p => p.published);
  const drafts = sitePosts.filter(p => !p.published);
  const recentPosts = sitePosts.slice(-5).reverse();

  // Count posts by type
  const typeCounts: Record<string, number> = {};
  for (const p of sitePosts) {
    typeCounts[p.postType] = (typeCounts[p.postType] || 0) + 1;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
            href={`/portal/websites/${site.id}/posts/new`}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add</span>
            New Entry
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Entries</p>
          <p className="text-2xl font-bold text-foreground">{sitePosts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Published</p>
          <p className="text-2xl font-bold text-green-600">{published.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Drafts</p>
          <p className="text-2xl font-bold text-yellow-600">{drafts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Content Types</p>
          <p className="text-2xl font-bold text-foreground">{Object.keys(typeCounts).length}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: `/portal/websites/${site.id}/entries`, icon: 'article', label: 'Entries' },
          { href: `/portal/websites/${site.id}/media`, icon: 'perm_media', label: 'Media' },
          { href: `/portal/websites/${site.id}/navigation`, icon: 'menu', label: 'Navigation' },
          { href: `/portal/websites/${site.id}/store`, icon: 'shopping_cart', label: 'Store' },
          { href: `/portal/websites/${site.id}/taxonomy`, icon: 'account_tree', label: 'Taxonomy' },
          { href: `/portal/websites/${site.id}/content-types`, icon: 'description', label: 'Content Types' },
          { href: `/portal/websites/${site.id}/calendar`, icon: 'calendar_month', label: 'Calendar' },
          { href: `/portal/websites/${site.id}/settings`, icon: 'settings', label: 'Settings' },
        ].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:bg-accent/50 transition-colors"
          >
            <span className="material-icons text-xl text-muted-foreground">{link.icon}</span>
            <span className="text-sm font-medium text-foreground">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent entries */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Recent Entries</h2>
          <Link
            href={`/portal/websites/${site.id}/entries`}
            className="text-xs text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        {recentPosts.length === 0 ? (
          <div className="p-8 text-center">
            <span className="material-icons text-4xl text-muted-foreground/30">article</span>
            <p className="text-sm text-muted-foreground mt-2">No entries yet. Create your first page to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentPosts.map(post => (
              <Link
                key={post.id}
                href={`/portal/websites/${site.id}/posts/${post.id}/edit`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-accent/50 transition-colors"
              >
                <span className="material-icons text-base text-muted-foreground">
                  {post.postType === 'blog' ? 'rss_feed' : 'description'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.postType} &middot; {new Date(post.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  post.published
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                }`}>
                  {post.published ? 'Published' : 'Draft'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Content type breakdown */}
      {Object.keys(typeCounts).length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">By Content Type</h2>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(typeCounts).map(([type, cnt]) => {
              const ct = contentTypes.find(t => t.slug === type);
              return (
                <Link
                  key={type}
                  href={`/portal/websites/${site.id}/entries?type=${type}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-accent/50 transition-colors"
                >
                  <span className="material-icons text-base text-muted-foreground">{ct?.icon || 'description'}</span>
                  <span className="text-sm font-medium text-foreground flex-1">{ct?.name || type}</span>
                  <span className="text-sm text-muted-foreground">{cnt}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
