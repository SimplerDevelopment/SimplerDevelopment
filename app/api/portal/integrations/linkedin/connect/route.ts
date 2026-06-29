import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { buildAuthUrl, getEnvLinkedinCredentials, LINKEDIN_POST_SCOPES } from '@/lib/linkedin/oauth';
import { signState } from '@/lib/linkedin/oauth-state';

/**
 * Initiate the LinkedIn OAuth flow for the calling portal user.
 *
 * Resolves: session → user → client → SD-owned OAuth credentials → auth URL.
 * 302 redirects to LinkedIn with a signed state we'll verify in /callback.
 *
 * Querystring (optional):
 *   returnTo=/portal/...  — where to send the user after a successful connect.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);

  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ error: 'No client for this user' }, { status: 404 });
  }

  const url = new URL(req.url);
  const returnTo = url.searchParams.get('returnTo') ?? undefined;

  // Derive the redirect URL from the request origin so localhost / staging /
  // www work without per-env config. The LinkedIn app's "Authorized Redirect URLs"
  // must include all three.
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

  const state = signState({
    clientId: client.id,
    userId,
    scopes: LINKEDIN_POST_SCOPES,
    returnTo,
  });

  const authUrl = buildAuthUrl({
    credentials,
    scopes: LINKEDIN_POST_SCOPES,
    state,
  });

  return NextResponse.redirect(authUrl);
}
