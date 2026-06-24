---
type: architecture
domain: platform
status: active
date: 2026-06-09
sources:
  - lib/db/schema/index.ts
  - lib/db/CLAUDE.md
  - drizzle.config.ts
  - scripts/verify-db-target.ts
  - package.json
---

# Data Model Overview

All data access flows through Drizzle ORM. The schema is split into per-domain modules under `lib/db/schema/`, each owning one product area. The public surface is a single barrel: `lib/db/schema/index.ts`. Consumers import from `@/lib/db/schema` — never reach into individual domain modules directly.

`drizzle.config.ts` points drizzle-kit at the barrel for migration generation and at `./drizzle` for output.

---

## Per-Domain Module Map

| Module | Tables / primary domains |
|---|---|
| `lib/db/schema/auth.ts` | `users`, `github_connections`, `api_keys`, `portal_api_keys`, `user_onboarding` — auth identities and API credentials |
| `lib/db/schema/sites.ts` | `clients`, `client_members`, `client_websites`, `website_domains`, `website_environments`, `website_env_vars`, `website_backups`, `google_website_tokens`, `site_branding`, `site_navigation`, `hosted_sites`, `site_tracking`, `http_request_logs`, `custom_domain_history`, `services`, `client_services`, `service_requests` — tenant provisioning and site infrastructure |
| `lib/db/schema/cms.ts` | `posts`, `post_revisions`, `categories`, `tags`, `post_types`, `taxonomies`, `taxonomy_terms`, `custom_fields`, `block_templates`, `media`, `media_versions`, `branding_profiles`, `branding_messaging` — block-based CMS content |
| `lib/db/schema/crm.ts` | `crm_companies`, `crm_contacts`, `crm_pipelines`, `crm_deals`, `crm_activities`, `crm_proposals`, `crm_contracts`, `crm_notifications`, `crm_enrichment_config` and related junction/support tables — sales CRM |
| `lib/db/schema/pm.ts` | `projects`, `kanban_columns`, `kanban_cards`, `sprints`, `support_tickets`, `ticket_messages`, `notifications`, `card_recurrences`, `sprint_retros`, `project_goals` and related — project management and ticketing |
| `lib/db/schema/brain.ts` | `brain_meetings`, `brain_notes`, `brain_tasks`, `brain_embeddings`, `brain_embedding_jobs`, `brain_documents`, `brain_playbooks`, `brain_playbook_runs`, `brain_people`, `brain_initiatives`, `brain_decisions`, `brain_topics`, `brain_glossary_terms`, `automation_rules`, `automation_logs` and related — Company Brain / RAG / knowledge graph |
| `lib/db/schema/store.ts` | `products`, `product_variants`, `orders`, `order_items`, `carts`, `cart_items`, `shipping_zones`, `shipping_rates`, `discount_codes`, `store_customers`, `store_product_reviews`, `designs`, `printful_events`, `easypost_events` and related — e-commerce store |
| `lib/db/schema/email.ts` | `email_lists`, `email_subscribers`, `email_campaigns`, `email_templates`, `email_segments`, `email_campaign_sends`, `survey_email_sequences` and related — email marketing |
| `lib/db/schema/surveys.ts` | `surveys`, `survey_responses`, `survey_partial_responses`, `survey_webhooks`, `survey_variants`, `survey_ai_summaries` and related — survey engine |
| `lib/db/schema/tools.ts` | `pitch_decks`, `booking_pages`, `bookings`, `google_calendar_tokens`, `google_workspace_client_connections`, `google_workspace_user_connections`, `microsoft_teams_user_connections`, `zoom_tokens`, `mcp_tool_calls`, `mcp_tool_call_daily_rollups` and related — scheduling, workspace integrations, MCP telemetry |
| `lib/db/schema/billing.ts` | `ai_credit_ledger`, `ai_credit_balances`, `ai_credit_packages`, `usage_meters`, `invoices`, `invoice_items`, `ai_conversations`, `metered_subscription_items`, `usage_billing_periods` — metered billing and AI credits |
| `lib/db/schema/approvals.ts` | `mcp_pending_changes`, `mcp_approval_links` — MCP human-in-the-loop approval flow |
| `lib/db/schema/audit.ts` | `oauth_clients`, `oauth_authorization_codes`, `oauth_access_tokens` — OAuth server credentials |
| `lib/db/schema/collab.ts` | `document_comments` — inline document collaboration |
| `lib/db/schema/chat.ts` | `chat_widgets`, `chat_conversations`, `chat_messages` — embedded live-chat |
| `lib/db/schema/workflows.ts` | `workflows`, `workflow_runs`, `workflow_step_logs` — automation workflow engine |
| `lib/db/schema/ab.ts` | `ab_experiments`, `ab_variants`, `ab_assignments`, `ab_events` — A/B experimentation |
| `lib/db/schema/snapshots.ts` | `site_snapshots` — periodic site content snapshots |
| `lib/db/schema/cronHealth.ts` | `cron_health` — cron heartbeat tracking |
| `lib/db/schema/agenticOs.ts` | `agentic_os_runs` — agentic task run logs |
| `lib/db/schema/plugins.ts` | `registered_apps`, `registered_app_signing_keys`, `registered_app_runs`, `registered_app_jobs`, `postcaptain_briefs`, `postcaptain_drafts` — third-party plugin registry |
| `lib/db/schema/trigger-links.ts` | `trigger_links`, `trigger_link_clicks` — trackable trigger links |
| `lib/db/schema/productDesigner.ts` | `product_styles`, `product_sides`, `product_designs`, `philaprints_design_assets` — product customization designer |
| `lib/db/schema/publishing.ts` | `publishing_campaigns`, `publishing_permissions` — social publishing command center |

