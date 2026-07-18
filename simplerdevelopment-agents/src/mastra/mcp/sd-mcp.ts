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

// Multi-tenant mode: the service runs behind the parent app, which drives it
// over the private network and supplies a per-tenant token per request via
// requestContext. Presence of the inbound shared secret marks this mode — tools
// resolve without a static key because auth arrives per request.
const sdMcpMultiTenant = Boolean(process.env.SD_AGENTS_INTERNAL_SECRET);
// In multi-tenant mode the static key is dev/CLI-only and MUST NOT be used —
// a request that reached the portal with it would run unscoped instead of as
// the tenant. Treat it as absent so nothing (Studio proxies, tool listing,
// requests) can silently widen scope.
export const sdMcpConfigured = Boolean(SD_MCP_API_KEY) && !sdMcpMultiTenant;
if (sdMcpMultiTenant && SD_MCP_API_KEY) {
  console.warn(
    '[sd-mcp] SD_MCP_API_KEY is set but ignored: multi-tenant mode (SD_AGENTS_INTERNAL_SECRET) ' +
      'uses per-request tenant tokens only. Unset SD_MCP_API_KEY on this deployment.',
  );
}

/**
 * Resolve the Authorization token for one SD MCP request.
 *
 * Multi-tenant mode: the per-request tenant token is REQUIRED — throw rather
 * than fall back to the static key, which would run the request unscoped
 * (cross-tenant). Single-tenant dev/CLI: context token if present, else the
 * static key, else unauthenticated.
 *
 * `multiTenant`/`staticKey` are parameterized for tests only.
 */
export function resolveSdMcpAuthToken(
  contextToken: string | undefined,
  multiTenant: boolean = sdMcpMultiTenant,
  staticKey: string | undefined = SD_MCP_API_KEY,
): string | undefined {
  if (multiTenant) {
    if (!contextToken) {
      throw new Error(
        'SD MCP: multi-tenant mode requires a per-request tenant token ' +
          '(x-sd-tenant-token → requestContext). Refusing to send this request ' +
          'without one — no static-key fallback.',
      );
    }
    return contextToken;
  }
  return contextToken ?? staticKey;
}

export const sdMcp = new MCPClient({
  id: 'simplerdev-portal', // stable id so dev hot-reload reuses the connection
  servers: {
    simplerdev: {
      url: new URL(SD_MCP_URL),
      // Per-request token injection: each agent run forwards the tenant's short-lived
      // `sd_oauth_…` token via requestContext, so a single MCPClient instance can
      // serve requests for different tenants without rebuilding. In multi-tenant
      // mode the token is REQUIRED — fail closed rather than fall back to the
      // static key, which would silently run the request unscoped. The static
      // SD_MCP_API_KEY only applies in single-tenant local/dev/CLI usage.
      fetch: (
        url: string | URL,
        init?: RequestInit,
        requestContext?: { get(key: string): unknown } | null,
      ) => {
        const headers = new Headers(init?.headers);
        const contextToken = requestContext?.get('token') as string | undefined;
        const token = resolveSdMcpAuthToken(contextToken);
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
