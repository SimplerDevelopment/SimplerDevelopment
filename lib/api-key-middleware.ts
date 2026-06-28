import { NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit } from '@/lib/api-keys';
import { hasScope } from '@/lib/mcp-auth';

// Derive the scope a v1 request requires from its path. Store endpoints need
// `store:read`; everything else under /api/v1/sites is `content:read`.
function requiredScopeForPath(pathname: string): string {
  return /\/(products|product-categories)(\/|$)/.test(pathname) ? 'store:read' : 'content:read';
}

type RouteHandler = (
  req: Request,
  context: { params: Promise<{ siteId: string; [key: string]: string }> }
) => Promise<NextResponse>;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  };
}

export function withApiKeyAndCors(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders() });
    }

    const { siteId } = await context.params;
    const siteIdNum = parseInt(siteId, 10);

    // Extract API key from headers
    const authHeader = req.headers.get('authorization');
    const apiKeyHeader = req.headers.get('x-api-key');
    const key = authHeader?.startsWith('Bearer sd_live_')
      ? authHeader.slice(7)
      : apiKeyHeader?.startsWith('sd_live_')
        ? apiKeyHeader
        : null;

    // A valid API key is REQUIRED. A missing key used to fall through to the
    // handler, leaving the headless v1 surface effectively public.
    if (!key) {
      return NextResponse.json(
        { success: false, message: 'API key required' },
        { status: 401, headers: corsHeaders() },
      );
    }

    const record = await validateApiKey(key, siteIdNum);
    if (!record) {
      return NextResponse.json(
        { success: false, message: 'Invalid API key' },
        { status: 401, headers: corsHeaders() },
      );
    }

    // Per-key scope enforcement. A key with NO scopes is unrestricted (legacy /
    // full-access); a key WITH scopes is limited to them.
    const scopes = (record.scopes ?? []) as string[];
    if (scopes.length > 0) {
      const required = requiredScopeForPath(new URL(req.url).pathname);
      if (!hasScope(scopes, required)) {
        return NextResponse.json(
          { success: false, message: `Insufficient scope — '${required}' required` },
          { status: 403, headers: corsHeaders() },
        );
      }
    }

    const rateLimit = checkRateLimit(record.id, record.rateLimitPerMinute ?? 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...corsHeaders(),
            'Retry-After': String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(record.rateLimitPerMinute ?? 60),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    const response = await handler(req, context);

    // Add CORS headers to response
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders())) {
      headers.set(k, v);
    }

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