---

## Tenancy Keying

Every tenant-scoped table carries `clientId` and/or `siteId`. Queries **must** filter on the active tenant — an unscoped `db.select().from(table)` on a tenant table is a cross-tenant data leak, the highest-severity bug class in this repo.

The active tenant is resolved from the session via `lib/active-client.ts` + the site-resolver middleware. A `[siteId]` URL param is navigation only — cross-check it against the resolver; a user may have multiple sites.

After any data-access change run: `bun test:tenancy` (`scripts/test.sh --layer=integration --tag=tenancy`). This is the cross-tenant-leak regression gate.

New tables holding tenant data must include `clientId` plus a tenancy test fixture in the same PR.

---

## Migration Workflow

1. Edit `lib/db/schema/<domain>.ts`.
2. `bun run db:generate` — drizzle-kit reads `drizzle.config.ts` (schema: `lib/db/schema/index.ts`, out: `drizzle/`) and emits a new `drizzle/<NNNN>_*.sql` file. Currently 118 migration files (0000 through 9999).
3. `bun run db:migrate` — applies the migration locally. This script first runs `bun run db:verify-target` (see below) as a safety gate.
4. **Before merging staging → main, hand-apply the new SQL against the metro (prod) DB.** Vercel deploy does NOT run migrations automatically. The Drizzle migration tracker is also currently out of sync with disk in prod, so `bun run db:migrate` against prod fails — schema changes are hand-applied.

### db:verify-target safety rail

`scripts/verify-db-target.ts` inspects `DATABASE_URL`. It refuses to proceed if the URL contains the known prod host patterns (`tramway.proxy.rlwy.net:43167`, `metro.proxy.rlwy.net:25565`) or if `RAILWAY_ENVIRONMENT_NAME=production`. The check can be bypassed with `ALLOW_PROD=1`, which should never be done casually.

Staging points at `nozomi.proxy.rlwy.net`. `.env.local` overrides `.env` (the `override: true` flag is required — without it, bun's env injection wins and staging URLs silently beat local overrides).

### Never hand-edit drizzle/*.sql

The `drizzle/` directory is generated output. Editing SQL files directly will cause drift between the schema and migration history. Always edit `lib/db/schema/<domain>.ts` and regenerate.

Special case: `drizzle/0061_brain_embeddings.sql` manages the `brain_embeddings` HNSW index manually. drizzle-kit cannot reconcile pgvector HNSW indexes, so `drizzle-kit push --force` would silently drop it. Never run `--force` against a DB with real brain data — use journaled `bun run db:migrate`.

---

## Seeds

Seed scripts live in `scripts/`:

| Script | Purpose |
|---|---|
| `scripts/seed-admin.ts` | Admin user (`bun run db:seed`) |
| `scripts/seed-admin-e2e.ts` | E2E test admin user (`bun run db:seed:admin-e2e`) |
| `scripts/brain/seed-taxonomy-topics.ts` | Brain taxonomy (`bun run db:seed:brain-taxonomy`) |
| `scripts/seed-portal-client.ts` | Demo portal client |
| `scripts/seed-categories-tags.ts` | CMS categories and tags |
| `scripts/seed-pricing-tiers.ts` | Billing pricing tiers |
| `scripts/seed-templates.ts` | Block / email templates |


---

## Related Notes

- [[Tenancy & Site Resolution]]
- [[Database Migrations]]
