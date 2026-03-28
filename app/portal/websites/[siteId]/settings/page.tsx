import { db } from '@/lib/db';
import { clientWebsites, websiteDomains, websiteEnvironments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
import ProvisioningStatus from '@/components/portal/ProvisioningStatus';
import DeploymentList from '@/components/portal/DeploymentList';
import GitHubConnectButton from '@/components/portal/GitHubConnectButton';
import WebsiteAutomationSettings from '@/components/portal/WebsiteAutomationSettings';
import CustomDomainForm from '@/components/portal/CustomDomainForm';
import WebsiteSettingsForm from '@/components/portal/WebsiteSettingsForm';
import DeleteWebsiteButton from '@/components/portal/DeleteWebsiteButton';
import GoogleConnectionCard from '@/components/portal/GoogleConnectionCard';
import HttpLogViewer from '@/components/portal/HttpLogViewer';
import InfrastructureTabs from '@/components/portal/InfrastructureTabs';
import EnvironmentPanel from '@/components/portal/EnvironmentPanel';
import CopyableSiteId from '@/components/portal/CopyableSiteId';
import DeveloperSetup from '@/components/portal/DeveloperSetup';

export default async function WebsiteSettingsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
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

  const [domains, environments] = await Promise.all([
    db.select().from(websiteDomains)
      .where(eq(websiteDomains.websiteId, site.id))
      .orderBy(websiteDomains.createdAt),
    db.select().from(websiteEnvironments)
      .where(eq(websiteEnvironments.websiteId, site.id))
      .orderBy(websiteEnvironments.name),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link
        href={`/portal/websites/${site.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Back to {site.name}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage deployment, domain, repository access, and general settings for {site.name}.
        </p>
      </div>

      {/* Site ID */}
      <CopyableSiteId siteId={site.id} />

      {/* General Settings */}
      <WebsiteSettingsForm
        siteId={site.id}
        initialName={site.name}
        initialDescription={site.description || ''}
        subdomain={site.subdomain || undefined}
      />

      {/* Custom Domains */}
      <CustomDomainForm siteId={site.id} initialDomains={domains} />

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
        </>
      )}

      {/* Automations */}
      {site.deploymentStatus === 'active' && (
        <div className="bg-card border border-border rounded-xl p-6">
          <WebsiteAutomationSettings />
        </div>
      )}

      {/* Danger Zone */}
      <DeleteWebsiteButton siteId={site.id} siteName={site.name} />
    </div>
  );
}
