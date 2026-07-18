import { db } from '@/lib/db';
import { hostedSites, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCard } from '@/components/portal/portal-ui';

const statusColor: Record<string, string> = {
  provisioning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};
const statusIcon: Record<string, string> = {
  provisioning: 'hourglass_empty',
  active: 'check_circle',
  suspended: 'pause_circle',
  cancelled: 'cancel',
};
const planIcon: Record<string, string> = {
  starter: 'rocket_launch',
  pro: 'bolt',
  enterprise: 'business',
};
const planLabel: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export default async function PortalHostingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const sites = await db
    .select()
    .from(hostedSites)
    .where(eq(hostedSites.clientId, client.id))
    .orderBy(hostedSites.createdAt);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Infrastructure"
        title="Hosting"
        subtitle="Your managed hosting environments, powered by Railway and managed by Simpler Development."
      />

      {sites.length === 0 ? (
        <div className={`${pCard} p-12 flex flex-col items-center text-center`}>
          <span className="material-icons text-5xl text-muted-foreground mb-3">cloud_off</span>
          <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground mb-1">No hosted sites yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            When Simpler Development provisions a hosting environment for you, it will appear here with status, domain info, and DNS setup instructions.
          </p>
          <Link
            href="/portal/tickets/new"
            className={`mt-4 ${pBtnPrimary}`}
          >
            <span className="material-icons text-base">support_agent</span>
            Request Hosting
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sites.map(site => (
            <Link
              key={site.id}
              href={`/portal/hosting/${site.id}`}
              className={`group ${pCard} rounded-2xl p-5 hover:border-primary/50 hover:shadow-sm transition-all space-y-4`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground group-hover:text-primary transition-colors truncate">
                    {site.name}
                  </h2>
                  {site.customDomain ? (
                    <p className="text-sm font-mono text-muted-foreground mt-0.5 truncate">{site.customDomain}</p>
                  ) : site.railwayDomain ? (
                    <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{site.railwayDomain}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Domain not configured</p>
                  )}
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[site.status] || 'bg-gray-100 text-gray-700'}`}>
                  <span className="material-icons text-xs">{statusIcon[site.status] || 'help'}</span>
                  {site.status}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="material-icons text-sm">{planIcon[site.plan] || 'cloud'}</span>
                  <span>{planLabel[site.plan] || site.plan} Plan</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="material-icons text-sm">dns</span>
                  <span>{(site.dnsInstructions as unknown[])?.length || 0} DNS record{((site.dnsInstructions as unknown[])?.length || 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {site.renewalDate && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border pt-3">
                  <span className="material-icons text-sm">calendar_today</span>
                  <span>Renews {new Date(site.renewalDate).toLocaleDateString()}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {sites.length > 0 && (
        <div className={`${pCard} rounded-2xl p-4 flex items-start gap-3`}>
          <span className="material-icons text-primary mt-0.5">info</span>
          <div className="text-sm">
            <p className="font-display font-extrabold tracking-[-0.01em] text-foreground">Need help with your hosting?</p>
            <p className="text-muted-foreground mt-0.5">
              Open a{' '}
              <Link href="/portal/tickets/new" className="text-primary hover:underline">support ticket</Link>
              {' '}and our team will assist you.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
