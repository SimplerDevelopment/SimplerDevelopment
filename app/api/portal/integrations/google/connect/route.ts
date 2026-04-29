import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { buildAuthUrl } from '@/lib/google/oauth';
import { signState } from '@/lib/google/oauth-state';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import type { GoogleSurface } from '@/lib/google/scopes';

const ALL_SURFACES: GoogleSurface[] = ['identity', 'gmail', 'calendar', 'drive', 'contacts'];

const ALLOWED_SURFACES = new Set<GoogleSurface>(ALL_SURFACES);

function parseSurfaces(raw: string | null): GoogleSurface[] {
  if (!raw) return ALL_SURFACES;
  const requested = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const valid = requested.filter((s): s is GoogleSurface => ALLOWED_SURFACES.has(s as GoogleSurface));
  if (valid.length === 0) return ALL_SURFACES;
  if (!valid.includes('identity')) valid.unshift('identity');
  return valid;
}

/**
 * Initiate the Workspace OAuth flow for the calling portal user.
 *
 * Resolves: session → user → client → per-tenant OAuth credentials → auth URL.
 * 302 redirects to Google with a signed state we'll verify in /callback.
 *
 * Querystring (optional):
 *   surfaces=gmail,calendar  — comma-separated GoogleSurface list. Defaults to all.
 *   returnTo=/portal/...     — where to send the user after a successful connect.
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

  const tenant = await getTenantWorkspaceCredentialsByClientId(client.id);
  if (!tenant) {
    return NextResponse.json(
      {
        error: 'workspace_not_provisioned',
        message:
          'This client is on the standard tier (MX-based email tracking) and does not have ' +
          'enterprise Workspace credentials configured. Onboard the tenant first — see ' +
          '.planning/milestones/google-workspace/ENTERPRISE-ONBOARDING.md',
      },
      { status: 409 }
    );
  }
  if (tenant.status !== 'active' && tenant.status !== 'configured') {
    return NextResponse.json(
      { error: 'workspace_not_ready', status: tenant.status },
      { status: 409 }
    );
  }

  const url = new URL(req.url);
  const surfaces = parseSurfaces(url.searchParams.get('surfaces'));
  const returnTo = url.searchParams.get('returnTo') ?? undefined;

  const state = signState({
    clientId: client.id,
    userId,
    surfaces,
    returnTo,
  });

  // Derive the callback URL from the request origin so the same code works
  // across localhost / staging / production without per-env DB updates.
  // The stored tenant.oauth.redirectUri is informational only; the actual
  // OAuth client must have this exact URL registered (we registered all 3
  // up front: localhost:3000, staging.simplerdevelopment.com, www.simplerdevelopment.com).
  const credentials = {
    ...tenant.oauth,
    redirectUri: `${url.origin}/api/portal/integrations/google/callback`,
  };

  const authUrl = buildAuthUrl({
    credentials,
    surfaces,
    state,
    loginHint: session.user.email ?? undefined,
  });

  return NextResponse.redirect(authUrl);
}
