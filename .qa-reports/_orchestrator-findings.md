# Orchestrator-Captured Findings (from dev-server error stream)

Captured passively from the running dev server log while sub-agents walked routes. Each entry has been re-confirmed against `lib/db/schema/*.ts` and/or live `psql`.

## CRITICAL — Schema drift between code and live DB

The integration-test DB `simplerdev_test` was cloned to start this walkthrough and was already missing columns that the current `lib/db/schema/*.ts` files reference. **If `simplerdev_test` is representative of staging or production, the following routes are currently 500-ing for real users.**

| Column missing in DB | Defined in | Routes blocked |
|---|---|---|
| `automation_rules.schedule` (json) | `lib/db/schema/brain.ts` | Every event handler (crm.contact.created, crm.deal.created, ticket.created, task.created, project.created, task.assigned, …) |
| `automation_rules.next_run_at` (timestamp) | `lib/db/schema/brain.ts` | same as above |
| `automation_rules.execution_count` (integer, default 0, NOT NULL) | `lib/db/schema/brain.ts` | same as above |
| `automation_rules.last_executed_at` (timestamp) | `lib/db/schema/brain.ts` | same as above |
| `crm_custom_fields.filterable` (boolean, default false, NOT NULL) | `lib/db/schema/crm.ts` | All `/api/portal/crm/custom-fields` GET/POST/DELETE — 500 |
| `crm_custom_fields.category` (varchar 100) | `lib/db/schema/crm.ts` | same |
| `client_websites.draft_custom_css` (text) | `lib/db/schema/sites.ts` | `/portal/websites` list + create — 500 |
| `client_websites.draft_custom_js` (text) | `lib/db/schema/sites.ts` | same |
| `client_websites.draft_updated_at` (timestamp) | `lib/db/schema/sites.ts` | same |
| `client_websites.draft_updated_by` (integer FK users) | `lib/db/schema/sites.ts` | same |
| `site_navigation.draft` (json) | `lib/db/schema/sites.ts` | `/api/portal/websites/<siteId>/navigation` — 500 |
| `google_workspace_user_connections.drive_channel_id` (text) and 3 sibling cols (`drive_channel_resource_id`, `drive_channel_expiration`, `drive_channel_token`) | `lib/db/schema/*` | `POST /api/portal/brain/drive-sync` — 500 |
| `surveys.publish_results` (boolean, default false NOT NULL) and 9 sibling cols (`certificate_enabled`, `consent_field`, `notify_on_response`, `notify_digest`, `closes_at`, `max_responses`, `linked_type`, `linked_id`, `recommendation`, `scoring_config`) | `lib/db/schema/surveys.ts` | `POST /api/surveys/<slug>` — 500 |

**Worked around locally** for this audit by manually `ALTER TABLE`ing the columns into `simplerdev_qa_walk`. **The drizzle migrations directory must be regenerated to include these columns and applied to staging/prod.** This matches the long-standing pattern noted in `project_sd2026_drizzle_tracker_drift` (memory): schema changes have been hand-applied without `db:generate`, so the migration journal is now out of sync.

**Recommendation:** Add a CI gate that fails if `lib/db/schema/*` diff vs the live DB introspection is non-empty. Drizzle-Kit has `drizzle-kit check` for this. Wire it into the staging deploy.

## HIGH — Misc 500s from missing input validation

| Route | Repro | Expected | Actual |
|---|---|---|---|
| `PATCH /api/portal/settings/profile` | Submit `name` longer than 255 chars | 400 with field-level message | 500: `value too long for type character varying(255)` |
| `DELETE /api/portal/crm/deals/<id>/comments` | Hit without a JSON body (or wrong content-type) | 400 with "missing required body" | 500: `SyntaxError: Unexpected end of JSON input` |
| `POST /api/portal/crm/import/preview` | Wrong Content-Type | 400 with "expected multipart/form-data" | 500: `TypeError: Content-Type was not …` |
| `POST /api/portal/crm/import` | same | 400 | 500 |
| `POST /api/portal/settings/team` | invite member with name > 255 chars | 400 with field-level message | 500: `value too long for type character varying(255)` |
| `POST /api/portal/cms/websites/<siteId>/posts` | post with non-existent or other-tenant categoryId | 400 "invalid category" (or silently drop unknown) | 500: FK violation `post_categories_category_id_categories_id_fk` |
| `POST /api/portal/tickets` | normal create, but slow | < 2s | 12s (proxy.ts 864ms + render 10.6s — likely synchronous notification/automation chain) |
| `GET /api/posts/calendar?start=…&end=…&websiteId=…` | normal calendar query | 200 with posts list | 500: `TypeError: The "string" argument must be of type string … Received an instance of Date`. Handler is passing a `Date` object to a query helper expecting an ISO string. Reproducible across multiple websiteIds (19/22/23/24). |
| `POST /api/portal/cms/websites/<siteId>/categories` | siteId path param is the literal string `"undefined"` (UI passed undefined into URL) | 400 "invalid siteId" | 500: `invalid input syntax for type integer: "NaN"`. Whole family of dynamic-id routes needs a `parseInt` guard before the DB call. |

Pattern: route handlers assume happy-path content-types and value lengths. Wrap inputs in zod (already a dep) and return `{ success: false, error }` envelope on validation failure rather than letting exceptions bubble to Next's default 500.

## MEDIUM — Performance

- `GET /api/portal/crm/companies?limit=5000` → 6.2s (no upper bound on limit; 5000-row scan + JSON serialize). Cap server-side limit at e.g. 200 and require explicit pagination.
- `GET /api/portal/cms/websites` → 1.9s–12s (variance is huge; once the schema drift was patched, repeated calls trended toward sub-second). Worth profiling once drift is fixed.
- Dev server compile times: 26s for `/` first compile, 6.7s for `/portal/login`. Acceptable for dev with Turbopack but worth noting in onboarding docs.

## LOW — Deprecation

- Next 16 warning: `"middleware" file convention is deprecated. Please use "proxy" instead.` Need to rename `middleware.ts` → `proxy.ts` (and update the site-resolver wiring). Tracked separately because it touches every tenant route.
- Next 16 detected multiple lockfiles (root + `simplerdevelopment2026/`) and inferred the wrong workspace root. Set `turbopack.root` in `next.config.ts` or remove the stale outer lockfile.
- Sub-process `npx @playwright/mcp@latest` fails inside this repo due to npm's `jsdom@^27.4.0` override (EOVERRIDE). Playwright MCP works fine from `/tmp`. Either remove the override (does anything still need pinned jsdom?) or document that MCP servers must run with `cwd` outside the repo.
