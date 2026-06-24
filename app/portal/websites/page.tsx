import { db } from '@/lib/db';
import { clientWebsites, posts } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary } from '@/components/portal/portal-ui';

export default async function PortalCmsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const { created } = await searchParams;

  const websites = await db
    .select()
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id))
    .orderBy(clientWebsites.createdAt);

  const postCounts = websites.length > 0
    ? await db
        .select({ websiteId: posts.websiteId, count: sql<number>`count(*)::int` })
        .from(posts)
        .where(sql`${posts.websiteId} = ANY(ARRAY[${sql.raw(websites.map(w => w.id).join(','))}]::int[])`)
        .groupBy(posts.websiteId)
    : [];

  const countMap = Object.fromEntries(postCounts.map(r => [r.websiteId, r.count]));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Sites"
        title="Websites"
        subtitle="Manage pages and content for your websites."
        actions={
          <Link
            href="/portal/websites/new"
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>
            New Website
          </Link>
        }
      />

      {created === '1' && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
          <span className="material-icons text-green-600">check_circle</span>
          <div>
            <p className="font-medium text-sm">Website created!</p>
            <p className="text-xs mt-0.5">Start building by creating your first page.</p>
          </div>
        </div>
      )}

      {websites.length === 0 ? (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <span className="material-icons text-3xl text-primary">web</span>
            </div>
            <h2 className="font-semibold text-foreground mb-1">Set up your first website</h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Create a website and start managing your pages using the built-in block editor — no coding required.
            </p>
            <Link
              href="/portal/websites/new"
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">add</span>
              Create Website
            </Link>
          </div>

          <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
            <span className="material-icons text-muted-foreground">support_agent</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">Prefer we handle the setup?</p>
              <p className="text-muted-foreground text-xs mt-0.5">Open a ticket and our team will configure everything for you.</p>
            </div>
            <Link
              href="/portal/tickets/new"
              className="text-sm text-primary hover:underline shrink-0 flex items-center gap-1"
            >
              Get help
              <span className="material-icons text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {websites.map(site => {
              const total = countMap[site.id] || 0;
              return (
                <Link
                  key={site.id}
                  href={`/portal/websites/${site.id}`}
                  // Disable viewport prefetch on the websites list — each site
                  // detail route is a heavy RSC payload and prefetching every
                  // tile saturates the server.
                  prefetch={false}
                  className="group min-w-0 bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-icons text-primary text-lg">language</span>
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {site.name}
                        </h2>
                        {site.subdomain ? (
                          <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{site.subdomain}.simplerdevelopment.com</p>
                        ) : site.domain ? (
                          <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{site.domain}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">No domain yet</p>
                        )}
                      </div>
                    </div>
                    {(() => {
                      const ds = site.deploymentStatus;
                      if (ds === 'active') return (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <span className="material-icons text-xs">check_circle</span>Live
                        </span>
                      );
                      if (ds === 'provisioning') return (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          <span className="material-icons text-xs animate-spin">settings</span>Setting up
                        </span>
                      );
                      if (ds === 'failed') return (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <span className="material-icons text-xs">error</span>Failed
                        </span>
                      );
                      return (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          <span className="material-icons text-xs">pending</span>Pending
                        </span>
                      );
                    })()}
                  </div>

                  {site.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{site.description}</p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                    <div className="flex items-center gap-1">
                      <span className="material-icons text-sm">article</span>
                      <span>{total} {total === 1 ? 'page' : 'pages'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Open</span>
                      <span className="material-icons text-sm">arrow_forward</span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* Add another */}
            <Link
              href="/portal/websites/new"
              className="group border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center text-center hover:border-primary/40 hover:bg-primary/3 transition-all min-h-36"
            >
              <span className="material-icons text-2xl text-muted-foreground group-hover:text-primary transition-colors mb-1">add_circle_outline</span>
              <p className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">Add another website</p>
            </Link>
          </div>

          <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
            <span className="material-icons text-muted-foreground">support_agent</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">Need help with your website?</p>
              <p className="text-muted-foreground text-xs mt-0.5">Our team can assist with setup, DNS, or content.</p>
            </div>
            <Link
              href="/portal/tickets/new"
              className="text-sm text-primary hover:underline shrink-0 flex items-center gap-1"
            >
              Open a ticket
              <span className="material-icons text-sm">arrow_forward</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
