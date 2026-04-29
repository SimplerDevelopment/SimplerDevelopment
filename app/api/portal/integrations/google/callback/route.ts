import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { exchangeCode } from '@/lib/google/oauth';
import { verifyState, StateInvalidError } from '@/lib/google/oauth-state';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import { startGmailWatch } from '@/lib/google/gmail-watch';

/**
 * Google's OAuth redirect lands here after the user grants/declines consent.
 *
 * Flow:
 *   1. Validate the signed `state` we issued in /connect — recover clientId, userId, surfaces
 *   2. Look up the tenant's OAuth credentials by clientId
 *   3. Exchange the auth `code` for tokens (refresh + access + id)
 *   4. Upsert google_workspace_user_connections keyed by (clientId, userId)
 *   5. Redirect back to the portal — to `state.returnTo` if it's same-origin, else to a sane default
 *
 * Failure modes:
 *   - state malformed/expired/forged → 400 with a friendly message (don't redirect anywhere
 *     a forged state could control)
 *   - Google returned ?error=...      → redirect to portal with error query param
 *   - Token exchange fails             → 502 (transient — user can retry)
 *   - Tenant revoked between connect+callback → 409
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const googleError = params.get('error');
  const code = params.get('code');
  const state = params.get('state');

  if (!state) {
    return NextResponse.json({ error: 'missing_state' }, { status: 400 });
  }

  let payload;
  try {
    payload = verifyState(state);
  } catch (err) {
    if (err instanceof StateInvalidError) {
      return NextResponse.json({ error: 'invalid_state', reason: err.reason }, { status: 400 });
    }
    throw err;
  }

  // CSRF-binding: the session that lands at /callback MUST be the same user that
  // initiated /connect. Without this check, an attacker could trick a victim into
  // visiting a callback URL with the attacker's signed state, binding the victim's
  // Google tokens to the attacker's user row.
  const session = await auth();
  if (!session?.user?.id || parseInt(session.user.id, 10) !== payload.userId) {
    return NextResponse.json({ error: 'session_mismatch' }, { status: 403 });
  }

  const safeReturnTo = sanitizeReturnTo(payload.returnTo, url.origin) ?? '/portal';

  if (googleError) {
    return NextResponse.redirect(
      `${url.origin}${safeReturnTo}?workspace_error=${encodeURIComponent(googleError)}`
    );
  }
  if (!code) {
    return NextResponse.json({ error: 'missing_code' }, { status: 400 });
  }

  const tenant = await getTenantWorkspaceCredentialsByClientId(payload.clientId);
  if (!tenant) {
    return NextResponse.json({ error: 'workspace_not_provisioned' }, { status: 409 });
  }
  if (tenant.status === 'revoked') {
    return NextResponse.json({ error: 'workspace_revoked' }, { status: 409 });
  }

  let exchanged;
  try {
    exchanged = await exchangeCode(code, tenant.oauth);
  } catch (err) {
    return NextResponse.json(
      { error: 'token_exchange_failed', message: (err as Error).message },
      { status: 502 }
    );
  }

  // Start the Gmail watch. Best-effort: a failed watch shouldn't kill the
  // whole connect flow — the user gets connected anyway, and the daily
  // renewal cron will retry. Log the reason so we can debug later.
  let watchHistoryId: string | null = null;
  let watchExpiration: Date | null = null;
  if (exchanged.scopes.some((s) => s.includes('gmail'))) {
    try {
      const watch = await startGmailWatch({
        credentials: tenant.oauth,
        connection: {
          accessToken: exchanged.accessToken,
          refreshToken: exchanged.refreshToken,
          expiresAt: exchanged.expiresAt,
        },
        topicName: tenant.pubsubTopic,
      });
      watchHistoryId = watch.historyId;
      watchExpiration = watch.expiration;
    } catch (err) {
      console.error('[oauth-callback] gmail watch failed', err);
    }
  }

  await db
    .insert(googleWorkspaceUserConnections)
    .values({
      clientId: payload.clientId,
      userId: payload.userId,
      googleAccountEmail: exchanged.googleAccountEmail,
      googleAccountId: exchanged.googleAccountId,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiresAt: exchanged.expiresAt,
      scopes: exchanged.scopes,
      gmailHistoryId: watchHistoryId,
      gmailWatchExpiration: watchExpiration,
    })
    .onConflictDoUpdate({
      target: [googleWorkspaceUserConnections.clientId, googleWorkspaceUserConnections.userId],
      set: {
        googleAccountEmail: exchanged.googleAccountEmail,
        googleAccountId: exchanged.googleAccountId,
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        expiresAt: exchanged.expiresAt,
        scopes: exchanged.scopes,
        revokedAt: null,
        // Only overwrite watch fields if a new watch was successfully created.
        // Otherwise keep prior values so the daily renewal job can find the row.
        ...(watchHistoryId
          ? { gmailHistoryId: watchHistoryId, gmailWatchExpiration: watchExpiration }
          : {}),
        updatedAt: new Date(),
      },
    });

  // First-time activation: bump the tenant from 'configured' to 'active'.
  // (We trust the smoke test happens through real connects, not via the runbook step alone.)
  // Intentionally not done in this route — handled by an admin tool so it stays explicit.

  return NextResponse.redirect(`${url.origin}${safeReturnTo}?workspace_connected=1`);
}

/**
 * Only allow returnTo paths that are same-origin and start with /. Reject absolute URLs,
 * protocol-relative URLs, and anything that could redirect to an attacker-controlled host.
 */
function sanitizeReturnTo(raw: string | undefined, _origin: string): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}
