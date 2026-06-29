import { db } from '@/lib/db';
import { clientWebsites, hostedSites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import Link from 'next/link';

const deploymentStatusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  provisioning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export default async function HostingStatusWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [websites, hosted] = await Promise.all([
    db
      .select({
        id: clientWebsites.id,
        name: clientWebsites.name,
        domain: clientWebsites.domain,
        subdomain: clientWebsites.subdomain,
        deploymentStatus: clientWebsites.deploymentStatus,
      })
      .from(clientWebsites)
      .where(eq(clientWebsites.clientId, clientId))
      .limit(5),
    db
      .select({
        id: hostedSites.id,
        name: hostedSites.name,
        customDomain: hostedSites.customDomain,
        railwayDomain: hostedSites.railwayDomain,
        status: hostedSites.status,
      })
      .from(hostedSites)
      .where(eq(hostedSites.clientId, clientId))
      .limit(5),
  ]);

  const totalSites = websites.length + hosted.length;

  return (
    <div>
      <div className="mb-3">
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{totalSites}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          site{totalSites !== 1 ? 's' : ''} hosted
        </span>
      </div>
      {totalSites === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No sites yet.{' '}
          <Link href="/portal/hosting" className="text-primary hover:underline">
            Set up hosting
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {websites.map((site) => {
            const displayDomain =
              site.domain ??
              (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : site.name);
            const status = site.deploymentStatus ?? 'pending';
            return (
              <li key={`cw-${site.id}`}>
                <Link
                  href={`/portal/hosting/${site.id}`}
                  className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{site.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{displayDomain}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      deploymentStatusColor[status] ?? deploymentStatusColor.pending
                    }`}
                  >
                    {statusLabel(status)}
                  </span>
                </Link>
              </li>
            );
          })}
          {hosted.map((site) => {
            const displayDomain = site.customDomain ?? site.railwayDomain ?? site.name;
            const status = site.status;
            return (
              <li key={`hs-${site.id}`}>
                <Link
                  href="/portal/hosting"
                  className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{site.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{displayDomain}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      deploymentStatusColor[status] ?? deploymentStatusColor.pending
                    }`}
                  >
                    {statusLabel(status)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 pt-3 border-t border-border">
        <Link
          href="/portal/hosting"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <span className="material-icons text-sm">dns</span>
          View hosting details
        </Link>
      </div>
    </div>
  );
}
