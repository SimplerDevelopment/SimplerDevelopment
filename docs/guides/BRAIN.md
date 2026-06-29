# Company Brain — Operator Guide

How to enable Company Brain for a tenant, what ships today, where the costs come
from, and what the security boundary actually looks like. Audience: an engineer
or solutions person onboarding a new client.

This file is the operational counterpart to the build plan in
`.planning/audits/companyBrain-adjusted.md` (which is the source of truth for
schema and route design). If anything below disagrees with the code, the code
wins — start by reading `lib/brain/entitlement.ts`, `lib/db/schema/brain.ts`,
and `app/api/portal/brain/`, then file a doc fix.

---

## 1. What Company Brain is

A structured AI operating layer on top of the CRM and project tooling. The core
loop is: **capture meeting → AI proposes structured output → human approves →
records get written.** Nothing the AI extracts (tasks, decisions, commitments,
relationship updates, CRM linkages, compliance warnings) lands as a real
business record until a person clicks Approve. This invariant is enforced in
code by routing every AI extraction through `brain_ai_review_items` and
`lib/brain/review.ts` — the AI never inserts into `brain_tasks`, `brain_notes`,
`crm_*`, or `kanban_cards` directly. Approvals also write to
`brain_audit_logs`, so every mutation is traceable to an actor.

---

## 2. Modules shipped

Each module is independently toggleable per tenant via `brain_profiles.enabledModules`.

- **Communications (meetings)** — paste / upload / Google Doc / inbound email a
  transcript; `lib/ai/meeting-processor.ts` extracts a summary plus tasks,
  decisions, commitments, and relationship updates into a review queue.
- **Tasks** — Brain-flavoured tasks with promotion to project Kanban boards
  (`/api/portal/brain/tasks/[id]/promote-to-kanban`). Status: `open` /
  `in_progress` / `blocked` / `done`.
- **Knowledge** — free-form notes with slash-prefix tag folders (Bear-style),
  saved searches, soft-delete to trash, audit-log-driven history, wiki-link
  graph (`brain_kb_links`), templates, daily-note cron, and inbound email
  ingestion.
- **Prospects** — CRM deals filtered to "prospect" pipeline stages plus
  stale-detection from `brain_relationship_overlays.staleAfterDays`.
- **Relationships** — overlay over `crm_companies` / `crm_deals`; surfaces
  Brain-only fields (priorities, open loops, next-review, confidentiality).
- **Calendar** — free-form scheduled events distinct from tasks (which have due
  dates) and meetings (records of past communications). Phase C will add
  bidirectional Google Calendar sync.
- **Ask Brain** — conversational query layer over the tenant's Brain corpus,
  served via `/api/mcp` with the `brain_*` tool surface in
  `lib/brain/mcp-sdk-adapter.ts`.
- **Communications email gateway** — per-tenant `emailIngestToken` powers
  `brain+<token>@simplerdevelopment.com` inbound; emails arrive as draft
  meetings; optional `autoProcessEmail` and `autoLinkCrm` flags run AI and
  CRM linkage automatically.
- **Automations** — cross-product NLP- and template-built rules in
  `automation_rules`; emitters fire on events (booking, survey, deal, task)
  and act via the portal-tool surface.

---

## 3. How to enable Brain for a tenant

The gate logic lives in `lib/brain/entitlement.ts`. There are four lanes a
client can hit, checked in order:

1. **`BRAIN_ENTITLEMENT_BYPASS=1`** — explicit env override, used by integration
   tests whose tenants are seeded without subscriptions. **Never set this in
   production.**
2. **Vitest runtime detected** (`VITEST=1` or `VITEST_POOL_ID` defined) — same
   bypass, scoped to the test process. Production never matches this.
3. **Active trial:** `clients.brainTrialUntil` is non-null and `> now()`.
   Self-serve / product-led-growth path. Expired trials silently fall through.
4. **Active paid subscription:** a `client_services` row joined to `services`
   with `category = 'brain'` or `category = 'bundle'` (the All-In-One SKU
   includes Brain).

So, to onboard a tenant in production, do **one** of:

### A) Subscribe them (production / paying customers)

