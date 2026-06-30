import { MCPClient } from '@mastra/mcp';

/**
 * Client for the SimplerDevelopment portal MCP server.
 *
 * The SD MCP is a stateless Streamable-HTTP endpoint (`POST /api/mcp`) in the
 * parent Next app, guarded by a Bearer portal API key (`sd_mcp_...`). The set of
 * tools handed back is whatever that key's scopes allow (e.g. `brain:read`,
 * `brain:write`). See BRAIN_AGENT_README.md for how to start the app + mint a key.
 *
 * This is the whole point of the example: we DON'T re-implement the ~400 portal
 * tools — we connect to the running MCP server as a client and inherit them.
 */
const SD_MCP_URL = process.env.SD_MCP_URL ?? 'http://localhost:3000/api/mcp';
const SD_MCP_API_KEY = process.env.SD_MCP_API_KEY;

export const sdMcpConfigured = Boolean(SD_MCP_API_KEY);
// Multi-tenant mode: the service runs behind the parent app, which drives it
// over the private network and supplies a per-tenant token per request via
// requestContext. Presence of the inbound shared secret marks this mode — tools
// resolve without a static key because auth arrives per request.
const sdMcpMultiTenant = Boolean(process.env.SD_AGENTS_INTERNAL_SECRET);

export const sdMcp = new MCPClient({
  id: 'simplerdev-portal', // stable id so dev hot-reload reuses the connection
  servers: {
    simplerdev: {
      url: new URL(SD_MCP_URL),
      // Per-request token injection: each agent run forwards the tenant's short-lived
      // `sd_oauth_…` token via requestContext, so a single MCPClient instance can
      // serve requests for different tenants without rebuilding. Falls back to the
      // static SD_MCP_API_KEY for local/dev/CLI usage where no context is available.
      // If neither is present, no Authorization header is sent.
      fetch: (
        url: string | URL,
        init?: RequestInit,
        requestContext?: { get(key: string): unknown } | null,
      ) => {
        const headers = new Headers(init?.headers);
        const contextToken = requestContext?.get('token') as string | undefined;
        const token = contextToken ?? SD_MCP_API_KEY;
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(url, { ...init, headers });
      },
    },
  },
});

/**
 * Lazy tool loader. Resolves the scoped SD tool catalogue over HTTP on first use
 * (not at import time) so this package still builds/loads when the parent app
 * isn't running. Throws a readable error if no key is configured.
 */
export async function sdTools() {
  if (!sdMcpConfigured && !sdMcpMultiTenant) {
    throw new Error(
      'SD MCP is not configured — the Brain agent has no tools. Either set ' +
        'SD_MCP_API_KEY (dev/CLI: mint a portal key sd_mcp_... with brain:read+brain:write), ' +
        'or run behind the parent app in multi-tenant mode (SD_AGENTS_INTERNAL_SECRET set, ' +
        'per-tenant token supplied per request). See BRAIN_AGENT_README.md.',
    );
  }
  return sdMcp.listTools();
}
