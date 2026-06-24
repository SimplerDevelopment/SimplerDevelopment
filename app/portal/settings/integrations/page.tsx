import { db } from '@/lib/db';
import { googleWorkspaceUserConnections, microsoftTeamsUserConnections } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getPortalClient } from '@/lib/portal-client';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import { revoke } from '@/lib/google/oauth';
import { getEnvMicrosoftCredentials } from '@/lib/microsoft/oauth';
import { deleteTranscriptsSubscription } from '@/lib/microsoft/transcripts-watch';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

interface PageProps {
  searchParams: Promise<{
    workspace_connected?: string;
    workspace_error?: string;
    microsoft_connected?: string;
    microsoft_error?: string;
    microsoft_error_description?: string;
  }>;
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
  const microsoftJustConnected = params.microsoft_connected === '1';
  const microsoftErrorMessage = params.microsoft_error;
  const microsoftErrorDescription = params.microsoft_error_description;

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

  // Microsoft Teams — env-configured (no per-tenant credentials yet); the
  // env check decides whether the section is rendered at all.
  const microsoftConfigured =
    !!process.env.MICROSOFT_TEAMS_CLIENT_ID && !!process.env.MICROSOFT_TEAMS_CLIENT_SECRET;
  const microsoftRows = microsoftConfigured
    ? await db
        .select()
        .from(microsoftTeamsUserConnections)
        .where(
          and(
            eq(microsoftTeamsUserConnections.clientId, client.id),
            eq(microsoftTeamsUserConnections.userId, userId),
            isNull(microsoftTeamsUserConnections.revokedAt),
          ),
        )
        .limit(1)
    : [];
  const microsoftConnection = microsoftRows[0];

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

  async function disconnectMicrosoftAction() {
    'use server';
    const innerSession = await auth();
    if (!innerSession?.user?.id) return;
    const innerUserId = parseInt(innerSession.user.id, 10);
    const innerClient = await getPortalClient(innerUserId);
    if (!innerClient) return;

    const innerRows = await db
      .select()
      .from(microsoftTeamsUserConnections)
      .where(
        and(
          eq(microsoftTeamsUserConnections.clientId, innerClient.id),
          eq(microsoftTeamsUserConnections.userId, innerUserId),
          isNull(microsoftTeamsUserConnections.revokedAt),
        ),
      )
      .limit(1);
    const innerConnection = innerRows[0];
    if (!innerConnection) {
      revalidatePath(SETTINGS_INTEGRATIONS_PATH);
      return;
    }

    if (innerConnection.subscriptionId) {
      try {
        const credentials = getEnvMicrosoftCredentials(
          'https://www.simplerdevelopment.com/api/portal/integrations/microsoft/callback',
        );
        await deleteTranscriptsSubscription({
          connection: {
            accessToken: innerConnection.accessToken,
            refreshToken: innerConnection.refreshToken,
            expiresAt: innerConnection.expiresAt,
          },
          credentials,
          subscriptionId: innerConnection.subscriptionId,
        });
      } catch {
        // Best effort — orphaned subscriptions expire ≤60min on Graph anyway.
      }
    }

    await db
      .update(microsoftTeamsUserConnections)
      .set({
        accessToken: '',
        refreshToken: '',
        revokedAt: new Date(),
        subscriptionId: null,
        subscriptionResource: null,
        subscriptionExpiration: null,
        subscriptionClientState: null,
        updatedAt: new Date(),
      })
      .where(eq(microsoftTeamsUserConnections.id, innerConnection.id));

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
          <h2 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground">Google Workspace</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Connect your Google account so the brain can ingest your Gmail, Calendar, Drive, and Contacts.
            Read-only — we never send email or change your data.
          </p>
        </div>
      </div>

      {!tenant && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center text-center">
          <span className="material-icons text-5xl text-muted-foreground mb-3">workspace_premium</span>
          <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground mb-1">Workspace integration is an enterprise feature</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            This account uses standard email tracking (incoming mail to your SimplerDevelopment domain). To enable
            full Workspace ingestion (sent mail, calendar, Drive, contacts), upgrade and we&apos;ll provision
            the integration with your Google Workspace.
          </p>
          <a
            href="/portal/tickets/new?subject=Workspace+integration+upgrade"
            className={`mt-4 ${pBtnPrimary}`}
          >
            <span className="material-icons text-base">support_agent</span>
            Request upgrade
          </a>
        </div>
      )}

      {tenant && tenant.status !== 'active' && tenant.status !== 'configured' && (
        <div className="bg-card border border-border rounded-2xl p-6 flex items-start gap-3">
          <span className="material-icons text-2xl text-muted-foreground">pause_circle</span>
          <div>
            <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground">Workspace integration paused</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Status: <code className="font-mono">{tenant.status}</code>. Contact your SimplerDevelopment administrator to resume.
            </p>
          </div>
        </div>
      )}

