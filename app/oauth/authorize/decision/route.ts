import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthAuthorizationCodes, clientMembers, clients as clientsTbl } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { generateAuthCode, redirectUriMatches } from '@/lib/oauth/server';
import { resolveOrRegisterOAuthClient } from '@/lib/oauth/cimd';
import { parseRequestedScopes } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODE_TTL_MS = 5 * 60 * 1000; // RFC 6749 §4.1.2 recommends a maximum of 10 minutes; 5 is safer.

function bail(status: number, msg: string) {
  return new Response(msg, { status });
}

export async function POST(req: Request) {
  const form = (await req.formData()) as unknown as globalThis.FormData;
  const decision = String(form.get('decision') ?? '');
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const state = String(form.get('state') ?? '');
  const codeChallenge = form.get('code_challenge') ? String(form.get('code_challenge')) : '';
  const codeChallengeMethod = form.get('code_challenge_method') ? String(form.get('code_challenge_method')) : '';
  const activeClientIdRaw = String(form.get('active_client_id') ?? '');
  const resource = form.get('resource') ? String(form.get('resource')) : null;
  const scopes = parseRequestedScopes((form.getAll('scopes') as string[]).join(' '));

  if (!clientId || !redirectUri) return bail(400, 'Missing client_id or redirect_uri');

  const oauthClient = await resolveOrRegisterOAuthClient(clientId);
  if (!oauthClient) return bail(400, 'Unknown client');
  if (!redirectUriMatches(oauthClient.redirectUris, redirectUri)) return bail(400, 'redirect_uri mismatch');

  const back = (params: Record<string, string>): Response => {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (state) url.searchParams.set('state', state);
    return Response.redirect(url.toString(), 302);
  };

  if (decision !== 'approve') {
    return back({ error: 'access_denied' });
  }

  const clientIsPublic = oauthClient.tokenEndpointAuthMethod === 'none';
  if (clientIsPublic && !codeChallenge) {
    return back({ error: 'invalid_request', error_description: 'PKCE S256 required' });
  }
  if (codeChallenge && codeChallengeMethod !== 'S256') {
    return back({ error: 'invalid_request', error_description: 'code_challenge_method must be S256' });
  }
  if (scopes.length === 0) {
    return back({ error: 'invalid_scope', error_description: 'At least one scope must be granted' });
  }

  const session = await auth();
  if (!session?.user?.id) {
    // Session expired between consent render and submit. Send the user back
    // through login by redirecting the client with an error — they'll retry.
    return back({ error: 'login_required' });
  }
  const userId = parseInt(session.user.id, 10);

  // Authorize the chosen portal client. Verify the user actually has access
  // (membership or legacy ownership) — never trust the form value alone.
  const activeClientId = parseInt(activeClientIdRaw, 10);
  if (!activeClientId) return back({ error: 'invalid_request', error_description: 'active_client_id required' });

  const [member] = await db
    .select({ clientId: clientMembers.clientId })
    .from(clientMembers)
    .where(and(eq(clientMembers.userId, userId), eq(clientMembers.clientId, activeClientId)))
    .limit(1);
  let authorized = !!member;
  if (!authorized) {
    const [owned] = await db
      .select({ id: clientsTbl.id })
      .from(clientsTbl)
      .where(and(eq(clientsTbl.id, activeClientId), eq(clientsTbl.userId, userId)))
      .limit(1);
    authorized = !!owned;
  }
  if (!authorized) return back({ error: 'access_denied', error_description: 'No access to selected portal' });

  // Self-service confidential clients (minted from /portal/settings/api-keys)
  // are bound to the tenant that created them. Such a client may only be
  // authorized for its owning portal — this prevents one tenant's OAuth app
  // from harvesting access tokens scoped to another tenant. Global/admin
  // clients (ownerClientId == null, e.g. the Claude.ai connector) are
  // unrestricted and keep their existing cross-tenant behavior.
  if (oauthClient.ownerClientId != null && oauthClient.ownerClientId !== activeClientId) {
    return back({ error: 'access_denied', error_description: 'This OAuth client is restricted to its owning organization' });
  }

  const { code, hash } = generateAuthCode();
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: hash,
    oauthClientId: oauthClient.id,
    userId,
    clientId: activeClientId,
    scopes,
    redirectUri,
    codeChallenge: codeChallenge || null,
    codeChallengeMethod: codeChallenge ? 'S256' : null,
    resource,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return back({ code });
}
