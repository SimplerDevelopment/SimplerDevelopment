import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolvePortalFromRequest } from '@/lib/mcp-auth';
import { buildMcpServer } from '@/lib/mcp/server';
import {
  applyTarget,
  clientIdFromRpcBody,
  hydrateReachable,
  resolveTarget,
} from '@/lib/mcp/client-scope';
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

function batchedTenantConflict() {
  // The transport runs every message in a batch against ONE server, so two calls
  // naming different companies cannot both be honored. Refusing is the only safe
  // answer: picking one would write a tenant the caller didn't ask for.
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message:
          'A batched request may not mix companies: every tools/call in one batch must pass the same clientId. Send the calls separately.',
      },
    }),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  );
}

function noReachableClient() {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message:
          'This credential can no longer act for any company — the access it was granted has been removed. Re-authorize the connection.',
      },
    }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}

async function handle(req: Request): Promise<Response> {
  const base = await resolvePortalFromRequest(req);
  if (!base) return unauthorized(req);

  // RFC 8707 audience enforcement: a token bound to a `resource` must be
  // presented at that resource. `null` resource = unrestricted (backward-compat
  // for portal API keys and pre-resource OAuth tokens) and passes through.
  if (base.resource && !resourceIndicatorMatches(base.resource, `${originFromRequest(req)}/api/mcp`)) {
    return invalidAudience(req);
  }

  // Resolve the companies this credential may act for RIGHT NOW: the consent-time
  // allowlist intersected with live client_members. Done per request (the transport
  // is stateless, so that is also per call) — losing a membership takes effect
  // immediately, without waiting for the token to be revoked. The roster is needed
  // before the server is built because it shapes the instructions and the schemas.
  // hydrateReachable also guarantees roster.client is itself reachable — a revoked
  // default company must not keep serving initialize/resources/whoami data.
  const roster = await hydrateReachable(base);
  if (roster.reachable?.length === 0) return noReachableClient();

  // Read the body once so we can see which company the call names, then hand a
  // fresh Request carrying the same bytes to the transport. The target has to be
  // known BEFORE buildMcpServer: 31 registrars capture the tenant at registration
  // time, so resolving later would leave them pinned to the default company while
  // appearing to honor `clientId` (see lib/mcp/client-scope.ts).
  let ctx = roster;
  let forwarded = req;
  if (req.method === 'POST') {
    // Reconstruct unconditionally once we've read the stream — forwarding the
    // original after `.text()` hands the transport an already-consumed body.
    const bodyText = await req.text();
    forwarded = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      ...(bodyText ? { body: bodyText } : {}),
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // Malformed JSON is the transport's error to report, in its own format.
      parsed = null;
    }
    const named = clientIdFromRpcBody(parsed);
    if (named.kind === 'conflict') return batchedTenantConflict();
    // Only a tools/call is tenant-scoped; initialize / tools/list execute no
    // handler, so they run against the credential's default company.
    if (named.kind === 'call') ctx = applyTarget(roster, resolveTarget(roster, named.clientId));
  }

  const server = buildMcpServer(ctx);
  // Stateless mode — each request is independent. Safe for serverless.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(forwarded);
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
