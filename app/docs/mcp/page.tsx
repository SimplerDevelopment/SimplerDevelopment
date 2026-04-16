export const metadata = {
  title: 'MCP Server – SimplerDevelopment',
  description: 'Connect Claude (or any MCP client) to your SimplerDevelopment portal.',
};

export default function McpDocsPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-6 prose prose-neutral dark:prose-invert">
      <h1>SimplerDevelopment MCP Server</h1>
      <p>
        The portal exposes a <a href="https://modelcontextprotocol.io">Model Context Protocol</a>{' '}
        server that lets Claude (Desktop, Code, or the API) manage your portal programmatically —
        projects, tickets, CRM, content, media, and email.
      </p>

      <h2>1. Generate an API key</h2>
      <ol>
        <li>Open <a href="/portal/settings/api-keys"><code>/portal/settings/api-keys</code></a>.</li>
        <li>Click <strong>New key</strong>, name it, choose scopes, generate.</li>
        <li>Copy the <code>sd_mcp_…</code> value — it&apos;s shown <em>once</em>.</li>
      </ol>

      <h2>2. Endpoint</h2>
      <pre><code>POST https://your-domain.com/api/mcp
Authorization: Bearer sd_mcp_your_key_here</code></pre>
      <p>The server uses the MCP Streamable HTTP transport in stateless mode. It accepts GET, POST, and DELETE.</p>

      <h2>3. Claude Desktop config</h2>
      <p>
        Claude Desktop expects stdio-style MCP servers. Use <code>mcp-remote</code> as a bridge:
      </p>
      <pre><code>{`{
  "mcpServers": {
    "simplerdevelopment": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://your-domain.com/api/mcp",
        "--header",
        "Authorization: Bearer sd_mcp_your_key_here"
      ]
    }
  }
}`}</code></pre>

      <h2>4. Claude Code</h2>
      <pre><code>{`claude mcp add --transport http simplerdevelopment \\
  https://your-domain.com/api/mcp \\
  --header "Authorization: Bearer sd_mcp_your_key_here"`}</code></pre>

      <h2>Available tools (Wave 1)</h2>
      <ul>
        <li><strong>whoami</strong> — confirm authenticated client/user</li>
        <li><strong>projects_list / create / update</strong></li>
        <li><strong>kanban_list_board / create_card / move_card</strong></li>
        <li><strong>tickets_list / get / create / reply</strong></li>
        <li><strong>crm_contacts_search / create</strong></li>
        <li><strong>crm_companies_search / create</strong></li>
        <li><strong>crm_deals_list / create / move_stage</strong></li>
        <li><strong>crm_pipelines_list</strong></li>
        <li><strong>sites_list</strong></li>
        <li><strong>posts_list / create / update</strong></li>
        <li><strong>media_list</strong></li>
        <li><strong>email_lists / email_campaigns_list</strong></li>
      </ul>

      <h2>Scopes</h2>
      <p>
        Keys carry scopes like <code>projects:read</code>, <code>crm:*</code>, or <code>*</code> for full
        portal access. Tools check scopes before running — a key scoped to{' '}
        <code>projects:*</code> can&apos;t modify CRM data.
      </p>

      <h2>Security</h2>
      <ul>
        <li>Keys are hashed (SHA-256) at rest — the raw key is returned once at creation.</li>
        <li>All tools are scoped to the client that owns the key; no cross-tenant access.</li>
        <li>Revoke a key at any time from the settings page — takes effect immediately.</li>
      </ul>
    </div>
  );
}
