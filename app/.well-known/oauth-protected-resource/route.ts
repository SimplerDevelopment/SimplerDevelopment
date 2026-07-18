import { originFromRequest } from '@/lib/oauth/server';
import { SUPPORTED_SCOPES } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 9728 — Protected Resource Metadata. The MCP spec instructs clients to
 *  fetch this from the `resource_metadata` parameter of the WWW-Authenticate
 *  header returned by the protected `/api/mcp` endpoint, and use it to
 *  discover which authorization server(s) issue tokens for the resource. */
export function GET(req: Request) {
  const origin = originFromRequest(req);
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: SUPPORTED_SCOPES,
    resource_documentation: `${origin}/docs/mcp`,
  });
}
