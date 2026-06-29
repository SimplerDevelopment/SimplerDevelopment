import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { exchangeCode, getEnvLinkedinCredentials } from '@/lib/linkedin/oauth';
import { verifyState, StateInvalidError } from '@/lib/linkedin/oauth-state';
import { storeConnection } from '@/lib/linkedin/connections';

/**
 * LinkedIn's OAuth redirect lands here after the user grants/declines consent.
 *
 * Flow:
 *   1. Validate the signed `state` we issued in /connect — recover clientId, userId, scopes
 *   2. CSRF-bind: the session at /callback must match payload.userId
 *   3. Exchange the auth `code` for tokens (access + optional refresh + id_token)
 *   4. Decode id_token claims for memberUrn (`urn:li:person:<sub>`) + name
 *   5. Upsert linkedin_user_connections keyed by (clientId, userId)
 *   6. Redirect back to the portal — to `state.returnTo` if it's same-origin, else /portal
 *
 * Failure modes:
 *   - state malformed/expired/forged → 400 (don't redirect — forged state could control destination)
 *   - LinkedIn returned ?error=...   → redirect to portal with error query param
 *   - Token exchange fails           → 502 (transient — user can retry)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const linkedinError = params.get('error');
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

  if (linkedinError) {
    const description = params.get('error_description') ?? '';
    return NextResponse.redirect(
      `${url.origin}${safeReturnTo}?linkedin_error=${encodeURIComponent(linkedinError)}` +
        (description ? `&linkedin_error_description=${encodeURIComponent(description)}` : ''),
    );
  }
  if (!code) {
    return NextResponse.json({ error: 'missing_code' }, { status: 400 });
  }

  const redirectUri = `${url.origin}/api/portal/integrations/linkedin/callback`;
  let credentials;
  try {
    credentials = getEnvLinkedinCredentials(redirectUri);
  } catch (err) {
    return NextResponse.json(
      { error: 'linkedin_oauth_not_configured', message: (err as Error).message },
      { status: 500 },
    );
  }

  let exchanged;
  try {
    exchanged = await exchangeCode(code, credentials);
  } catch (err) {
    return NextResponse.json(
      { error: 'token_exchange_failed', message: (err as Error).message },
      { status: 502 },
    );
  }

  await storeConnection({
    clientId: payload.clientId,
    userId: payload.userId,
    result: exchanged,
  });

  return NextResponse.redirect(`${url.origin}${safeReturnTo}?linkedin_connected=1`);
}

function sanitizeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}
