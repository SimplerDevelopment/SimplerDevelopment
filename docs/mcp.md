# MCP Server — Connect an AI Agent

The portal exposes a [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude (Desktop, Code, or the API) manage your portal programmatically — projects, tickets, CRM, content, media, and email.

---

## Option A — Claude.ai (one-click, recommended)

Claude.ai web has a custom-connector dialog that handles login and consent for you. No API key to copy and paste.

1. In Claude.ai → **Settings → Connectors → Browse connectors → Add custom connector**.
2. Name: **SimplerDevelopment**.
3. Remote MCP server URL: `https://www.simplerdevelopment.com/api/mcp`
4. Leave the OAuth fields blank — Claude registers itself automatically.
5. Click **Add**. You'll be redirected to your portal login (if not already signed in), then to a consent screen showing what Claude is asking for. Approve to finish.

Behind the scenes this uses OAuth 2.1 with PKCE. Tokens are scoped to whichever portal you choose on the consent screen and can be revoked at any time from [`/portal/settings/api-keys`](/portal/settings/api-keys).

---

## Option B — API key (Claude Code, scripts, headless)

Use this for non-interactive clients (Claude Code agents, custom scripts, CI). The OAuth flow above is easier for end users.

### 1. Generate an API key

1. Open [`/portal/settings/api-keys`](/portal/settings/api-keys).
2. Click **New key**, name it, choose scopes, generate.
3. Copy the `sd_mcp_…` value — it's shown *once*.

### 2. Endpoint

```http
POST https://www.simplerdevelopment.com/api/mcp
Authorization: Bearer sd_mcp_your_key_here
```

The server uses the MCP Streamable HTTP transport in stateless mode. It accepts GET, POST, and DELETE.

### 3. Claude Desktop config

Claude Desktop expects stdio-style MCP servers. Use `mcp-remote` as a bridge:

```json
{
  "mcpServers": {
    "simplerdevelopment": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.simplerdevelopment.com/api/mcp",
        "--header",
        "Authorization: Bearer sd_mcp_your_key_here"
      ]
    }
  }
}
```

### 4. Claude Code

```bash
claude mcp add --transport http simplerdevelopment \
  https://www.simplerdevelopment.com/api/mcp \
  --header "Authorization: Bearer sd_mcp_your_key_here"
```

---

## Available tools (Wave 1)

- **whoami** — confirm authenticated client/user
- **projects_list / create / update**
- **sprints_list / create / update**
- **kanban_list_board / create_column / update_column / delete_column / create_card / update_card / move_card / delete_card**
- **kanban_card_list_comments / add_comment / log_time**
- **tickets_list / get / create / reply / update**
- **crm_contacts_search / create / update**
- **crm_companies_search / create / update**
- **crm_deals_list / create / update / move_stage**
- **crm_pipelines_list / create / update / add_stage / update_stage**
- **crm_activities_list / create**
- **crm_custom_fields_list / create**
- **crm_saved_views_list / crm_scoring_rules_list**
- **sites_list / update**
- **website_domains_list / add / remove**
- **website_env_vars_list / set / delete**
- **nav_list / create / delete**
- **posts_list / create / update / delete / set_taxonomies / list_revisions**
- **taxonomies_list / create_category / create_tag**
- **block_templates_list / get**
- **decks_list / get / create / update / replace_slides / add_slide / delete**
- **media_list / upload_from_url / delete**
- **email_lists / email_lists_create / update / delete**
- **email_subscribers_list / add / update / remove**
- **email_campaigns_list / create / update / delete / send / schedule**
- **email_templates_list / create**
- **email_segments_list / create**
- **surveys_list / get / create / update / list_responses**
- **booking_pages_list / get**
- **bookings_list / get / update / cancel**
- **gift_certificates_list / issue**
- **automations_list / toggle / create / update / delete**
- **team_list_members / update_role / remove_member**
- **client_get / client_update**
- **kanban_card_attach_file_from_url**
- **ai_credits_balance / ledger**
- **branding_list_profiles / get_profile / get_messaging / audit / check_contrast**
- **branding_create_profile / update_profile / delete_profile / update_messaging**
- **hosting_list / hosting_get**
- **my_tasks_list**
- **approvals_list / get / approve / reject**
- **proposals_list / get / create / update / send**
- **contracts_list / get / create / void**
- **invoices_list / get**
- **service_catalog_list / service_requests_list / service_requests_create**
- **suggested_projects_list / suggested_project_requests_create**
- **ai_conversations_list / get**
- **store_products_list / get / create / update / delete / adjust_inventory**
- **store_product_options_create / option_values_create**
- **store_product_variants_create / update**
- **store_categories_list / create**
- **store_orders_list / get / update_status / add_note**
- **store_customers_list / get**
- **store_discounts_list / create / toggle / delete**
- **store_reviews_list / moderate**
- **store_customer_messages_list / reply**
- **store_settings_get**

---

## Scopes

Keys carry scopes like `projects:read`, `crm:*`, or `*` for full portal access. Tools check scopes before running — a key scoped to `projects:*` can't modify CRM data.

---

## CMS approval workflow

For AI agents editing live client content, set `require_cms_approval = true` on the API key. Instead of applying directly, covered tools stage the change into `mcp_pending_changes` and return `{ pending: true, pendingId, summary }`.

A staff user with `approvals:manage` scope reviews via the approvals tools:

```js
// List pending
approvals_list({ status: "pending" })

// Inspect with diff snapshot
approvals_get({ id: 42 })

// Apply or reject
approvals_approve({ id: 42, note: "looks good" })
approvals_reject({ id: 42, note: "wrong tone" })
```

Approval re-runs the original mutation with the stored payload. Writer keys (`require_cms_approval = true`) cannot self-approve — enforced by scope.

**Covered tools:** `posts_create/update/delete`, `decks_create/update/replace_slides/add_slide/delete`, `proposals_create/update/send`, `email_campaigns_create/update/delete/send`.

---

## Security

- Keys are hashed (SHA-256) at rest — the raw key is returned once at creation.
- All tools are scoped to the client that owns the key; no cross-tenant access.
- Revoke a key at any time from the settings page — takes effect immediately.
