import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthClients } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import {
  generateClientSecret,
  isAcceptableRedirectUri,
  randomClientId,
} from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REDIRECT_URIS = 5;

/** Resolve the authenticated portal user + their active tenant in one step.
 *  Returns null when unauthenticated or no client is resolvable — callers map
 *  that to a 401/404. Every query below is scoped to `client.id` so a tenant
 *  can only ever see / mutate the confidential OAuth clients it owns. */
async function requirePortalTenant() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  if (!Number.isFinite(userId)) return null;
  const client = await getPortalClient(userId);
  if (!client) return null;
  return { userId, clientId: client.id };
}

/** GET /api/portal/oauth-clients — list the confidential OAuth clients owned by
 *  the caller's active tenant. Never returns the raw secret; only the preview. */
export async function GET() {
  const ctx = await requirePortalTenant();
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // snake_case keys — matches the POST/201 response shape, the OAuth RFC
  // vocabulary, and the projection the integration tests assert on. (The
  // list used to emit camelCase, which silently diverged from create.)
  const rows = await db
    .select({
      id: oauthClients.id,
      client_id: oauthClients.clientId,
      client_name: oauthClients.clientName,
      redirect_uris: oauthClients.redirectUris,
      token_endpoint_auth_method: oauthClients.tokenEndpointAuthMethod,
      client_secret_preview: oauthClients.clientSecretPreview,
      client_secret_created_at: oauthClients.clientSecretCreatedAt,
      client_secret_rotated_at: oauthClients.clientSecretRotatedAt,
      created_at: oauthClients.createdAt,
    })
    .from(oauthClients)
    .where(eq(oauthClients.ownerClientId, ctx.clientId))
    .orderBy(desc(oauthClients.createdAt));

  return NextResponse.json({ success: true, data: rows });
}

/** POST /api/portal/oauth-clients — mint an OAuth client owned by the caller's
 *  tenant. Confidential clients (client_secret_basic / client_secret_post)
 *  receive a one-time client_secret. Public PKCE clients (none) receive only
 *  a client_id — no secret is generated or stored. The client is stamped with
 *  `ownerClientId`, which (a) scopes all future list/rotate/delete to this
 *  tenant and (b) restricts who may authorize it (see /oauth/authorize). */
export async function POST(req: Request) {
  const ctx = await requirePortalTenant();
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : '';
  if (!clientName) return NextResponse.json({ success: false, message: 'client_name is required' }, { status: 400 });

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    return NextResponse.json({ success: false, message: 'At least one redirect_uri is required' }, { status: 400 });
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return NextResponse.json({ success: false, message: `Maximum ${MAX_REDIRECT_URIS} redirect_uris` }, { status: 400 });
  }
  for (const uri of redirectUris) {
    if (typeof uri !== 'string' || !isAcceptableRedirectUri(uri)) {
      return NextResponse.json({ success: false, message: `Invalid redirect_uri: ${uri}` }, { status: 400 });
    }
  }

  const authMethod = typeof body.token_endpoint_auth_method === 'string'
    ? body.token_endpoint_auth_method
    : 'client_secret_basic';
  if (authMethod !== 'client_secret_basic' && authMethod !== 'client_secret_post' && authMethod !== 'none') {
    return NextResponse.json(
      { success: false, message: 'token_endpoint_auth_method must be client_secret_basic, client_secret_post, or none' },
      { status: 400 },
    );
  }

  const isPublicClient = authMethod === 'none';
  const clientId = randomClientId();
  // Public PKCE clients have no secret — skip generation entirely.
  const secretData = isPublicClient ? null : generateClientSecret();
  const now = new Date();
  const [record] = await db.insert(oauthClients).values({
    clientId,
    clientName: clientName.slice(0, 200),
    redirectUris: redirectUris as string[],
    clientUri: typeof body.client_uri === 'string' ? body.client_uri.slice(0, 500) : null,
    tokenEndpointAuthMethod: authMethod,
    clientSecretHash: secretData?.hash ?? null,
    clientSecretPreview: secretData?.preview ?? null,
    clientSecretCreatedAt: secretData ? now : null,
    ownerClientId: ctx.clientId,
    ownerUserId: ctx.userId,
  }).returning();

  return NextResponse.json({
    success: true,
    data: {
      client_id: record.clientId,
      ...(secretData ? { client_secret: secretData.secret } : {}), // shown exactly once; omitted for public clients
      client_secret_preview: record.clientSecretPreview,
      client_name: record.clientName,
      redirect_uris: record.redirectUris,
      token_endpoint_auth_method: record.tokenEndpointAuthMethod,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      created_at: record.createdAt,
    },
  }, { status: 201 });
}
