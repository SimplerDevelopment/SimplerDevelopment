import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthAuthorizationCodes, clientMembers, clients as clientsTbl } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
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

  // Authorize the chosen portal clients. The grant covers a SET (the boxes the
  // user ticked); `active_client_id` is only the preferred default. Verify EVERY
  // id against membership or legacy ownership — never trust the form, and never
  // let the default land outside the verified set.
  const activeClientId = parseInt(activeClientIdRaw, 10);
  if (!activeClientId) return back({ error: 'invalid_request', error_description: 'active_client_id required' });

  const requestedClientIds = [
    ...new Set(
      (form.getAll('client_ids') as string[])
        .map((v) => parseInt(String(v), 10))
        .filter((n) => Number.isFinite(n)),
    ),
  ];
  // `portal_select` is rendered only by the multi-portal checkbox UI, and tells the
  // two zero-checkbox cases apart: with it, the user unticked everything (refuse);
  // without it, the post came from a form that predates the picker — a consent page
  // cached across a deploy, or an API caller — so honour the single portal it named
  // rather than failing a submission that used to work.
  const usedPortalPicker = form.get('portal_select') !== null;
  if (requestedClientIds.length === 0) {
    if (usedPortalPicker) {
      return back({ error: 'invalid_request', error_description: 'Select at least one portal' });
    }
    requestedClientIds.push(activeClientId);
  }

  // Two queries for the whole set rather than two per portal: membership, then the
  // legacy direct-ownership fallback for accounts predating client_members.
  const [memberRows, ownedRows] = await Promise.all([
    db
      .select({ clientId: clientMembers.clientId })
      .from(clientMembers)
      .where(and(eq(clientMembers.userId, userId), inArray(clientMembers.clientId, requestedClientIds))),
    db
      .select({ id: clientsTbl.id })
      .from(clientsTbl)
      .where(and(eq(clientsTbl.userId, userId), inArray(clientsTbl.id, requestedClientIds))),
  ]);
  const accessible = new Set([...memberRows.map((r) => r.clientId), ...ownedRows.map((r) => r.id)]);
  const authorizedClientIds = requestedClientIds.filter((id) => accessible.has(id));
  // Fail the whole grant rather than silently issuing a narrower one: a token
  // quietly missing a portal the user thought they granted is harder to diagnose
  // than a refused authorization.
  if (authorizedClientIds.length !== requestedClientIds.length) {
    return back({ error: 'access_denied', error_description: 'No access to one or more selected portals' });
  }

  const defaultClientId = authorizedClientIds.includes(activeClientId)
    ? activeClientId
    : authorizedClientIds[0];

  // Self-service confidential clients (minted from /portal/settings/api-keys)
  // are bound to the tenant that created them. Such a client may only be
  // authorized for its owning portal — this prevents one tenant's OAuth app
  // from harvesting access tokens scoped to another tenant. Global/admin
  // clients (ownerClientId == null, e.g. the Claude.ai connector) are
  // unrestricted and keep their existing cross-tenant behavior.
  // A tenant-owned client may only ever reach its owning portal, so the granted
  // SET must be exactly that one — not merely contain it.
  if (
    oauthClient.ownerClientId != null &&
    (authorizedClientIds.length !== 1 || authorizedClientIds[0] !== oauthClient.ownerClientId)
  ) {
    return back({ error: 'access_denied', error_description: 'This OAuth client is restricted to its owning organization' });
  }

  const { code, hash } = generateAuthCode();
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: hash,
    oauthClientId: oauthClient.id,
    userId,
    clientId: defaultClientId,
    clientIds: authorizedClientIds,
    scopes,
    redirectUri,
    codeChallenge: codeChallenge || null,
    codeChallengeMethod: codeChallenge ? 'S256' : null,
    resource,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return back({ code });
}
