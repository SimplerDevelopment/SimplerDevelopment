import { db } from '@/lib/db';
import { oauthClients, oauthAuthorizationCodes, oauthAccessTokens } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { generateAccessToken, sha256, verifyPkceS256 } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year — public clients without refresh tokens.

function err(status: number, error: string, description?: string) {
  return Response.json({ error, error_description: description }, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  });
}

/** RFC 6749 §4.1.3 — Access Token Request (authorization_code grant). Public
 *  client + PKCE: no client_secret. The code is single-use; consuming it
 *  marks `consumed_at` so a replay returns an error. */
export async function POST(req: Request) {
  // Token endpoint accepts application/x-www-form-urlencoded per spec.
  let form: URLSearchParams;
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    form = new URLSearchParams(await req.text());
  } else if (ct.includes('application/json')) {
    const j = await req.json().catch(() => ({}));
    form = new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)]));
  } else {
    // Some clients send multipart or omit the header — fall back to FormData.
    try {
      const fd = (await req.formData()) as unknown as globalThis.FormData;
      form = new URLSearchParams();
      fd.forEach((v: FormDataEntryValue, k: string) => form.set(k, String(v)));
    } catch {
      return err(400, 'invalid_request', 'Unparseable body');
    }
  }

  const grantType = form.get('grant_type');
  if (grantType !== 'authorization_code') {
    return err(400, 'unsupported_grant_type', 'Only authorization_code is supported');
  }

  const code = form.get('code');
  const clientIdParam = form.get('client_id');
  const redirectUri = form.get('redirect_uri');
  const codeVerifier = form.get('code_verifier');
  const resource = form.get('resource');

  if (!code || !clientIdParam || !redirectUri || !codeVerifier) {
    return err(400, 'invalid_request', 'code, client_id, redirect_uri, and code_verifier are required');
  }

  const [oauthClient] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientIdParam)).limit(1);
  if (!oauthClient) return err(400, 'invalid_client', 'Unknown client_id');

  const codeHash = sha256(code);
  const [stored] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(and(eq(oauthAuthorizationCodes.codeHash, codeHash), isNull(oauthAuthorizationCodes.consumedAt)))
    .limit(1);
  if (!stored) return err(400, 'invalid_grant', 'Code is invalid, expired, or already used');

  if (stored.oauthClientId !== oauthClient.id) {
    return err(400, 'invalid_grant', 'Code was not issued to this client');
  }
  if (stored.expiresAt.getTime() < Date.now()) {
    return err(400, 'invalid_grant', 'Code expired');
  }
  if (stored.redirectUri !== redirectUri) {
    return err(400, 'invalid_grant', 'redirect_uri does not match the one used at /authorize');
  }
  if (!verifyPkceS256(codeVerifier, stored.codeChallenge)) {
    return err(400, 'invalid_grant', 'PKCE verification failed');
  }

  // Mark the code consumed BEFORE issuing the token, so a concurrent replay
  // hits the `consumed_at IS NULL` filter and fails.
  const consumed = await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(oauthAuthorizationCodes.id, stored.id), isNull(oauthAuthorizationCodes.consumedAt)))
    .returning({ id: oauthAuthorizationCodes.id });
  if (consumed.length === 0) {
    return err(400, 'invalid_grant', 'Code already used');
  }

  const { token, hash, preview } = generateAccessToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  await db.insert(oauthAccessTokens).values({
    tokenHash: hash,
    tokenPreview: preview,
    oauthClientId: oauthClient.id,
    userId: stored.userId,
    clientId: stored.clientId,
    scopes: stored.scopes,
    resource: resource ? String(resource) : stored.resource,
    expiresAt,
  });

  return Response.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: stored.scopes.join(' '),
  }, {
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  });
}
