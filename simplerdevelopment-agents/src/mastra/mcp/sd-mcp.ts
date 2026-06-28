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

export const sdMcp = new MCPClient({
  id: 'simplerdev-portal', // stable id so dev hot-reload reuses the connection
  servers: {
    simplerdev: {
      url: new URL(SD_MCP_URL),
      // ponytail: a static bearer header is all the stateless SD server needs.
      // Swap to the `fetch` option if you ever need to refresh the token per call.
      requestInit: SD_MCP_API_KEY
        ? { headers: { Authorization: `Bearer ${SD_MCP_API_KEY}` } }
        : undefined,
    },
  },
});

/**
 * Lazy tool loader. Resolves the scoped SD tool catalogue over HTTP on first use
 * (not at import time) so this package still builds/loads when the parent app
 * isn't running. Throws a readable error if no key is configured.
 */
export async function sdTools() {
  if (!sdMcpConfigured) {
    throw new Error(
      'SD_MCP_API_KEY is not set — the Brain agent has no tools. Start the parent ' +
        'Next app, mint a portal API key (sd_mcp_...) with brain:read+brain:write, ' +
        'then set SD_MCP_URL + SD_MCP_API_KEY in .env. See BRAIN_AGENT_README.md.',
    );
  }
  return sdMcp.listTools();
}
