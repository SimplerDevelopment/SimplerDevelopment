import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getPortalClient } from '@/lib/portal-client';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import { revoke } from '@/lib/google/oauth';

interface PageProps {
  searchParams: Promise<{ workspace_connected?: string; workspace_error?: string }>;
}

const SETTINGS_INTEGRATIONS_PATH = '/portal/settings/integrations';

const SCOPE_LABELS: Record<string, string> = {
  'openid': 'Identify your account',
  'https://www.googleapis.com/auth/userinfo.email': 'Email',
  'https://www.googleapis.com/auth/userinfo.profile': 'Profile',
  'https://www.googleapis.com/auth/gmail.readonly': 'Read Gmail',
  'https://www.googleapis.com/auth/calendar.readonly': 'Read Calendar',
  'https://www.googleapis.com/auth/calendar.events.readonly': 'Read Calendar events',
  'https://www.googleapis.com/auth/drive': 'Full Drive access',
  'https://www.googleapis.com/auth/drive.metadata.readonly': 'Drive metadata',
  'https://www.googleapis.com/auth/contacts.readonly': 'Read Contacts',
};

export default async function SettingsIntegrationsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const userId = parseInt(session.user.id, 10);

  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const tenant = await getTenantWorkspaceCredentialsByClientId(client.id);
  const params = await searchParams;
  const justConnected = params.workspace_connected === '1';
  const errorMessage = params.workspace_error;

  const rows = tenant
    ? await db
        .select()
        .from(googleWorkspaceUserConnections)
        .where(
          and(
            eq(googleWorkspaceUserConnections.clientId, client.id),
            eq(googleWorkspaceUserConnections.userId, userId),
            isNull(googleWorkspaceUserConnections.revokedAt)
          )
        )
        .limit(1)
    : [];
  const connection = rows[0];

  async function disconnectAction() {
    'use server';
    const innerSession = await auth();
    if (!innerSession?.user?.id) return;
    const innerUserId = parseInt(innerSession.user.id, 10);
    const innerClient = await getPortalClient(innerUserId);
    if (!innerClient) return;

    const innerRows = await db
      .select()
      .from(googleWorkspaceUserConnections)
      .where(
        and(
          eq(googleWorkspaceUserConnections.clientId, innerClient.id),
          eq(googleWorkspaceUserConnections.userId, innerUserId),
          isNull(googleWorkspaceUserConnections.revokedAt)
        )
      )
      .limit(1);
    const innerConnection = innerRows[0];
    if (!innerConnection) {
      revalidatePath(SETTINGS_INTEGRATIONS_PATH);
      return;
    }

    try {
      const innerTenant = await getTenantWorkspaceCredentialsByClientId(innerClient.id);
      if (innerTenant) {
        await revoke(innerConnection.refreshToken, innerTenant.oauth);
      }
    } catch {
      // Best effort — fall through to local cleanup either way.
    }

    await db
      .update(googleWorkspaceUserConnections)
      .set({
        accessToken: '',
        refreshToken: '',
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(googleWorkspaceUserConnections.id, innerConnection.id));

    revalidatePath(SETTINGS_INTEGRATIONS_PATH);
  }

  return (
    <div className="space-y-6">
      {justConnected && (
        <div className="border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 rounded-xl p-4 flex items-start gap-3">
          <span className="material-icons text-base mt-0.5">check_circle</span>
          <div className="text-sm">
            Connected. Initial sync starts within a minute and may take up to an hour to backfill.
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 rounded-xl p-4 flex items-start gap-3">
          <span className="material-icons text-base mt-0.5">error</span>
          <div className="text-sm">
            Google returned an error: <code className="font-mono">{errorMessage}</code>. Try again, or contact support if it persists.
          </div>
        </div>
      )}

      {/* Section header for the Google Workspace integration. Future integrations
          (Slack, etc.) will sit as additional sections on this same page. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Google Workspace</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Connect your Google account so the brain can ingest your Gmail, Calendar, Drive, and Contacts.
            Read-only — we never send email or change your data.
          </p>
        </div>
      </div>

      {!tenant && (
        <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center text-center">
          <span className="material-icons text-5xl text-muted-foreground mb-3">workspace_premium</span>
          <h3 className="font-semibold text-foreground mb-1">Workspace integration is an enterprise feature</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            This account uses standard email tracking (incoming mail to your SimplerDevelopment domain). To enable
            full Workspace ingestion (sent mail, calendar, Drive, contacts), upgrade and we&apos;ll provision
            the integration with your Google Workspace.
          </p>
          <a
            href="/portal/tickets/new?subject=Workspace+integration+upgrade"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">support_agent</span>
            Request upgrade
          </a>
        </div>
      )}

      {tenant && tenant.status !== 'active' && tenant.status !== 'configured' && (
        <div className="bg-card border border-border rounded-xl p-6 flex items-start gap-3">
          <span className="material-icons text-2xl text-muted-foreground">pause_circle</span>
          <div>
            <h3 className="font-semibold text-foreground">Workspace integration paused</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Status: <code className="font-mono">{tenant.status}</code>. Contact your SimplerDevelopment administrator to resume.
            </p>
          </div>
        </div>
      )}

      {tenant && (tenant.status === 'active' || tenant.status === 'configured') && !connection && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="material-icons text-2xl text-muted-foreground">link_off</span>
            <div>
              <h3 className="font-semibold text-foreground">Not connected</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your Google Workspace account ({session.user.email ?? 'your work email'}) to enable the brain.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`/api/portal/integrations/google/connect?returnTo=${encodeURIComponent(SETTINGS_INTEGRATIONS_PATH)}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">link</span>
              Connect Google Workspace
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            You&apos;ll be redirected to Google to grant read-only access. SimplerDevelopment never sends email or modifies your account.
          </p>
        </div>
      )}

      {tenant && connection && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <span className="material-icons text-2xl text-green-600 dark:text-green-500">check_circle</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">Connected</h3>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {connection.googleAccountEmail}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Connected {new Date(connection.createdAt).toLocaleDateString()}
                {connection.lastSyncAt && (
                  <> · Last sync {new Date(connection.lastSyncAt).toLocaleString()}</>
                )}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Granted access</h4>
            <ul className="space-y-1.5">
              {(connection.scopes ?? [])
                .filter((s) => SCOPE_LABELS[s] && s !== 'openid' && !s.includes('userinfo'))
                .map((s) => (
                  <li key={s} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="material-icons text-base text-green-600 dark:text-green-500">check</span>
                    {SCOPE_LABELS[s]}
                  </li>
                ))}
            </ul>
          </div>

          <form action={disconnectAction}>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-medium hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
            >
              <span className="material-icons text-base">link_off</span>
              Disconnect
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
