/**
 * Apps index — lists the registered plugins the active client is entitled to.
 *
 * Without this page, the sidebar's "Apps" parent item (href: /portal/apps)
 * resolves to a Next.js 404 because the only route under /portal/apps is the
 * catch-all `[appId]/[[...slug]]`. This page provides the landing target.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { loadUserApps } from '@/lib/plugins/load-user-apps';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';

export const dynamic = 'force-dynamic';

export default async function PortalAppsIndex() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const apps = await loadUserApps(client.id);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <PortalPageHeader
        eyebrow="Apps"
        title="Apps"
        subtitle="Installed plugins available to your account."
      />

      {apps.length === 0 ? (
        <div className="border border-border rounded-2xl p-10 text-center bg-card">
          <span className="material-icons text-5xl text-muted-foreground mb-3 block">
            extension_off
          </span>
          <h2 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground mb-1">
            No apps installed
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Your account does not have any plugins enabled yet. Contact your
            account manager at Simpler Development to add one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Link
              key={app.slug}
              href={`/portal/apps/${app.slug}`}
              className="group block border border-border rounded-2xl p-5 bg-card hover:border-foreground/30 hover:shadow-sm transition"
            >
              <div className="flex items-start gap-3">
                <span className="material-icons text-3xl text-foreground/80 group-hover:text-foreground">
                  {app.icon || 'apps'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground truncate">
                      {app.name}
                    </h2>
                    {app.manifestStale && (
                      <span
                        className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800"
                        title="Manifest was served from cache after a failed refresh"
                      >
                        stale
                      </span>
                    )}
                  </div>
                  {app.navItems.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {app.navItems.map((n) => n.label).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="material-icons text-base text-muted-foreground group-hover:text-foreground transition">
                  arrow_forward
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
