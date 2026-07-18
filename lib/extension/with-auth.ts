/**
 * Auth + CORS wrapper for the `/api/extension/v1/**` namespace used by the
 * SimplerDevelopment browser extension.
 *
 * Mirrors `lib/api-key-middleware.ts:withApiKeyAndCors` in spirit but without
 * the per-site/website coupling — extension calls are tenant-scoped via the
 * portal API key (`sd_mcp_…` / `sd_oauth_…`), not via a site-id path param.
 *
 * Responsibilities:
 *   - Handle the CORS preflight (`OPTIONS`) — return 204 + permissive headers.
 *     We use `*` (rather than the calling extension's origin) because Chrome
 *     extension origins (`chrome-extension://<id>`) are quirky and only the
 *     wildcard works reliably; this is safe because we never accept credentials.
 *   - Validate the bearer token via `resolvePortalFromRequest` and pass the
 *     resolved `PortalMcpContext` to the handler.
 *   - Append CORS headers to every response (success or error) so even auth
 *     failures don't break the extension's UX.
 *   - Catch handler errors so a thrown exception is still a JSON envelope
 *     with the expected CORS headers (extensions cannot read opaque errors).
 */

import { NextResponse } from 'next/server';
import { resolvePortalFromRequest, type PortalMcpContext } from '@/lib/mcp-auth';

export type ExtensionHandler = (
  req: Request,
  ctx: PortalMcpContext,
) => Promise<NextResponse> | NextResponse;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

function corsJson(body: unknown, init?: ResponseInit): NextResponse {
  return withCors(NextResponse.json(body, init));
}

export function withExtensionAuth(handler: ExtensionHandler) {
  return async (req: Request): Promise<NextResponse> => {
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    let ctx: PortalMcpContext | null;
    try {
      ctx = await resolvePortalFromRequest(req);
    } catch (err) {
      console.error('[extension] auth resolution failed', err);
      return corsJson(
        { success: false, message: 'Authentication failed' },
        { status: 500 },
      );
    }
    if (!ctx) {
      return corsJson(
        { success: false, message: 'Invalid or missing API key' },
        { status: 401 },
      );
    }

    try {
      const res = await handler(req, ctx);
      return withCors(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      console.error('[extension] handler error', err);
      return corsJson({ success: false, message }, { status: 500 });
    }
  };
}

/** Convenience helper for endpoints that want to emit the standard envelope. */
export function extensionOk(data: unknown, init: ResponseInit = {}): NextResponse {
  return withCors(NextResponse.json({ success: true, data }, init));
}

export function extensionError(message: string, status = 400): NextResponse {
  return withCors(NextResponse.json({ success: false, message }, { status }));
}