```sql
-- One-time global setup (already applied; verify):
SELECT id, slug, category FROM services WHERE slug = 'company-brain';
-- Expect: category = 'brain'. If missing, run: bun run scripts/seed-services.ts

-- Subscribe the tenant:
INSERT INTO client_services (client_id, service_id, status)
VALUES (<clientId>, <brainServiceId>, 'active');
```

The `bundle` SKU (slug `all-in-one`) also entitles Brain — you don't need a
separate row if they already subscribe to it.

### B) Grant a trial

```sql
UPDATE clients
SET brain_trial_until = NOW() + INTERVAL '14 days'
WHERE id = <clientId>;
```

Trial wins over the paid check, so you can stack a trial on top of a lapsed
subscription to give a grace window.

### C) First-page bootstrap

Once the client is entitled, the first hit to `/portal/brain` runs
`getOrCreateBrainProfile(clientId, …)` from `lib/brain/profiles.ts`. That
inserts a `brain_profiles` row with `enabled = false`, default modules,
`industryTemplate = 'generic'`, and a fresh `emailIngestToken`. The settings
page at `/portal/brain/settings` (UI: `app/portal/brain/settings/page.tsx`,
API: `app/api/portal/brain/settings/route.ts`) lets an admin pick the industry
template, toggle modules, set default confidentiality, and flip
`enabled = true`. Until that flip, the layout shell renders an empty-state CTA.

### Demo seed

For a fully-populated demo tenant:

```bash
bun run scripts/seed-brain-demo.ts <clientId>
# or
bun run scripts/seed-brain-demo.ts --client-id=<clientId>
```

Idempotent — re-running mutates nothing. Seeds the brain profile (wealth
advisory template, all modules on), 2 companies, 4 contacts, 2 deals, 2
relationship overlays, 3 meetings (one approved, one needs-review, one draft),
5 tasks across all four statuses, 4 notes in `kb/discovery/` and `kb/marketing/`
slash-prefix tag folders, 2 note templates, and 1 saved-search pin.

---

## 4. Industry templates

`lib/brain/industry-templates/` defines the templates a tenant picks from on
first setup. Each template is a static config object (`IndustryTemplate`) that
seeds:

- `relationshipTypes` — options for the overlay's `relationshipType` column
  (e.g. `household`, `divorce_case`, `family_business`, `plan_sponsor`,
  `prospect`, `referral_partner`).
- `serviceLines` — default chips for `brain_profiles.serviceLines` and the
  overlay's `serviceLines`.
- `defaultViews` — view names the dashboard exposes (e.g. `Founder Today`,
  `EA Queue`, `Compliance Review`).
- `complianceDefaults` — `requireHumanReviewForAi`, `auditAiChanges`,
  `blockedFields` (literal strings the AI is told never to write back).

Currently shipped:

| ID | File | What it presets |
|----|------|-----------------|
| `generic` | `lib/brain/industry-templates/generic.ts` | Flexible default. Relationship types: company / prospect / partner / vendor. No service lines. Views: Today, Needs Review, Overdue. |
| `wealth_advisory` | `lib/brain/industry-templates/wealth-advisory.ts` | Households, divorce cases, family business, plan sponsors, prospects, referral partners. Service lines: Investments & Planning, Divorce, Family Business, Cryptocurrency Education, Retirement Plans. Compliance blocks SSN / tax ID / account / routing numbers. |

### Adding a template

1. Add `lib/brain/industry-templates/<id>.ts` exporting an `IndustryTemplate`.
2. Register it in `lib/brain/industry-templates/index.ts` and extend
   `IndustryTemplateId` in `types.ts`.
3. Add the option to the settings dropdown — UI consumes
   `availableTemplates` from `/api/portal/brain/settings`, so once registered
   the picker updates automatically.
4. (Optional) Wire `complianceDefaults.blockedFields` into the meeting
   processor's system prompt if your template needs to redact specific fields.

Template choice is metadata only — it does not migrate or partition data.
Switching templates on a populated tenant is safe.

---

## 5. AI cost notes

### Provider

Default AI provider is Anthropic (`brain_profiles.aiProvider = 'anthropic'`).
Embedding provider is null by default (embeddings off, lexical search only).
Both columns are typed as varchar so additional providers can be wired without
a migration.