      {tenant && (tenant.status === 'active' || tenant.status === 'configured') && !connection && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="material-icons text-2xl text-muted-foreground">link_off</span>
            <div>
              <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground">Not connected</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your Google Workspace account ({session.user.email ?? 'your work email'}) to enable the brain.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`/api/portal/integrations/google/connect?returnTo=${encodeURIComponent(SETTINGS_INTEGRATIONS_PATH)}`}
              className={pBtnPrimary}
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
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <span className="material-icons text-2xl text-green-600 dark:text-green-500">check_circle</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground">Connected</h3>
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
              className={`${pBtnGhost} hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive`}
            >
              <span className="material-icons text-base">link_off</span>
              Disconnect
            </button>
          </form>
        </div>
      )}

      {/* ─── Microsoft Teams ──────────────────────────────────────────── */}

      {microsoftJustConnected && (
        <div className="border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 rounded-xl p-4 flex items-start gap-3">
          <span className="material-icons text-base mt-0.5">check_circle</span>
          <div className="text-sm">
            Microsoft Teams connected. Transcripts from new meetings you organize will sync automatically — usually within minutes of the meeting ending.
          </div>
        </div>
      )}
      {microsoftErrorMessage && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 rounded-xl p-4 flex items-start gap-3">
          <span className="material-icons text-base mt-0.5">error</span>
          <div className="text-sm">
            Microsoft returned an error: <code className="font-mono">{microsoftErrorMessage}</code>
            {microsoftErrorDescription && (
              <span className="block text-xs mt-1 opacity-80">{microsoftErrorDescription}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 pt-4 border-t border-border">
        <div>
          <h2 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground">Microsoft Teams</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Connect your Microsoft 365 account so transcripts from meetings you organize land in the brain automatically.
          </p>
        </div>
      </div>

      {!microsoftConfigured && (
        <div className="bg-card border border-border rounded-2xl p-6 flex items-start gap-3">
          <span className="material-icons text-2xl text-muted-foreground">settings</span>
          <div>
            <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground">Not yet enabled on this deploy</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The Teams integration requires <code className="font-mono">MICROSOFT_TEAMS_CLIENT_ID</code> and{' '}
              <code className="font-mono">MICROSOFT_TEAMS_CLIENT_SECRET</code> in the environment. Contact your SimplerDevelopment administrator.
            </p>
          </div>
        </div>
      )}

      {microsoftConfigured && !microsoftConnection && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="material-icons text-2xl text-muted-foreground">link_off</span>
            <div>
              <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground">Not connected</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your Microsoft 365 account to start syncing Teams meeting transcripts.
              </p>
            </div>
          </div>

          {/* Organizer-only caveat — see lib/microsoft/scopes.ts. */}
          <div className="border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400 rounded-lg p-3 flex items-start gap-2">
            <span className="material-icons text-base mt-0.5">info</span>
            <div className="text-xs leading-relaxed">
              <strong>Heads up:</strong> only meetings where you are organizer or co-organizer will sync. Microsoft does not allow read access to a transcript when you are only an attendee — that&apos;s a Microsoft Graph permission constraint, not a SimplerDevelopment limitation.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`/api/portal/integrations/microsoft/connect?returnTo=${encodeURIComponent(SETTINGS_INTEGRATIONS_PATH)}`}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">link</span>
              Connect Microsoft Teams
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            You&apos;ll be redirected to Microsoft to grant read-only transcript access. SimplerDevelopment can never read meetings you didn&apos;t organize, and never sees the recording — just the transcript text.
          </p>
        </div>
      )}

      {microsoftConfigured && microsoftConnection && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <span className="material-icons text-2xl text-green-600 dark:text-green-500">check_circle</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-extrabold tracking-[-0.01em] text-foreground">Connected</h3>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {microsoftConnection.microsoftAccountEmail}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Connected {new Date(microsoftConnection.createdAt).toLocaleDateString()}
                {microsoftConnection.lastSyncAt && (
                  <> · Last sync {new Date(microsoftConnection.lastSyncAt).toLocaleString()}</>
                )}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Sync state</h4>
            <ul className="space-y-1.5 text-sm text-foreground">
              <li className="flex items-center gap-2">
                <span className="material-icons text-base text-muted-foreground">notifications_active</span>
                {microsoftConnection.subscriptionId
                  ? `Subscription active until ${microsoftConnection.subscriptionExpiration?.toLocaleString() ?? 'unknown'}`
                  : 'Subscription pending — will be created on next renewal cron pass'}
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="material-icons text-base mt-0.5">info</span>
                Only meetings you organize sync. Attendee-only meetings are filtered out by Microsoft Graph and won&apos;t appear here.
              </li>
            </ul>
          </div>

          <form action={disconnectMicrosoftAction}>
            <button
              type="submit"
              className={`${pBtnGhost} hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive`}
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
