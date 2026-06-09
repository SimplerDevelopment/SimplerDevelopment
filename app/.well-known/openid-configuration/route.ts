import { originFromRequest } from '@/lib/oauth/server';
import { SUPPORTED_SCOPES } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** OpenID Connect Discovery 1.0 — mirrors /.well-known/oauth-authorization-server
 *  (RFC 8414). ChatGPT's MCP client fetches this URL to discover OAuth endpoints
 *  instead of the RFC 8414 path, so both must exist and agree. */
export function GET(req: Request) {
  const origin = originFromRequest(req);
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    subject_types_supported: ['public'],
    client_id_metadata_document_supported: true,
  });
}
