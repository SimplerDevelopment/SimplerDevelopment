# MCP Tool Reference — SimplerDevelopment

> **Audience:** humans and AI agents connecting to the SimplerDevelopment MCP server.
> **Sibling docs:** [API Index](./api-index.md) · [Architecture](./architecture-for-agents.md) · [AI Overview](./ai-overview.md) · [Repository Map](./repository-map.md) · [Workflow Reference](./workflow-reference.md) · [Glossary](./glossary.md) · [/llms.txt](/llms.txt)

---

## Overview

The MCP server exposes **450 tools** across every portal domain via a single HTTP endpoint. The tool set is registry-locked — adding, removing, or renaming a tool without updating the baseline test fails the pre-push gate.

| Fact | Value |
|---|---|
| Endpoint | `POST /api/mcp` |
| Transport | MCP Streamable HTTP (not SSE) |
| Total tools | 450 (under `*` scope) |
| Resources | 4 |
| Prompts | 3 |
| Registry test | `tests/unit/mcp-tool-registry-baseline.test.ts` |
| Implementation | `lib/mcp/server.ts`, `lib/mcp/tools/<domain>.ts` |

---

## Credentials

Two credential types are accepted as `Authorization: Bearer <credential>`:

| Type | Prefix | How to obtain | Storage |
|---|---|---|---|
| Portal API key | `sd_mcp_` | Portal → Settings → API Keys | SHA-256 hashed in `portal_api_keys` table |
| OAuth 2.0 token | `sd_oauth_` | Auth-code flow (`lib/oauth/server.ts`) | RFC 8707 audience binding |

**OAuth 2.0 flow:** standard authorization-code flow. Resource indicators per RFC 8707 bind tokens to an audience. Scopes requested at authorization time determine which tools are accessible. The OAuth client management API lives at `/api/portal/oauth-clients`; there is no self-serve public developer console yet.

---

## Scopes {#scopes}

Every tool registration calls `hasScope(ctx.scopes, ...)` before executing. A missing scope guard is a tenancy bug and is caught by the registry baseline test.

### Scope syntax

- **Named scope:** `<domain>:<access>` — e.g. `brain:read`, `kanban:write`, `email:send`
- **Wildcard:** `*` — grants access to all 450 tools
- **Unscoped tools:** `whoami`, `list_workflows`, `get_workflow` — callable without any scope

### Named scopes

| Scope | Grants access to |
|---|---|
| `brain:read` | Read-only brain tools (notes, documents, meetings, etc.) |
| `brain:write` | Write brain tools (create/update notes, tasks, meetings, etc.) |
| `brain:approve` | Approve review items and decisions |
| `kanban:read` | Read boards, cards, columns |
| `kanban:write` | Create/update/delete cards, columns, labels, etc. |
| `crm:read` | Read contacts, companies, deals, pipelines |
| `crm:write` | Create/update CRM records |
| `store:read` | Read products, orders, customers |
| `store:write` | Create/update store records |
| `email:read` | Read campaigns, lists, subscribers |
| `email:write` | Create/update email records |
| `email:send` | Send or schedule campaigns |
| `posts:read` | Read CMS posts and pages |
| `posts:write` | Create/update posts, upload HTML |
| `sites:read` | Read site config, domains, env vars |
| `sites:write` | Update site config, manage domains |
| `projects:read` | Read projects and artifacts |
| `projects:write` | Create/update projects |
| `tickets:read` | Read support tickets |
| `tickets:write` | Reply to and update tickets |
| `bookings:read` | Read booking pages and records |
| `bookings:write` | Update or cancel bookings |
| `branding:read` | Read brand profiles and messaging |
| `branding:write` | Create/update brand profiles |
| `media:read` | List media assets |
| `media:write` | Upload and delete media |
| `surveys:read` | Read surveys and responses |
| `surveys:write` | Create/update surveys |
| `approvals:manage` | Approve or reject pending approval requests |
| `services:read` | Read service catalog |
| `*` | All tools |

