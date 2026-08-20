import { originFromRequest, protectedResourceMetadata } from '@/lib/oauth/server';
import { SUPPORTED_SCOPES } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 9728 — Protected Resource Metadata. The MCP spec instructs clients to
 *  fetch this from the `resource_metadata` parameter of the WWW-Authenticate
 *  header returned by the protected `/api/mcp` endpoint, and use it to
 *  discover which authorization server(s) issue tokens for the resource.
 *
 *  The RFC's own canonical location is the path-scoped sibling of this route
 *  (`./[...path]/route.ts`); both serve the same document. */
export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(originFromRequest(req), SUPPORTED_SCOPES));
}
