import { db } from '@/lib/db';
import { clientWebsites, posts, postTypes } from '@/lib/db/schema';
import { and, eq, count, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolvePortalSite } from '@/lib/portal-client';
import ApiKeysManager from '@/components/portal/ApiKeysManager';
import UploadHtmlPageButton from '@/components/portal/UploadHtmlPageButton';
import CreateSnapshotButton from '@/components/portal/CreateSnapshotButton';

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
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) notFound();
  const { site } = resolved;

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
      {/* Page header — the shared layout (WebsiteSubNav) owns the site name +
          domain + +Entry button; this page is the dashboard, so its title
          reflects that. */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of your content, types, and entries.</p>
        </div>
        <div className="flex items-center gap-2">
          <CreateSnapshotButton siteId={site.id} siteName={site.name} />
          <UploadHtmlPageButton siteId={site.id} />
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

      {/* Quick links — grouped so authors find related areas together. */}
      <div className="space-y-5">
        <DashboardLinkGroup
          title="Content"
          links={[
            { href: `/portal/websites/${site.id}/entries`, icon: 'article', label: 'Entries', desc: 'All posts, pages and CPT entries' },
            { href: `/portal/websites/${site.id}/content-types`, icon: 'description', label: 'Content Types', desc: 'Templates, fields, and code per type' },
            { href: `/portal/websites/${site.id}/taxonomy`, icon: 'account_tree', label: 'Taxonomy', desc: 'Categories, tags, custom taxonomies' },
            { href: `/portal/websites/${site.id}/calendar`, icon: 'calendar_month', label: 'Calendar', desc: 'Schedule and publish view' },
            { href: '/portal/media', icon: 'perm_media', label: 'Media', desc: 'Shared media library' },
          ]}
        />
        <DashboardLinkGroup
          title="Design"
          links={[
            { href: `/portal/websites/${site.id}/branding`, icon: 'palette', label: 'Branding', desc: 'Logo, colors, fonts, button styles' },
            { href: `/portal/websites/${site.id}/navigation`, icon: 'menu', label: 'Navigation', desc: 'Site nav menu and footer links' },
            { href: `/portal/websites/${site.id}/code`, icon: 'code', label: 'Custom Code', desc: 'Site-wide CSS & JS' },
          ]}
        />
        <DashboardLinkGroup
          title="Engagement"
          links={[
            { href: `/portal/websites/${site.id}/automations`, icon: 'bolt', label: 'Automations', desc: 'Notifications and workflow triggers' },
            { href: `/portal/websites/${site.id}/email`, icon: 'mail', label: 'Email', desc: 'Transactional & marketing templates' },
            { href: `/portal/websites/${site.id}/store`, icon: 'shopping_cart', label: 'Store', desc: 'Products, orders, checkout' },
          ]}
        />
        <DashboardLinkGroup
          title="System"
          links={[
            { href: `/portal/websites/${site.id}/settings`, icon: 'settings', label: 'Settings', desc: 'Domains, deployments, environments' },
            { href: '#api-keys', icon: 'vpn_key', label: 'Developer', desc: 'API keys for SDK / REST access' },
          ]}
        />
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

      {/* API Keys / Developer */}
      <div id="api-keys" className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base">code</span>
            Developer API Keys
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Create API keys to access your site data via the SDK or REST API.
          </p>
        </div>
        <div className="p-5">
          <ApiKeysManager siteId={site.id} />
        </div>
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

interface DashboardLink {
  href: string;
  icon: string;
  label: string;
  desc: string;
}

function DashboardLinkGroup({ title, links }: { title: string; links: DashboardLink[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-start gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:bg-accent/40 transition-colors"
          >
            <span className="material-icons text-xl text-muted-foreground group-hover:text-primary transition-colors shrink-0">
              {link.icon}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {link.label}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{link.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
