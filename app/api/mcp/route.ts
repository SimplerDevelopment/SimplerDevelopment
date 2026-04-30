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

export async function GET(req: Request)    { return handle(req); }
export async function POST(req: Request)   { return handle(req); }
export async function DELETE(req: Request) { return handle(req); }