> Approximately 50 named scopes exist. The canonical list is in `lib/oauth/scopes.ts`.

---

## Approval-link pattern

Most **live-content write tools** do not mutate immediately. Instead they mint an approval URL (`lib/mcp/approvals.ts`) that a human must click to confirm the change. This is intentional — it prevents agents from making unreviewed destructive edits.

**Rules:**
- Metadata and draft operations mutate **immediately** (no approval needed).
- Live-content mutations (publish, delete, send) require click-through approval.
- Approval URLs are returned in the tool response as `approvalUrl`.
- The approval UI lives at `app/approve/`. Management API at `app/api/approve/`.

When an agent tool returns `{ "approvalUrl": "https://..." }`, the operation is **pending** — it has not taken effect. Surface the URL to a human for review.

---

## Tool families

450 tools grouped by namespace. Tools within a family share the same scope prefix (e.g. `brain:read` / `brain:write`).

### brain_* — 156 tools

Company Brain: the knowledge management and CRM-read layer. Largest family in the catalogue.

| Sub-group | What it covers |
|---|---|
| Notes | Create, read, update, delete, restore, bulk-update, list, history |
| Tasks | Create, read, update, list, propose |
| Meetings | Create, read, update, link, list |
| Documents | Full lifecycle: create, publish, archive, unarchive, delete, link, promote-from-note; versions (get/list/edit-draft); required-reads (assign/remove/list); acknowledgments (list/acknowledge); compliance report |
| Decisions | Create, read, update, reject, supersede, list |
| Glossary | Create, read, update, delete, list, lookup, bulk-import |
| Goals | Create, read, update, delete, list, check-in |
| Initiatives | Create, read, update, close, reopen, link/unlink/list-links, list |
| Org units | Create, read, update, delete, list, tree, merge, move, add/remove/set-primary member |
| People | Create, read, update, delete, list, attach/detach expertise |
| Expertise tags | Create, read, update, delete, list, merge |
| Playbooks | Create, read, update, delete, list, activate, archive, add/remove/reorder/update steps |
| Playbook runs | Start, get, list, advance, abort, list-active-for-entity; steps: complete, skip |
| Review queue | Get, list, approve, reject; list-for-reviewer, suggest-reviewer |
| Saved searches | Create, read, update, delete, list |
| Topics | Create, read, update, delete, list, tree, merge, move, attach/detach, entities, import-from-tags |
| Relationships | Create, read, update, delete, list |
| Classify / apply | classify-notes, apply-classifications, bulk-update-notes |
| CRM read-lens | get-company, list-companies, get-contact, list-contacts, get-deal, list-deals, get-post, list-posts |
| RAG | search (semantic + keyword over all Brain content) |
| Misc | dashboard-summary, who-knows |

### kanban_* — 39 tools

| Tool group | What it covers |
|---|---|
| Board | list-board |
| Columns | create, update, delete |
| Cards | create, update, delete, move |
| Card details | assign/unassign, attach-label/detach-label, attach-file-from-url |
| Card metadata | add/remove/list blockers, list dependencies, list assignees |
| Comments | add-comment, list-comments |
| Time logging | log-time |
| Checklists | add, update, delete, list |
| Artifacts | link, unlink, toggle-pin, list |
| Labels | create, update, delete, list |
| Templates | create, delete, list (card templates) |
| Recurrences | create, delete, list |
| Sprints | propose-sprint |

### crm_* — 34 tools

| Tool group | What it covers |
|---|---|
| Contacts | create, search, update |
| Companies | create, search, update |
| Deals | create, get, list, update, delete, move-stage |
| Pipelines | create, list, update, add-stage, update-stage |
| Activities | create, list |
| Deal comments | create, delete, list |
| Deal artifacts | link, unlink, toggle-pin, list |
| Custom fields | create, update, delete, list |
| Custom field values | get, set |
| Saved views | list |
| Scoring rules | list |

### store_* — 28 tools

