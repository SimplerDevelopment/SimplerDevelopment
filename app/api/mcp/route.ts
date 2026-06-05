import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolvePortalFromRequest } from '@/lib/mcp-auth';
import { buildMcpServer } from '@/lib/mcp/server';
import { originFromRequest } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized(req: Request) {
  // RFC 9728 — point MCP clients at the protected-resource metadata so they
  // can discover the authorization server and start the OAuth dance.
  const origin = originFromRequest(req);
  const challenge = `Bearer realm="simplerdevelopment-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' } }),
    { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': challenge } }
  );
}

async function handle(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const authDiag = authHeader
    ? `present prefix=${authHeader.slice(0, 20)}`
    : 'MISSING';
  console.error('[mcp] auth header:', authDiag);
  const ctx = await resolvePortalFromRequest(req);
  if (!ctx) return unauthorized(req);

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
