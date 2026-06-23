import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolvePortalFromRequest } from '@/lib/mcp-auth';
import { buildMcpServer } from '@/lib/mcp/server';
import { originFromRequest, resourceIndicatorMatches } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized(req: Request) {
  // RFC 9728 — point MCP clients at the protected-resource metadata so they
  // can discover the authorization server and start the OAuth dance.
  const origin = originFromRequest(req);
  // MCP spec 2025-11-25 §Authorization: no realm, resource_metadata + scope.
  const challenge = `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="*"`;
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' } }),
    { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': challenge } }
  );
}

function invalidAudience(req: Request) {
  // RFC 8707 / RFC 6750 — the bearer token is audience-bound to a different
  // resource than this MCP endpoint. Respond with error="invalid_token" so the
  // client re-runs the OAuth dance requesting the correct `resource`.
  const origin = originFromRequest(req);
  const challenge =
    `Bearer error="invalid_token", ` +
    `error_description="token audience does not match this resource", ` +
    `resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="*"`;
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid token audience' } }),
    { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': challenge } }
  );
}

async function handle(req: Request): Promise<Response> {
  const ctx = await resolvePortalFromRequest(req);
  if (!ctx) return unauthorized(req);

  // RFC 8707 audience enforcement: a token bound to a `resource` must be
  // presented at that resource. `null` resource = unrestricted (backward-compat
  // for portal API keys and pre-resource OAuth tokens) and passes through.
  if (ctx.resource && !resourceIndicatorMatches(ctx.resource, `${originFromRequest(req)}/api/mcp`)) {
    return invalidAudience(req);
  }

  const server = buildMcpServer(ctx);
  // Stateless mode — each request is independent. Safe for serverless.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // McpServer#close is async; fire-and-forget in the serverless context.
    server.close().catch(() => {});
  }
}

// Stateless + JSON-response mode (enableJsonResponse=true) — there are no
// server-pushed notifications to stream on GET. Vercel serverless can't
// hold an idle SSE stream open: the function returns immediately with
// content-length: 0, and mcp-remote interprets the empty stream as a
// failure, then re-runs OAuth in a loop. Returning 405 makes mcp-remote
// skip the SSE channel (per its code: `if (response.status === 405) return;`)
// and use POST-only, which is what JSON-response mode expects.
export async function GET()                { return new Response(null, { status: 405, headers: { Allow: 'POST, DELETE' } }); }
export async function POST(req: Request)   { return handle(req); }
export async function DELETE(req: Request) { return handle(req); }
