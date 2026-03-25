import { db } from '@/lib/db';
import { hostedSites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
import type { DnsInstruction } from '@/lib/db/schema';

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
const planLabel: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export default async function PortalHostingSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const [site] = await db
    .select()
    .from(hostedSites)
    .where(and(eq(hostedSites.id, parseInt(id)), eq(hostedSites.clientId, client.id)))
    .limit(1);

  if (!site) notFound();

  const dnsInstructions = (site.dnsInstructions as DnsInstruction[]) || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/portal/hosting"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Back to Hosting
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{site.name}</h1>
          {site.customDomain && (
            <p className="text-muted-foreground font-mono mt-1">{site.customDomain}</p>
          )}
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusColor[site.status] || 'bg-gray-100 text-gray-700'}`}>
          <span className="material-icons text-sm">{statusIcon[site.status] || 'help'}</span>
          {site.status.charAt(0).toUpperCase() + site.status.slice(1)}
        </span>
      </div>

      {/* Status banner for provisioning */}
      {site.status === 'provisioning' && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl dark:bg-yellow-900/20 dark:border-yellow-800">
          <span className="material-icons text-yellow-600 mt-0.5">hourglass_empty</span>
          <div>
            <p className="font-medium text-sm text-yellow-800 dark:text-yellow-300">Your site is being provisioned</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
              Our team is setting up your Railway environment. We&apos;ll notify you when it&apos;s ready.
            </p>
          </div>
        </div>
      )}

      {site.status === 'suspended' && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl dark:bg-orange-900/20 dark:border-orange-800">
          <span className="material-icons text-orange-600 mt-0.5">pause_circle</span>
          <div>
            <p className="font-medium text-sm text-orange-800 dark:text-orange-300">Site is suspended</p>
            <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
              Contact us to reactivate your hosting.
            </p>
          </div>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Plan</p>
          <p className="font-semibold text-foreground">{planLabel[site.plan] || site.plan}</p>
        </div>
        {site.renewalDate && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Renewal Date</p>
            <p className="font-semibold text-foreground">{new Date(site.renewalDate).toLocaleDateString()}</p>
          </div>
        )}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Since</p>
          <p className="font-semibold text-foreground">{new Date(site.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Domain / URLs */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20">
          <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">language</span>
            Domain &amp; URLs
          </h2>
        </div>
        <div className="p-4 space-y-3">
          {site.customDomain ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Your Domain</p>
                <p className="font-mono text-sm text-foreground mt-0.5">{site.customDomain}</p>
              </div>
              {site.status === 'active' && (
                <a
                  href={`https://${site.customDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                >
                  <span className="material-icons text-sm">open_in_new</span>
                  Visit
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No custom domain configured yet. Contact us to set one up.</p>
          )}

          {site.railwayDomain && (
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Railway Deployment URL</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">{site.railwayDomain}</p>
              </div>
              <a
                href={`https://${site.railwayDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                <span className="material-icons text-sm">open_in_new</span>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* DNS Configuration */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20">
          <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-primary">dns</span>
            DNS Configuration
          </h2>
        </div>

        {dnsInstructions.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <span className="material-icons text-3xl mb-2 block">dns</span>
            No DNS records configured yet.
            {site.status === 'provisioning' && ' They will appear here once your site is ready.'}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Add the following records at your domain registrar (e.g. GoDaddy, Namecheap, Cloudflare) to point your domain to your hosted site.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Host / Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Value / Points To</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {dnsInstructions.map((record, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-bold font-mono">
                          {record.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-foreground">{record.host}</td>
                      <td className="px-4 py-3 font-mono text-sm text-foreground break-all">{record.value}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{record.ttl || 'Auto'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dnsInstructions.some(r => r.notes) && (
              <div className="space-y-2">
                {dnsInstructions.filter(r => r.notes).map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                    <span className="material-icons text-sm mt-0.5">info</span>
                    <span><strong className="text-foreground">{r.type} {r.host}:</strong> {r.notes}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-800">
              <span className="material-icons text-blue-600 text-sm mt-0.5">schedule</span>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                DNS changes can take up to 24–48 hours to propagate globally. Once pointed correctly, your site will be live at your custom domain.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Help */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <span className="material-icons text-primary mt-0.5">support_agent</span>
        <div className="text-sm">
          <p className="font-medium text-foreground">Need help?</p>
          <p className="text-muted-foreground mt-0.5">
            Having trouble with DNS or your hosting setup?{' '}
            <Link href="/portal/tickets/new" className="text-primary hover:underline">Open a support ticket</Link>{' '}
            and our team will help you get configured.
          </p>
        </div>
      </div>
    </div>
  );
}
