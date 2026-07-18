import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { buildAuthUrl, getEnvMicrosoftCredentials } from '@/lib/microsoft/oauth';
import { signState } from '@/lib/microsoft/oauth-state';
import type { MicrosoftSurface } from '@/lib/microsoft/scopes';

const ALL_SURFACES: MicrosoftSurface[] = ['identity', 'transcripts'];
const ALLOWED_SURFACES = new Set<MicrosoftSurface>(ALL_SURFACES);

function parseSurfaces(raw: string | null): MicrosoftSurface[] {
  if (!raw) return ALL_SURFACES;
  const requested = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const valid = requested.filter((s): s is MicrosoftSurface =>
    ALLOWED_SURFACES.has(s as MicrosoftSurface)
  );
  if (valid.length === 0) return ALL_SURFACES;
  if (!valid.includes('identity')) valid.unshift('identity');
  return valid;
}

/**
 * Initiate the Microsoft Teams OAuth flow for the calling portal user.
 *
 * Resolves: session → user → client → SD-owned OAuth credentials → auth URL.
 * 302 redirects to Microsoft with a signed state we'll verify in /callback.
 *
 * Querystring (optional):
 *   surfaces=transcripts  — comma-separated MicrosoftSurface list. Defaults to all.
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
  const surfaces = parseSurfaces(url.searchParams.get('surfaces'));
  const returnTo = url.searchParams.get('returnTo') ?? undefined;

  // Derive the redirect URL from the request origin so localhost / staging /
  // www work without per-env config. The Azure AD app registration must have
  // all three URLs configured under "Redirect URIs (Web)".
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

  const state = signState({
    clientId: client.id,
    userId,
    surfaces,
    returnTo,
  });

  const authUrl = buildAuthUrl({
    credentials,
    surfaces,
    state,
    loginHint: session.user.email ?? undefined,
  });

  return NextResponse.redirect(authUrl);
}
