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
import RepoConnectionManager from '@/components/portal/RepoConnectionManager';
import TrackingSettingsCard from '@/components/portal/TrackingSettingsCard';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { hasFlag } from '@/lib/feature-flags';
import SettingsTabs from '@/components/portal/websites/SettingsTabs';
import { GhostCard } from '@/components/portal/EmptyState';

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

  // PUX-190: the same sections, hoisted so the flag-off stack and the tabbed
  // studio layout render identical nodes (no duplicate JSX, no remounting).
  const studio = hasFlag(client, 'portal-redesign');
  const siteIdNode = (
      <CopyableSiteId siteId={site.id} />
  );
  const generalNode = (
      <WebsiteSettingsForm
        siteId={site.id}
        initialName={site.name}
        initialDescription={site.description || ''}
        subdomain={site.subdomain || undefined}
        initialPublicAccess={site.publicAccess}
        initialPreviewCode={site.previewCode || null}
      />
  );
  const domainsNode = (
      <CustomDomainForm siteId={site.id} initialDomains={domains} />
  );
  const repoNode = (
      <RepoConnectionManager
        siteId={site.id}
        initialRepoName={site.githubRepoName}
        initialRepoUrl={site.githubRepoUrl}
        initialBranch={site.deployBranch}
      />
  );
  const envNode = (environments.length > 0 && (
        <EnvironmentPanel siteId={site.id} environments={environments} />
      ));
  const infraNode = (
      <InfrastructureTabs
        infrastructure={<ProvisioningStatus siteId={site.id} />}
        deployments={<DeploymentList siteId={site.id} />}
        logs={<HttpLogViewer siteId={site.id} />}
      />
  );
  const integrationsNode = (site.deploymentStatus === 'active' && (
        <>
          <GitHubConnectButton siteId={site.id} />
          <GoogleConnectionCard
            siteId={site.id}
            websiteDomain={site.domain || (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : null)}
            websiteName={site.name}
          />
        </>
      ));
  const trackingNode = (
      <TrackingSettingsCard
        siteId={site.id}
        initialConfig={trackingInitial}
        deployed={site.deploymentStatus === 'active'}
      />
  );
  const automationsNode = (site.deploymentStatus === 'active' && (
        <Link
          href={`/portal/websites/${site.id}/automations`}
          className="flex items-center justify-between bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="material-icons text-muted-foreground text-lg group-hover:text-primary transition-colors">bolt</span>
            <div>
              <h2 className="font-semibold text-sm text-foreground">Automations & Notifications</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Configure automated workflows and event alerts</p>
            </div>
          </div>
          <span className="material-icons text-muted-foreground text-base group-hover:text-foreground transition-colors">chevron_right</span>
        </Link>
      ));
  const dangerNode = (
      <DeleteWebsiteButton siteId={site.id} siteName={site.name} />
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header — site identity + back lives in WebsiteSubNav, this is just the
          page title. */}
      <PortalPageHeader
        eyebrow="Website"
        title="Settings"
        subtitle="Manage deployment, domain, repository access, and general settings."
      />

      {studio ? (
        <SettingsTabs
          panes={[
            { id: 'general', label: 'General', icon: 'tune', node: <>{siteIdNode}{generalNode}{trackingNode}</> },
            { id: 'domains', label: 'Domains', icon: 'language', node: domainsNode },
            { id: 'redirects', label: 'Redirects', icon: 'alt_route', node: <GhostCard icon="alt_route" title="Redirects are set through Claude today" body="Ask your assistant to list, add or remove redirects for this site — the website_redirects tools do it now; a form here is on the way." /> },
            { id: 'code', label: 'Code', icon: 'code', node: <><GhostCard icon="code" title="Custom CSS and JS are edited through Claude today" body="The sites custom-code tools stage and publish site-wide code; the editor for it lands here." />{repoNode}{envNode}{infraNode}{integrationsNode}</> },
            { id: 'emails', label: 'Emails', icon: 'mail', node: <><GhostCard icon="mail" title="Transactional email for this site" body="Sender name, templates and notification settings will live here. Automations and event alerts are already one tap away." />{automationsNode}</> },
            { id: 'danger', label: 'Danger', icon: 'warning', node: dangerNode },
          ]}
        />
      ) : (
        <>
      {siteIdNode}
      {generalNode}
      {domainsNode}
      {repoNode}
      {envNode}
      {infraNode}
      {integrationsNode}
      {trackingNode}
      {automationsNode}
      {dangerNode}
        </>
      )}
    </div>
  );
}
