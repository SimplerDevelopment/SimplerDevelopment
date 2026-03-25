import { db } from '@/lib/db';
import { clientWebsites, posts } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';

const postTypeIcon: Record<string, string> = {
  page: 'article',
  blog: 'rss_feed',
  landing: 'web',
};

export default async function PortalCmsSitePage({
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

  const sitePosts = await db
    .select()
    .from(posts)
    .where(eq(posts.websiteId, site.id))
    .orderBy(posts.updatedAt);

  const published = sitePosts.filter(p => p.published);
  const drafts = sitePosts.filter(p => !p.published);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/portal/cms"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        All Websites
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{site.name}</h1>
          {site.domain && <p className="text-muted-foreground font-mono text-sm mt-1">{site.domain}</p>}
        </div>
        <Link
          href={`/portal/cms/${site.id}/posts/new`}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <span className="material-icons text-base">add</span>
          New Page
        </Link>
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

      {/* Content list */}
      {sitePosts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-4xl text-muted-foreground mb-2">article</span>
          <h2 className="font-semibold text-foreground mb-1">No pages yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Create your first page to start building your website content.</p>
          <Link
            href={`/portal/cms/${site.id}/posts/new`}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add</span>
            Create First Page
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Pages &amp; Posts</h2>
          </div>
          <ul className="divide-y divide-border">
            {sitePosts.map(post => (
              <li key={post.id}>
                <Link
                  href={`/portal/cms/${site.id}/posts/${post.id}/edit`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors group"
                >
                  <span className="material-icons text-muted-foreground text-xl shrink-0">
                    {postTypeIcon[post.postType] || 'article'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {post.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">/{post.slug}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      post.published
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <span className="material-icons text-xs">{post.published ? 'check_circle' : 'edit'}</span>
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="material-icons text-muted-foreground text-base opacity-0 group-hover:opacity-100 transition-opacity">
                      edit
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
