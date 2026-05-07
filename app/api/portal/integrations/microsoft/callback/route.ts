import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { microsoftTeamsUserConnections } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { exchangeCode, getEnvMicrosoftCredentials } from '@/lib/microsoft/oauth';
import { verifyState, StateInvalidError } from '@/lib/microsoft/oauth-state';
import { createTranscriptsSubscription } from '@/lib/microsoft/transcripts-watch';

/**
 * Microsoft's OAuth redirect lands here after the user grants/declines consent.
 *
 * Flow:
 *   1. Validate the signed `state` we issued in /connect — recover clientId, userId, surfaces
 *   2. CSRF-bind: the session at /callback must match payload.userId
 *   3. Exchange the auth `code` for tokens (refresh + access + id)
 *   4. Decode id_token claims for oid (Graph user id) + tid (M365 tenant)
 *   5. Upsert microsoft_teams_user_connections keyed by (clientId, userId)
 *   6. Redirect back to the portal — to `state.returnTo` if it's same-origin, else /portal
 *
 * Subscription creation is intentionally NOT done here — that lands in PR 2
 * along with the webhook handler and renewal cron. A connected user without a
 * subscription row simply won't receive transcripts until the renewal cron
 * picks them up.
 *
 * Failure modes:
 *   - state malformed/expired/forged → 400 (don't redirect — forged state could control destination)
 *   - Microsoft returned ?error=...  → redirect to portal with error query param
 *   - Token exchange fails           → 502 (transient — user can retry)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const microsoftError = params.get('error');
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

  const session = await auth();
  if (!session?.user?.id || parseInt(session.user.id, 10) !== payload.userId) {
    return NextResponse.json({ error: 'session_mismatch' }, { status: 403 });
  }

  const safeReturnTo = sanitizeReturnTo(payload.returnTo) ?? '/portal';

  if (microsoftError) {
    const description = params.get('error_description') ?? '';
    return NextResponse.redirect(
      `${url.origin}${safeReturnTo}?microsoft_error=${encodeURIComponent(microsoftError)}` +
        (description ? `&microsoft_error_description=${encodeURIComponent(description)}` : '')
    );
  }
  if (!code) {
    return NextResponse.json({ error: 'missing_code' }, { status: 400 });
  }

  const redirectUri = `${url.origin}/api/portal/integrations/microsoft/callback`;
  let credentials;
  try {
    credentials = getEnvMicrosoftCredentials(redirectUri);
  } catch (err) {
    return NextResponse.json(
      { error: 'microsoft_oauth_not_configured', message: (err as Error).message },
      { status: 500 }
    );
  }

  let exchanged;
  try {
    exchanged = await exchangeCode(code, credentials);
  } catch (err) {
    return NextResponse.json(
      { error: 'token_exchange_failed', message: (err as Error).message },
      { status: 502 }
    );
  }

  // Best-effort: try to create the change-notification subscription right
  // here so the user starts receiving transcripts immediately. Mirrors the
  // Google flow's startGmailWatch on connect. Fails silently in local dev
  // where notificationUrl isn't reachable from Graph; the renewal cron
  // creates it later in production.
  let subscriptionId: string | null = null;
  let subscriptionResource: string | null = null;
  let subscriptionExpiration: Date | null = null;
  let subscriptionClientState: string | null = null;
  let postSubscribeAccessToken = exchanged.accessToken;
  let postSubscribeRefreshToken = exchanged.refreshToken;
  let postSubscribeExpiresAt = exchanged.expiresAt;
  try {
    const sub = await createTranscriptsSubscription({
      connection: {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        expiresAt: exchanged.expiresAt,
      },
      credentials,
      microsoftUserId: exchanged.microsoftUserId,
      originHint: url.origin,
    });
    subscriptionId = sub.subscriptionId;
    subscriptionResource = sub.subscriptionResource;
    subscriptionExpiration = sub.subscriptionExpiration;
    subscriptionClientState = sub.subscriptionClientState;
    if (sub.refreshed) {
      postSubscribeAccessToken = sub.connection.accessToken;
      postSubscribeRefreshToken = sub.connection.refreshToken;
      postSubscribeExpiresAt = sub.connection.expiresAt;
    }
  } catch (err) {
    console.warn('[microsoft-callback] subscription create failed (cron will retry)', err);
  }

  await db
    .insert(microsoftTeamsUserConnections)
    .values({
      clientId: payload.clientId,
      userId: payload.userId,
      microsoftTenantId: exchanged.microsoftTenantId,
      microsoftUserId: exchanged.microsoftUserId,
      microsoftAccountEmail: exchanged.microsoftAccountEmail,
      accessToken: postSubscribeAccessToken,
      refreshToken: postSubscribeRefreshToken,
      expiresAt: postSubscribeExpiresAt,
      scopes: exchanged.scopes,
      subscriptionId,
      subscriptionResource,
      subscriptionExpiration,
      subscriptionClientState,
    })
    .onConflictDoUpdate({
      target: [
        microsoftTeamsUserConnections.clientId,
        microsoftTeamsUserConnections.userId,
      ],
      set: {
        microsoftTenantId: exchanged.microsoftTenantId,
        microsoftUserId: exchanged.microsoftUserId,
        microsoftAccountEmail: exchanged.microsoftAccountEmail,
        accessToken: postSubscribeAccessToken,
        refreshToken: postSubscribeRefreshToken,
        expiresAt: postSubscribeExpiresAt,
        scopes: exchanged.scopes,
        revokedAt: null,
        // Only overwrite subscription fields if a new one was successfully
        // created. Otherwise keep prior values so the renewal cron can find
        // the row and act on it.
        ...(subscriptionId
          ? { subscriptionId, subscriptionResource, subscriptionExpiration, subscriptionClientState }
          : {}),
        updatedAt: new Date(),
      },
    });

  return NextResponse.redirect(`${url.origin}${safeReturnTo}?microsoft_connected=1`);
}

function sanitizeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}
