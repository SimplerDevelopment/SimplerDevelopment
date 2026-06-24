import { db } from '@/lib/db';
import { oauthClients } from '@/lib/db/schema';
import { isAcceptableRedirectUri, randomClientId } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REDIRECT_URIS = 5;

function err(status: number, error: string, description?: string) {
  return Response.json({ error, error_description: description }, { status });
}

/** RFC 7591 Dynamic Client Registration. Public-only — we do not issue
 *  client secrets; PKCE is mandatory at /authorize. Anyone can register a
 *  client; the trust boundary is the user consenting at /oauth/authorize. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err(400, 'invalid_client_metadata', 'Body must be JSON');
  }

  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : '';
  if (!clientName) return err(400, 'invalid_client_metadata', 'client_name is required');

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    return err(400, 'invalid_redirect_uri', 'At least one redirect_uri is required');
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return err(400, 'invalid_redirect_uri', `Maximum ${MAX_REDIRECT_URIS} redirect_uris`);
  }
  for (const uri of redirectUris) {
    if (typeof uri !== 'string' || !isAcceptableRedirectUri(uri)) {
      return err(400, 'invalid_redirect_uri', `Invalid redirect_uri: ${uri}`);
    }
  }

  const tokenMethod = typeof body.token_endpoint_auth_method === 'string' ? body.token_endpoint_auth_method : 'none';
  if (tokenMethod !== 'none') {
    return err(400, 'invalid_client_metadata', 'Only token_endpoint_auth_method=none is supported');
  }

  const clientId = randomClientId();
  const [record] = await db.insert(oauthClients).values({
    clientId,
    clientName: clientName.slice(0, 200),
    redirectUris: redirectUris as string[],
    clientUri: typeof body.client_uri === 'string' ? body.client_uri.slice(0, 500) : null,
    logoUri: typeof body.logo_uri === 'string' ? body.logo_uri.slice(0, 500) : null,
    tosUri: typeof body.tos_uri === 'string' ? body.tos_uri.slice(0, 500) : null,
    policyUri: typeof body.policy_uri === 'string' ? body.policy_uri.slice(0, 500) : null,
    tokenEndpointAuthMethod: 'none',
    softwareId: typeof body.software_id === 'string' ? body.software_id.slice(0, 200) : null,
    softwareVersion: typeof body.software_version === 'string' ? body.software_version.slice(0, 64) : null,
  }).returning();

  return Response.json({
    client_id: record.clientId,
    client_id_issued_at: Math.floor(record.createdAt.getTime() / 1000),
    client_name: record.clientName,
    redirect_uris: record.redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }, { status: 201 });
}