| Tool group | What it covers |
|---|---|
| Products | create, get, list, update, delete, adjust-inventory |
| Product variants | create, update |
| Product options | create |
| Product option values | create |
| Categories | create, list |
| Orders | get, list, update-status, add-note |
| Discounts | create, delete, list, toggle |
| Customers | get, list |
| Customer messages | list, reply |
| Reviews | list, moderate |
| Settings | get |

### email_* — 20 tools

| Tool group | What it covers |
|---|---|
| Campaigns | create, list, update, delete, fork, send, schedule |
| Lists | list (all lists), create, update, delete |
| Segments | create, list |
| Subscribers | add, list, update, remove |
| Templates | create, list |

### post_types_* — 13 tools

Custom post-type registry: define per-tenant content types with custom field schemas, render code, and Liquid templates.

`create`, `get`, `list`, `update`, `delete` · `fields_create`, `fields_list`, `fields_update`, `fields_delete` · `get_code`, `update_code`, `get_template`, `update_template`

### decks_* — 13 tools

Presentation deck management.

`create`, `get`, `list`, `update`, `delete`, `fork` · `add_slide` · `replace_slides` · `upload_html`, `upload_html_zip` · `publish_all`, `publish_slide`

### posts_* — 10 tools

CMS posts and pages.

`create`, `get`, `list`, `update`, `delete`, `fork` · `upload_html`, `upload_html_zip` · `list_revisions` · `set_taxonomies`

### projects_* — 8 tools

`create`, `list`, `update` · `artifact_link`, `artifact_unlink`, `artifact_toggle_pin`, `artifacts_list` · `propose_artifact_link`

### booking_pages_* / bookings_* — 9 tools

**Booking pages:** `create`, `get`, `list`, `update`
**Bookings:** `get`, `list`, `update`, `cancel`
Plus analytics (1 tool).

### branding_* — 9 tools

`create_profile`, `get_profile`, `list_profiles`, `update_profile`, `delete_profile` · `get_messaging`, `update_messaging` · `check_contrast` · `audit`

### block_templates_* — 7 tools

Reusable block template library.

`create`, `get`, `list`, `update`, `delete`, `fork`, `publish`

### surveys_* — 7 tools

`create`, `get`, `list`, `update`, `fork` · `list_responses`
Plus analytics (1 tool).

### nav_* — 6 tools

Navigation tree management.

`create`, `list`, `update`, `delete`, `publish`, `publish_all`

### tickets_* — 6 tools

Support tickets.

`create`, `get`, `list`, `update`, `reply`, `attach_file_from_url`

### website_* — 6 tools

Per-site configuration: domains and environment variables.

`domains_add`, `domains_list`, `domains_remove` · `env_vars_set`, `env_vars_list`, `env_vars_delete`

### automations_* — ~5 tools

`create`, `list`, `update`, `delete`, `toggle`

### media_* — ~5 tools

`register`, `list`, `delete`, `upload_from_url`, `upload_presign`

### sites_* — ~5 tools

`create`, `list`, `update`, `get_custom_code`, `update_custom_code`, `publish_custom_code`

### chat_* — ~5 tools

Live-chat session management (internal; exact tool names may vary).

### proposals_* — ~5 tools

`create`, `get`, `list`, `update`, `send`

### team_* — 4 tools

`invite`, `list_members`, `remove_member`, `update_role`

### ai_* — 4 tools

AI credit management.

`credits_balance`, `credits_ledger` · `conversations_get`, `conversations_list`

### approvals_* — 4 tools

Approval workflow management (distinct from the approval-link pattern above; these are first-class approval records).

`get`, `list`, `approve`, `reject`

### linkedin_* — 4 tools

LinkedIn content and scheduling tools.

### contracts_* — 4 tools

`create`, `get`, `list`, `void`

### sprints_* — 4 tools

`create`, `get` (via `list`), `update`, `delete`

### taxonomies_* — ~3 tools

`create_category`, `create_tag`, `list`

### service_* — ~3 tools

`service_catalog_list`, `service_requests_create`, `service_requests_list`

