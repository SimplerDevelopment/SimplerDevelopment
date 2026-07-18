import { db } from '@/lib/db';
import { clientWebsites, posts } from '@/lib/db/schema';
import { eq, and, count, desc, inArray } from 'drizzle-orm';
import Link from 'next/link';

export default async function WebsitesGlanceWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  // Resolve the client's active site ids first
  const siteRows = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.active, true)));

  const siteIds = siteRows.map((r) => r.id);
  const activeCount = siteIds.length;

  if (activeCount === 0) {
    return (
      <div>
        <div className="mb-3">
          <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">0</span>
          <span className="ml-2 text-sm text-muted-foreground">active websites</span>
        </div>
        <p className="text-sm text-muted-foreground py-2 text-center">No websites yet.</p>
        <div className="mt-3 text-center">
          <Link
            href="/portal/websites"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">add_circle_outline</span>
            Create your first website
          </Link>
        </div>
      </div>
    );
  }

  // Parallel: total post count, published count, draft count, 3 most recent drafts
  const [totalResult, publishedResult, recentDrafts] = await Promise.all([
    db
      .select({ count: count() })
      .from(posts)
      .where(inArray(posts.websiteId, siteIds)),
    db
      .select({ count: count() })
      .from(posts)
      .where(and(inArray(posts.websiteId, siteIds), eq(posts.published, true))),
    db
      .select({
        id: posts.id,
        title: posts.title,
        websiteId: posts.websiteId,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .where(and(inArray(posts.websiteId, siteIds), eq(posts.published, false)))
      .orderBy(desc(posts.updatedAt))
      .limit(3),
  ]);

  const totalPosts = totalResult[0]?.count ?? 0;
  const publishedCount = publishedResult[0]?.count ?? 0;
  const draftCount = totalPosts - publishedCount;

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-4">
        <div>
          <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{activeCount}</span>
          <span className="ml-2 text-sm text-muted-foreground">
            active site{activeCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{publishedCount}</span> published
          {' / '}
          <span className="font-medium text-foreground">{draftCount}</span> draft
        </div>
      </div>

      {recentDrafts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">No draft posts.</p>
      ) : (
        <ul className="space-y-2">
          {recentDrafts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/portal/websites/${p.websiteId}/posts/${p.id}`}
                className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 material-icons text-base text-muted-foreground">
                  edit_document
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 text-center">
        <Link
          href="/portal/websites"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          <span className="material-icons text-sm">web</span>
          Manage websites
        </Link>
      </div>
    </div>
  );
}
