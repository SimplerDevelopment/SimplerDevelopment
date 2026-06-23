import { originFromRequest } from '@/lib/oauth/server';
import { SUPPORTED_SCOPES } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 8414 — Authorization Server Metadata. Claude.ai and other MCP clients
 *  fetch this from the `authorization_servers[0]` URL listed in the protected
 *  resource metadata. It tells them where to register, where to send the user
 *  for consent, and where to swap the resulting code for a token. */
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
    // 'none' = PKCE-only public clients (default; the MCP web case).
    // The two client_secret_* methods are for confidential clients minted via
    // the admin path — server-to-server integrations (n8n, Zapier, etc.).
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    // RFC 8707 — Claude includes a `resource` parameter scoping tokens to the
    // MCP server URL. We persist and echo it but don't currently constrain
    // tokens by audience beyond that.
    resource_indicators_supported: true,
    // SEP-991: ChatGPT and other MCP clients use their connector URL as the
    // client_id. We fetch the metadata document from that URL to get
    // redirect_uris without requiring pre-registration (CIMD).
    client_id_metadata_document_supported: true,
  });
}