### invoices_* — ~3 tools

`get`, `list`

### hosting_* — 2 tools

`get`, `list`

### integrations_* — 2 tools

`list`, `revoke`

### gift_certificates_* — 2 tools

`issue`, `list`

### profile_* — 2 tools

`get`, `update`

### client_* — 2 tools

`get`, `update`

### notifications_* — 2 tools

Notification preferences management.

### Unscoped tools

| Tool | Description |
|---|---|
| `whoami` | Returns the authenticated identity and active client context |
| `list_workflows` | Lists available automation workflow definitions |
| `get_workflow` | Gets a single workflow definition |

---

## MCP Resources

Resources are read-only context documents — not tools. They surface structured data that AI clients can attach to their context window without making a tool call.

| Resource URI | Scope required | What it contains |
|---|---|---|
| `blocks://schema` | None (unscoped) | Full block catalog — all 47 built-in types with their input schemas. Same data as `GET /api/v1/sites/{siteId}/blocks` but as an MCP resource. |
| `brand://default` | `branding:read` | The active tenant's default brand profile (colors, typography, logo, messaging). |
| `catalog://services` | `services:read` | The published service catalog for the active client. |
| `portal://capabilities` | None (unscoped) | Capability manifest: what tools, resources, and prompts are registered for this client's key + scope combination. |

---

## MCP Prompts

Prompts are user-triggered guided workflows surfaced as slash-commands in capable MCP clients (e.g. Claude Desktop, Claude Code). They return a message template; the client's model then executes the workflow using the available tools. Prompts exist for clients **without** the Claude Code skill library — the set is intentionally small.

| Prompt name | Scope required | What it does |
|---|---|---|
| `draft-page` | `sites:write` | Guided workflow for drafting and publishing a new site page. Collects intent, block selection, and content from the user before calling posts/nav tools. |
| `triage-tickets` | `tickets:read` | Walks through open support tickets, categorizes them, and suggests assignees or responses. |
| `weekly-digest` | `projects:read` | Generates a weekly progress digest across active projects, kanban sprints, and brain initiatives. |

---

## Registry baseline test

**`tests/unit/mcp-tool-registry-baseline.test.ts`**

- Builds the MCP server against a mocked DB (no live database needed).
- Asserts the **exact** set of registered tool names, resource URIs, and prompt names against hardcoded `EXPECTED_TOOLS`, `EXPECTED_RESOURCES`, `EXPECTED_PROMPTS` constants.
- Runs in the **unit layer** (`bun test` / pre-push gate) — drift fails on every commit.
- Also asserts that every tool is gated by `hasScope(...)` (missing guard = tenancy leak = test failure).

**After adding, removing, or renaming a tool:** run `bun test:unit -- tests/unit/mcp-tool-registry-baseline` and reconcile the constants. The `simplerdev-mcp-tool` skill performs all four lockstep changes (handler, input schema, scope guard, telemetry) in one pass.

---

## Implementation notes for contributors

- **Adding a tool:** use the `simplerdev-mcp-tool` skill. Do **not** hand-roll — the lockstep (handler + Zod schema + `hasScope` guard + telemetry registration) is easy to get wrong.
- **Token budget:** default to slim projections (`lib/mcp/projections.ts`). Echo `{ id, slug, status }` on writes, not the full row. Add an `include` opt-in flag for heavy fields (body/HTML/block JSON). The `simplerdev-mcp-token-budget` skill audits heavy responses.
- **God files to avoid reading whole:** `lib/brain/mcp-sdk-adapter.ts` (5630 lines), `lib/mcp/tools/cms.ts` (2216 lines), `lib/mcp/tools/crm.ts` (1670 lines), `lib/mcp/tools/kanban.ts` (1484 lines), `lib/mcp/approvals.ts` (1193 lines). Use an Explore subagent for cross-cutting questions over these files.
- **Telemetry:** per-call latency and token cost are recorded in `lib/mcp/telemetry.ts`. Do not bypass.
