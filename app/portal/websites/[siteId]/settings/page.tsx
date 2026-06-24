import { db } from '@/lib/db';
import { clientWebsites, siteTracking, websiteDomains, websiteEnvironments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolvePortalSite } from '@/lib/portal-client';
import ProvisioningStatus from '@/components/portal/ProvisioningStatus';
import DeploymentList from '@/components/portal/DeploymentList';
import GitHubConnectButton from '@/components/portal/GitHubConnectButton';
import CustomDomainForm from '@/components/portal/CustomDomainForm';
import WebsiteSettingsForm from '@/components/portal/WebsiteSettingsForm';
import DeleteWebsiteButton from '@/components/portal/DeleteWebsiteButton';
import GoogleConnectionCard from '@/components/portal/GoogleConnectionCard';
import HttpLogViewer from '@/components/portal/HttpLogViewer';
import InfrastructureTabs from '@/components/portal/InfrastructureTabs';
import EnvironmentPanel from '@/components/portal/EnvironmentPanel';
import CopyableSiteId from '@/components/portal/CopyableSiteId';
import DeveloperSetup from '@/components/portal/DeveloperSetup';
import RepoConnectionManager from '@/components/portal/RepoConnectionManager';
import TrackingSettingsCard from '@/components/portal/TrackingSettingsCard';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';

export default async function WebsiteSettingsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) notFound();
  const { site, client } = resolved;

  const [domains, environments, trackingRows] = await Promise.all([
    db.select().from(websiteDomains)
      .where(eq(websiteDomains.websiteId, site.id))
      .orderBy(websiteDomains.createdAt),
    db.select().from(websiteEnvironments)
      .where(eq(websiteEnvironments.websiteId, site.id))
      .orderBy(websiteEnvironments.name),
    db.select().from(siteTracking)
      .where(eq(siteTracking.websiteId, site.id))
      .limit(1),
  ]);
  const trackingRow = trackingRows[0] ?? null;
  // Project the row to the shape the client expects: string/null per provider
  // key, plus the `enabled` flag mixed in. Excludes id/websiteId/timestamps
  // which the form doesn't need.
  const trackingInitial: import('@/lib/site-tracking/providers').TrackingConfigClient | null = trackingRow
    ? {
        gaMeasurementId: trackingRow.gaMeasurementId,
        gtmContainerId: trackingRow.gtmContainerId,
        metaPixelId: trackingRow.metaPixelId,
        clarityProjectId: trackingRow.clarityProjectId,
        hotjarSiteId: trackingRow.hotjarSiteId,
        linkedinPartnerId: trackingRow.linkedinPartnerId,
        tiktokPixelId: trackingRow.tiktokPixelId,
        gscVerification: trackingRow.gscVerification,
        bingVerification: trackingRow.bingVerification,
        pinterestVerification: trackingRow.pinterestVerification,
        customHeadHtml: trackingRow.customHeadHtml,
        customBodyHtml: trackingRow.customBodyHtml,
        enabled: trackingRow.enabled,
      }
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header — site identity + back lives in WebsiteSubNav, this is just the
          page title. */}
      <PortalPageHeader
        eyebrow="Website"
        title="Settings"
        subtitle="Manage deployment, domain, repository access, and general settings."
      />

      {/* Site ID */}
      <CopyableSiteId siteId={site.id} />

      {/* General Settings */}
      <WebsiteSettingsForm
        siteId={site.id}
        initialName={site.name}
        initialDescription={site.description || ''}
        subdomain={site.subdomain || undefined}
        initialPublicAccess={site.publicAccess}
        initialPreviewCode={site.previewCode || null}
      />

      {/* Custom Domains */}
      <CustomDomainForm siteId={site.id} initialDomains={domains} />

      {/* Repository Connection */}
      <RepoConnectionManager
        siteId={site.id}
        initialRepoName={site.githubRepoName}
        initialRepoUrl={site.githubRepoUrl}
        initialBranch={site.deployBranch}
      />

      {/* Environments (env vars, backups, copy) */}
      {environments.length > 0 && (
        <EnvironmentPanel siteId={site.id} environments={environments} />
      )}

      {/* Developer Setup — npm package installation instructions */}
      {site.deploymentStatus === 'active' && (
        <DeveloperSetup siteId={site.id} />
      )}

      {/* Infrastructure / Deployments / Logs */}
      <InfrastructureTabs
        infrastructure={<ProvisioningStatus siteId={site.id} />}
        deployments={<DeploymentList siteId={site.id} />}
        logs={<HttpLogViewer siteId={site.id} />}
      />

      {/* Integrations */}
      {site.deploymentStatus === 'active' && (
        <>
          <GitHubConnectButton siteId={site.id} />
          <GoogleConnectionCard
            siteId={site.id}
            websiteDomain={site.domain || (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : null)}
            websiteName={site.name}
          />
          <TrackingSettingsCard siteId={site.id} initialConfig={trackingInitial} />
        </>
      )}

      {/* Automations & Notifications link */}
      {site.deploymentStatus === 'active' && (
        <Link
          href={`/portal/websites/${site.id}/automations`}
          className="flex items-center justify-between bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="material-icons text-muted-foreground text-lg group-hover:text-primary transition-colors">bolt</span>
            <div>
              <h3 className="font-semibold text-sm text-foreground">Automations & Notifications</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Configure automated workflows and event alerts</p>
            </div>
          </div>
          <span className="material-icons text-muted-foreground text-base group-hover:text-foreground transition-colors">chevron_right</span>
        </Link>
      )}

      {/* Danger Zone */}
      <DeleteWebsiteButton siteId={site.id} siteName={site.name} />
    </div>
  );
}