### Metering

All AI calls go through `lib/ai-credits.ts`:

- `hasCredits(clientId, n)` — pre-flight check.
- `deductCredits(clientId, amount, source, refId, description)` — atomic
  decrement of `ai_credit_balances.balance` plus an `ai_credit_ledger` row.

Brain consumers:

- `lib/ai/meeting-processor.ts` (source `brain_meeting_processing`) — billed
  per actual token usage with the heuristic `Math.max(1, round(inputTokens
  / 1000) + round(outputTokens / 250))`. So output tokens count ~4x input.
- `lib/brain/classify-crm.ts` (source `brain_crm_classify`) — same heuristic,
  charged when `autoLinkCrm` is enabled and the CRM-classification step runs.
- Ask Brain hits go through `/api/mcp` and the AI chat path
  (`app/api/portal/ai/chat/route.ts`, source `ai`) — billed per conversation
  using the standard chat token accounting, not a flat per-call fee.

### Per-meeting cost

A 5,000-word transcript (~7,500 input tokens) plus a typical 600-token JSON
response works out to roughly `round(7500/1000) + round(600/250) = 7 + 2 = 9`
credits. A 30-minute call transcript at ~4,500 words sits in the same range.
Budget around **5–15 credits per meeting**. Inputs are capped (the processor
trims long transcripts) so a single meeting cannot blow a tenant's monthly
allotment — review the trim threshold in `lib/ai/meeting-processor.ts`.

### Embedding pipeline

Embeddings are wired but **off by default**. The flow:

1. Writes that touch indexable content (notes, meeting summaries) enqueue rows
   into `brain_embedding_jobs` via `lib/brain/embedding-queue.ts`. The queue
   is idempotent on `(client_id, entity_type, entity_id)`.
2. The cron at `/api/cron/process-embeddings` drains the queue every minute
   (Vercel cron header or `Authorization: Bearer ${CRON_SECRET}`), calling
   `embedById` per row and deleting on success. Failures retry up to
   `MAX_ATTEMPTS`.
3. `lib/brain/embeddings.ts` reads `OPENAI_API_KEY` and calls OpenAI's
   `text-embedding-3-small`. **No `OPENAI_API_KEY` → embedding helper throws
   on use.** Until you set the key, leave the queue idle.
4. Embeddings only fire for tenants whose `brain_profiles.embeddingProvider`
   is set (e.g. `'openai'`). Null = embeddings disabled for that tenant;
   hybrid search gracefully falls back to ILIKE.

A full Obsidian-vault import (~5–10 MB of markdown) costs roughly $0.05–$0.10
in OpenAI charges (text-embedding-3-small). Budget that against the customer
contract — embeddings cost is **separate from `ai_credits`** today and is
billed on the SimplerDevelopment OpenAI account.

### Ask Brain credit cost

Ask Brain conversations route through the standard MCP / AI chat path. There
is no flat per-conversation fee — it's metered per turn, billed at the chat
token rate, and the Brain tool calls (`brain_search`, `brain_list_*`,
`brain_get_*`) themselves don't cost extra credits unless they fan out to
another AI call.

---

## 6. Security model

### Tenancy boundary

Every brain table has a `client_id` column with `ON DELETE CASCADE` to
`clients.id`. Every query in `lib/brain/*` filters by `clientId` — there are
no global queries. Tenancy regression coverage lives in `bun test:tenancy`;
run it after any data-access change.

### API gate

All 40 authenticated routes under `app/api/portal/brain/**` call
`requireBrainEntitlement` from `lib/brain/entitlement.ts` before any other
work. That helper layers `authorizePortal` (auth + role) on top of
`isBrainEntitled` (the four-lane check above), and returns a 402 envelope with
`code: 'BRAIN_NOT_ENTITLED'` plus an upsell URL when the tenant lacks a
subscription. The cron handler at `/api/cron/brain-daily-notes` is
intentionally unauthenticated — it checks entitlement per-tenant inside the
loop, not at the route boundary, so an idle tenant doesn't block the sweep.

### Confidentiality

Notes and meetings carry a `confidentialityLevel` column with three values:

