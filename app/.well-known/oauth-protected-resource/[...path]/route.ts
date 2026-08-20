import {
  PROTECTED_RESOURCE_PATH,
  originFromRequest,
  protectedResourceMetadata,
} from '@/lib/oauth/server';
import { SUPPORTED_SCOPES } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 9728 §3.1 — the canonical Protected Resource Metadata URL is built by
 *  inserting `/.well-known/oauth-protected-resource` BEFORE the resource's path
 *  component, so `https://host/api/mcp` resolves here rather than at the bare
 *  well-known root. Serving only the root form left this URL returning Next's
 *  HTML 404 page, which is enough for a strict client to abandon discovery
 *  instead of falling back to the `resource_metadata=` hint in our 401.
 *
 *  Scoped deliberately: only the real protected resource gets a document. Any
 *  other path 404s rather than echoing metadata for a resource we don't serve,
 *  which would invite a client to bind a token to a bogus audience. */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join('/') !== PROTECTED_RESOURCE_PATH) {
    return new Response(null, { status: 404 });
  }
  return Response.json(protectedResourceMetadata(originFromRequest(req), SUPPORTED_SCOPES));
}
