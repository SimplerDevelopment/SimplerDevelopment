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
        <li><strong>sprints_list / create / update</strong></li>
        <li><strong>kanban_list_board / create_column / update_column / delete_column / create_card / update_card / move_card / delete_card</strong></li>
        <li><strong>kanban_card_list_comments / add_comment / log_time</strong></li>
        <li><strong>tickets_list / get / create / reply / update</strong></li>
        <li><strong>crm_contacts_search / create / update</strong></li>
        <li><strong>crm_companies_search / create / update</strong></li>
        <li><strong>crm_deals_list / create / update / move_stage</strong></li>
        <li><strong>crm_pipelines_list / create / update / add_stage / update_stage</strong></li>
        <li><strong>crm_activities_list / create</strong></li>
        <li><strong>crm_custom_fields_list / create</strong></li>
        <li><strong>crm_saved_views_list / crm_scoring_rules_list</strong></li>
        <li><strong>sites_list / update</strong></li>
        <li><strong>website_domains_list / add / remove</strong></li>
        <li><strong>website_env_vars_list / set / delete</strong></li>
        <li><strong>nav_list / create / delete</strong></li>
        <li><strong>posts_list / create / update / delete / set_taxonomies / list_revisions</strong></li>
        <li><strong>taxonomies_list / create_category / create_tag</strong></li>
        <li><strong>block_templates_list / get</strong></li>
        <li><strong>decks_list / get / create / update / replace_slides / add_slide / delete</strong></li>
        <li><strong>media_list / upload_from_url / delete</strong></li>
        <li><strong>email_lists / email_lists_create / update / delete</strong></li>
        <li><strong>email_subscribers_list / add / update / remove</strong></li>
        <li><strong>email_campaigns_list / create / update / delete / send / schedule</strong></li>
        <li><strong>email_templates_list / create</strong></li>
        <li><strong>email_segments_list / create</strong></li>
        <li><strong>surveys_list / get / create / update / list_responses</strong></li>
        <li><strong>booking_pages_list / get</strong></li>
        <li><strong>bookings_list / get / update / cancel</strong></li>
        <li><strong>gift_certificates_list / issue</strong></li>
        <li><strong>automations_list / toggle / create / update / delete</strong></li>
        <li><strong>team_list_members / update_role / remove_member</strong></li>
        <li><strong>client_get / client_update</strong></li>
        <li><strong>kanban_card_attach_file_from_url</strong></li>
        <li><strong>ai_credits_balance / ledger</strong></li>
        <li><strong>branding_list_profiles / get_profile / get_messaging / audit / check_contrast</strong></li>
        <li><strong>branding_create_profile / update_profile / delete_profile / update_messaging</strong></li>
        <li><strong>hosting_list / hosting_get</strong></li>
        <li><strong>my_tasks_list</strong></li>
        <li><strong>approvals_list / get / approve / reject</strong></li>
        <li><strong>proposals_list / get / create / update / send</strong></li>
        <li><strong>contracts_list / get / create / void</strong></li>
        <li><strong>invoices_list / get</strong></li>
        <li><strong>service_catalog_list / service_requests_list / service_requests_create</strong></li>
        <li><strong>suggested_projects_list / suggested_project_requests_create</strong></li>
        <li><strong>ai_conversations_list / get</strong></li>
        <li><strong>store_products_list / get / create / update / delete / adjust_inventory</strong></li>
        <li><strong>store_product_options_create / option_values_create</strong></li>
        <li><strong>store_product_variants_create / update</strong></li>
        <li><strong>store_categories_list / create</strong></li>
        <li><strong>store_orders_list / get / update_status / add_note</strong></li>
        <li><strong>store_customers_list / get</strong></li>
        <li><strong>store_discounts_list / create / toggle / delete</strong></li>
        <li><strong>store_reviews_list / moderate</strong></li>
        <li><strong>store_customer_messages_list / reply</strong></li>
        <li><strong>store_settings_get</strong></li>
      </ul>

      <h2>Scopes</h2>
      <p>
        Keys carry scopes like <code>projects:read</code>, <code>crm:*</code>, or <code>*</code> for full
        portal access. Tools check scopes before running — a key scoped to{' '}
        <code>projects:*</code> can&apos;t modify CRM data.
      </p>

      <h2>CMS approval workflow</h2>
      <p>
        For AI agents editing live client content, set <code>require_cms_approval = true</code> on the API key.
        Instead of applying directly, covered tools stage the change into{' '}
        <code>mcp_pending_changes</code> and return <code>{`{ pending: true, pendingId, summary }`}</code>.
      </p>
      <p>A staff user with <code>approvals:manage</code> scope reviews via the approvals tools:</p>
      <pre><code>{`// List pending
approvals_list({ status: "pending" })

// Inspect with diff snapshot
approvals_get({ id: 42 })

// Apply or reject
approvals_approve({ id: 42, note: "looks good" })
approvals_reject({ id: 42, note: "wrong tone" })`}</code></pre>
      <p>
        Approval re-runs the original mutation with the stored payload.
        Writer keys (<code>require_cms_approval = true</code>) cannot self-approve — enforced by scope.
      </p>
      <p>
        <strong>Covered tools:</strong> <code>posts_create/update/delete</code>,{' '}
        <code>decks_create/update/replace_slides/add_slide/delete</code>,{' '}
        <code>proposals_create/update/send</code>,{' '}
        <code>email_campaigns_create/update/delete/send</code>.
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