- `standard` (default) — visible to all tenant members.
- `restricted` — visible to admins and explicitly granted members.
- `confidential` — owner + admins only. Recommended for regulated industries.

Default value is read from `brain_profiles.defaultConfidentiality` at
creation; per-record overrides are allowed. Enforcement is filter-based at
the query layer, not Postgres RLS — sufficient for MVP, not a substitute for
true row-level security if you sell into HIPAA / FINRA-regulated buyers.

### AI guardrails

- The meeting processor never writes business records. Output goes to
  `brain_ai_review_items` only.
- Approvals route through `lib/brain/review.ts`, which writes the target row
  and a `brain_audit_logs` entry in the same transaction. Reject paths log too.
- Industry templates carry a `complianceDefaults.blockedFields` list (e.g.
  SSN, tax ID, account / routing numbers in the wealth-advisory template).
  The system prompt instructs the model to redact these strings.
- All adapter imports (paste / upload / Google Doc / inbound email / Drive
  watch) write `meeting.imported*` audit rows with `{adapterId, sourceRef}`.

### Audit log

`brain_audit_logs` records every approval / rejection / edit on a review
item, every relationship overlay edit, every adapter import, every
auto-purge. Use `lib/brain/audit.ts::logAudit` from any new write path.
`actorId` is null for AI/system actions (the processor itself, not its
proposals) so you can filter human-vs-machine.

---

## 7. Production-readiness checklist

Before flipping a paying customer to Brain, confirm:

- [ ] **Migrations applied through `0075_notification_preferences.sql`.**
      Brain spans roughly 20 of the 76 migrations in `drizzle/` — the most
      recent are `0066_brain_note_templates`, `0068_brain_embedding_trigger_fix`,
      `0070_sticky_sister_grimm`, `0071_bent_weapon_omega`,
      `0074_brain_trial_until`, and `0075_notification_preferences`. Run
      `bun run db:migrate` against the target. The migrate step refuses
      production URLs unless `DB_VERIFY_TARGET` is set.
- [ ] **`CRON_SECRET` set.** Required for `/api/cron/brain-daily-notes`,
      `/api/cron/brain-empty-old-trash`, and `/api/cron/process-embeddings`.
      Value must be passed as `Authorization: Bearer ${CRON_SECRET}` if
      hitting the route outside Vercel cron.
- [ ] **`OPENAI_API_KEY` set if embeddings are enabled.** Without it, leave
      every tenant's `brain_profiles.embeddingProvider` null — search falls
      back to ILIKE.
- [ ] **Anthropic API key set** (the existing platform requirement; not
      Brain-specific).
- [ ] **`services` table has the `brain` SKU** — confirm via
      `SELECT id, slug, category, price FROM services WHERE category = 'brain'`.
      If missing, `bun run scripts/seed-services.ts` is idempotent.
- [ ] **`packages/realtime-server/` is NOT required.** Brain notes editor is
      single-user — collab realtime applies to posts / decks / emails today,
      not Brain entities. The `entityType` enum on the realtime server
      excludes `'note'`. Notification bells and `@mention` emitters work
      without it; presence and live cursors do not.

---

## 8. Operations

### Trash auto-purge

`/api/cron/brain-empty-old-trash` runs daily and hard-deletes notes whose
`deleted_at` is older than 90 days. The retention is hard-coded in
`lib/brain/notes.ts` (`RETENTION_DAYS`) — there is no per-tenant override
column today. If a customer demands a different retention, either patch the
constant or add a column to `brain_profiles` and thread it through.

### Enabling embeddings for a tenant

```sql
UPDATE brain_profiles
SET embedding_provider = 'openai', updated_at = NOW()
WHERE client_id = <clientId>;
```

Newly written notes / meeting summaries enqueue jobs immediately; the cron
drains within ~1 minute. To backfill an existing tenant, run a one-shot
enqueue across their content (an example pattern lives in
`scripts/migrations/example-client/embed-all.ts`).

### Disabling Brain for a tenant

Two paths, depending on intent:

- **Soft disable, keep data:** flip `brain_profiles.enabled = false`. The
  layout renders the disabled CTA; APIs still respond if entitlement holds.
- **Hard disable, revoke:** delete the `client_services` row (or
  `UPDATE client_services SET status = 'cancelled'`) and clear
  `brain_trial_until`. The 402 envelope kicks in immediately on the next
  request. Existing data sticks around.
- **Wipe data:** `DELETE FROM brain_profiles WHERE client_id = <id>` cascades
  through every brain table via FKs. Irreversible; no soft-delete on the
  profile itself.

### Rotating the inbound-email token

`brain+<token>@simplerdevelopment.com` is the per-tenant inbound address.
Token lives in `brain_profiles.email_ingest_token`. Rotate via
`POST /api/portal/brain/settings/rotate-email-token` (or call
`rotateEmailIngestToken(clientId)` directly). Old aliases stop working
immediately.

---

## 9. Known gaps / what's NOT shipped

- **Knowledge overhaul Phase 4 (supertags) — deferred.** Phase 1 (tag-tree,
  trash, history, omnibar, templates) shipped per
  `.planning/brain-knowledge-overhaul-plan.md`. Supertags are not in the
  schema or UI.
- **`parent_id` hierarchy on `brain_notes` — not built.** The Bear-style
  slash-prefix tag tree (e.g. `kb/marketing/seo`) ships instead. Phase 2 of
  the overhaul will add real parent_id only if the tag tree proves
  insufficient at scale.
- **Brain notes editor + collab realtime — single-user.** The realtime server
  package (`packages/realtime-server/`) is not deployed and its `entityType`
  enum does not include `'note'`. Multiple users editing the same note will
  last-write-wins.
- **Graph view — deferred.** `brain_kb_links` is populated, but no graph
  visualization ships. Backlinks panel works (uses the same table).
- **List virtualization — deferred.** The notes list is non-virtualized.
  Tenants > ~1,000 notes per view start feeling it; not a release blocker.
- **Notification preferences (per-user opt-out + digest) — shipped.** Lives
  in `notification_preferences` (migration `0075_notification_preferences`).
  Default behavior is unchanged — every emitter still fires for every member
  unless a row opts out.
- **Adapter D (Drive folder watch) — deferred.** Per-tenant watched folder,
  webhook, channel renewal — none of it ships today. The contract in
  `lib/brain/meeting-sources/` accepts the adapter when added.
- **Adapter E (Meet recordings) — deferred.** Specialization of D; ships with
  D when prioritized. Customer Workspace must allow Meet recording /
  transcripts.
- **Adapter F (Zoom) — partial / deferred.** `lib/zoom.ts` exists; the brain
  meeting-source adapter that wires it does not. Activate when there's
  customer pull.
- **Per-tenant trash retention override — not built.** 90 days is hard-coded.
- **pgvector + `brain_embeddings` table — deferred.** Embeddings today use
  OpenAI for the vectors but the storage strategy is the embedding queue +
  column on the indexed entity, not a `vector(1536)` column. Migration to
  pgvector is a separate epic.

---

## 10. Pointers

- `.planning/audits/companyBrain-adjusted.md` — the build plan; source of
  truth for schema, route map, and phase order.
- `.planning/brain-knowledge-overhaul-plan.md` — the knowledge module
  redesign (Phase 1 shipped; Phases 2–4 deferred).
- `.planning/brain-knowledge-verification-plan.md` — what to test before
  shipping each knowledge unit.
- `.planning/coverage-mcp-gap-report.md` — MCP tool coverage report; useful
  when adding a new Brain tool to confirm it lands in `brain_search` and the
  per-entity tools.
- `.planning/today-2026-05-06.md` — current sprint plan and parallel branch
  status.
- `lib/brain/entitlement.ts` — gate logic; the file to read first when
  triaging a 402.
- `lib/db/schema/brain.ts` — every brain table.
- `lib/brain/industry-templates/` — template definitions.
- `app/portal/brain/settings/page.tsx` + `app/api/portal/brain/settings/route.ts`
  — per-tenant configuration.
- `scripts/seed-brain-demo.ts` — idempotent demo seed.
- `scripts/seed-services.ts` — Brain SKU registration (`category = 'brain'`,
  $49/mo, 250K AI tokens/mo included).
