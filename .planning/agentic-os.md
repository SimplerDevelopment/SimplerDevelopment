# SimplerDevelopment Agentic OS — Skill Inventory

> Source-of-truth taxonomy for the admin Agentic OS catalog (`app/admin/agentic-os`) and registry (`lib/agentic-os/registry.ts`). Inspired by Chase AI's framework that organizes Claude Code usage into **Domains → Tasks → Skills → Automations**. This document is the single inventory the catalog UI, the headless executor, and the schedule planner all read from.

## Domains

We split the surface into ten domains. The split is deliberately pragmatic — each domain has a distinct trigger, a distinct on-call human, and (in most cases) a different output medium:

- **developer-workflow** — scaffolding new code paths in the monorepo (CRUD features, UI pages, MCP tools, MCP payload audits). Triggered by a developer at the start of a feature; output is committed code.
- **cms-blocks** — anything that adds, mutates, or audits a block type or block JSON inside `lib/blocks` + `lib/visual-editor`. Includes the user-facing `html-render-block` skill that runs against a JSON paste, not a repo.
- **visual-editor** — the iframe-based page builder at `app/portal/websites/[siteId]/posts/[id]/edit`. Distinct domain from `cms-blocks` because the failure modes (postMessage, selection overlays, drag-and-drop) are entirely different from "what does a block render".
- **site-migration** — porting an existing external website into a new tenant. End-to-end: scrape, map sections to universal blocks, create the client + site rows, seed pages.
- **testing** — Playwright E2E authoring (`e2e-writer`) and execution (`e2e-runner`), plus `qa` (interactive/exploratory/video) and `visual-compare` (pixel diff). Separate from `developer-workflow` because the gates and reporting style differ.
- **mcp-server** — adding tools to or auditing payloads of `lib/mcp/server.ts`, the in-repo portal MCP that exposes ~180 tools to Claude clients.
- **content-research** — for the postcaptain-kb client only: research competitors, draft posts, ingest videos. Not invoked by other tenants.
- **qa-visual** — visual review and side-by-side comparison (`visual-compare`, parts of `qa`). Output is screenshots + a verdict, not code.
- **kb-vault** — connect, sync, and curate the standalone Obsidian vault that supports `content-research`. Pure git + MCP plumbing.
- **automations-cron** — already-running scheduled jobs in `app/api/cron/**`. These are not Claude skills — they are Next.js route handlers fired by Vercel cron — but the Agentic OS surfaces them so admins can see every recurring side effect on a single timeline.

A future eleventh domain, `external-webhooks` (`cloud` trigger type), is left empty for now — no skill is webhook-fired today. The trigger union (`on-demand | scheduled | cloud`) is already future-proofed for it.

## Skills by domain

### developer-workflow

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `simplerdev-feature-scaffold` | SimplerDev Feature Scaffold | on-demand | `.claude/skills/simplerdev-feature-scaffold/SKILL.md` | Scaffold a portal-scoped or admin-global CRUD feature: Drizzle schema + REST routes (auth + site resolver + envelope) + e2e helper + Playwright spec. |
| `simplerdev-ui-scaffold` | SimplerDev UI Scaffold | on-demand | `.claude/skills/simplerdev-ui-scaffold/SKILL.md` | Generate the admin + portal page.tsx layer for an existing CRUD resource — table, inline form, loading state — matching the canonical `categories` pages. |
| `feature-integrator` | Feature Integrator | on-demand | `.claude/skills/feature-integrator/SKILL.md` | Compare an external codebase against SimplerDevelopment, produce a gap report, and translate (not copy) missing features into block/API/DB extensions. |
| `project-orchestrator` | Project Orchestrator (subagent) | on-demand | `subagent:project-orchestrator` | Multi-step project planner that decomposes a large request into discrete subagent calls and gates each step on the previous output. |
| `security-auditor` | Security Auditor (subagent) | on-demand | `subagent:security-auditor` | Reviews pending changes for auth bypasses, leaked secrets, IDOR, and tenant-boundary violations. Wraps the `/security-review` command. |

### cms-blocks

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `simplerdev-block-type` | SimplerDev Block Type Scaffold | on-demand | `.claude/skills/simplerdev-block-type/SKILL.md` | Scaffold a new block type in lockstep across all 5 integration points: types, render component, registry, BlockRenderer switch, `/api/blocks` metadata. Enforces the "blocks are universal" rule. |
| `html-render-block` | HTML-Render Block JSON Editor | on-demand | `.claude/skills/html-render-block/SKILL.md` | User-invocable. Edit, translate, rename, or validate an `html-render` block JSON copy/pasted out of the portal's Full Block JSON panel. Returns the complete edited JSON ready to paste back. |
| `block-orchestrator` | Block Orchestrator (subagent) | on-demand | `subagent:block-orchestrator` | Drives a multi-block audit pass — picks blocks, dispatches `block-implementer` per fix, commits one block per commit. |
| `block-implementer` | Block Implementer (subagent) | on-demand | `subagent:block-implementer` | One-off block fix: applies a specific change to a single block type and verifies render + editor parity. |
| `huashu-design` | Huashu Design | on-demand | `.agents/skills/huashu-design/SKILL.md` | Vendored. Hi-fi single-file HTML for prototypes, decks, motion, infographics. Developer-facing only — output is inspiration, never copy-pasted into a typed block. |

### visual-editor

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `simplerdev-visual-editor` | SimplerDev Visual Editor | on-demand | `.claude/skills/simplerdev-visual-editor/SKILL.md` | Research/audit/debug/implement against the iframe page builder. Knows the postMessage protocol, the selection overlay, and the parent↔iframe invariants. |

### site-migration

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `site-migration` | Site Migration | on-demand | `.claude/skills/site-migration/SKILL.md` | Migrate an external website into a SimplerDevelopment tenant: scrape source, map sections to universal blocks, create client + site + pages, seed branding. |

### testing

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `e2e-writer` | E2E Writer | on-demand | `~/.claude` (project-shared command) | Generate new Playwright spec files with fixtures, idempotent cleanup, and tagging. Use for "write tests for feature X". |
| `e2e-runner` | E2E Runner | on-demand | `~/.claude` (project-shared command) | Run the existing Playwright suite (parallel-capable), analyze failures, fix flakes, report pass/fail. |
| `qa` | QA (Interactive / Exploratory / Video) | on-demand | `~/.claude` (project-shared command) | Browser-driven visual QA with three modes: human-in-the-loop, autonomous exploration, or video walkthrough. |
| `e2e-visual-tester` | E2E Visual Tester (subagent) | on-demand | `subagent:e2e-visual-tester` | Focused Playwright agent that pairs with `simplerdev-visual-editor` to verify editor flows render correctly across viewports. |

### mcp-server

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `simplerdev-mcp-tool` | SimplerDev MCP Tool | on-demand | `.claude/skills/simplerdev-mcp-tool/SKILL.md` | Register a new MCP tool in `lib/mcp/server.ts` (or an adapter file) with handler + Zod schema + scope guard, slim-by-default. |
| `simplerdev-mcp-token-budget` | SimplerDev MCP Token Budget Audit | on-demand | `.claude/skills/simplerdev-mcp-token-budget/SKILL.md` | Audit MCP tool payloads — enforce slim projections, opt-in heavy fields, compact write-echoes. Run after any tool that touches a body/HTML/blocks column. |
| `mcp-server-builder` | MCP Server Builder (subagent) | on-demand | `subagent:mcp-server-builder` | Generalized MCP adapter authoring for new feature domains — produces an `lib/<feature>/mcp-*.ts` adapter that the main server file imports. |

### content-research

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `research-competitor` | Research Competitor | on-demand | `~/.claude/skills/research-competitor/SKILL.md` | Combine vault material with WebSearch to produce a competitor synthesis brief, written into the postcaptain-kb `discoveries/` directory. |
| `draft-blog-post` | Draft Blog Post | on-demand | `~/.claude/skills/draft-blog-post/SKILL.md` | Mine the postcaptain-kb vault + external sources, draft a single blog post into `drafts/YYYY-MM-DD-<slug>.md`. Not publish-ready — meant for review and edit. |
| `video-ingest` | Video Ingest | on-demand | `~/.claude/skills/video-ingest/SKILL.md` | Transcribe a YouTube URL or local video file, sample frames, write `transcript.txt` + `frames/` + `summary.md` under `~/.claude/video-ingest/`. |
| `obsidian-note-taker` | Obsidian Note Taker (subagent) | on-demand | `subagent:obsidian-note-taker` | Writes a structured note (daily log, ADR, spec, session summary) into the vault using the project's note conventions. |

### qa-visual

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `visual-compare` | Visual Compare | on-demand | `~/.claude/skills/visual-compare/SKILL.md` | Capture two versions of the same UI side-by-side and report a per-section pixel + content match verdict. Used to verify ports and redesigns. |

### kb-vault

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `connect-kb` | Connect KB | on-demand | `~/.claude/skills/connect-kb/SKILL.md` | One-time / repair wiring of the Obsidian Local REST API MCP server so other vault skills can read and write notes. |
| `sync-kb` | Sync KB | on-demand | `~/.claude/skills/sync-kb/SKILL.md` | Stage, commit, and push pending changes in the postcaptain-kb vault with conventional-commit messages matching the repo's style. |

### automations-cron

| id | name | trigger | source | one-line description |
|---|---|---|---|---|
| `cron-expire-mcp-pendings` | Expire MCP Pendings | scheduled | `cron:/api/cron/expire-mcp-pendings` | Daily 03:17 UTC. Expire stale MCP pending changes that the user never confirmed. |
| `cron-renew-gmail-watches` | Renew Gmail Watches | scheduled | `cron:/api/cron/renew-gmail-watches` | Daily 03:47 UTC. Re-watch Gmail mailboxes whose `users.watch()` is within 48h of expiry; bootstrap any new gmail-scoped connections. |
| `cron-renew-drive-watches` | Renew Drive Watches | scheduled | `cron:/api/cron/renew-drive-watches` | Daily 04:13 UTC. Re-subscribe Drive HTTP push channels nearing their 1-day expiry. |
| `cron-resend-usage-sync` | Resend Usage Sync | scheduled | `cron:/api/cron/resend-usage-sync` | Daily 04:15 UTC. Roll up per-client email-send counts for the current YYYY-MM and upsert into `usage_meter_events`. |
| `cron-usage-rollup` | Stripe Usage Rollup | scheduled | `cron:/api/cron/usage-rollup` | Daily 04:45 UTC. Push current-period metered usage to Stripe per client; idempotent on (client, period, resource). |
| `cron-drive-sync` | Drive Sync | scheduled | `cron:/api/cron/drive-sync` | Every 10 minutes. Incremental Drive change sync; ingests Google Docs in each user's Meet Recordings folder as `brain_meetings`. |
| `cron-process-embeddings` | Process Embeddings | scheduled | `cron:/api/cron/process-embeddings` | Every minute. Drain `brain_embedding_jobs` queue with FOR UPDATE SKIP LOCKED — safe under concurrency. |
| `cron-brain-daily-notes` | Brain Daily Notes | scheduled | `cron:/api/cron/brain-daily-notes` | Daily 06:05 UTC. Materialize today's daily note for every tenant with a `trigger='daily'` template. Idempotent on (clientId, YYYY-MM-DD). |
| `cron-brain-empty-old-trash` | Brain Empty Old Trash | scheduled | `cron:/api/cron/brain-empty-old-trash` | Daily 07:15 UTC. Auto-purge brain notes that have been trashed for >90 days; per-tenant fan-out so one failure doesn't abort the sweep. |
| `cron-brain-12` | BRAIN-12 One-Shot Cleanup | scheduled | `cron:/api/cron/brain-12` | Daily 07:30 UTC, but fires meaningful work on only two dates (2026-05-26 reminder, 2026-06-06 bulk soft-delete) for client 100. |
| `cron-failing-automations-notify` | Failing Automations Notify | scheduled | `cron:/api/cron/failing-automations-notify` | Daily 12:00 UTC. Scan automation rules whose last 5 runs are all `failed`; broadcast one in-app notification per match to the owning tenant. |
| `cron-surveys-zero-responses` | Surveys Zero Responses | scheduled | `cron:/api/cron/surveys-zero-responses` | Weekly Mon 10:30 UTC. Notify survey owners whose active surveys are 14-60 days old with no responses. |
| `cron-stale-crm-deals` | Stale CRM Deals | scheduled | `cron:/api/cron/stale-crm-deals` | Weekly Mon 11:00 UTC. Notify deal owners of open deals with no activity in 30+ days; 30-day dedupe to avoid flapping. |
| `cron-stuck-booking-holds` | Stuck Booking Holds | scheduled | `cron:/api/cron/stuck-booking-holds` | Every 30 minutes. Detect bookings with `paymentStatus='pending'` for 24+ hours and notify the page owner (preview mode — no auto-cancel yet). |
| `cron-renew-microsoft-subscriptions` | Renew Microsoft Subscriptions | scheduled | `cron:/api/cron/renew-microsoft-subscriptions` | Every 25 minutes. Renew Teams transcript subscriptions (50-min lifetime); bootstrap new connections without one. |
| `cron-pm-recurrences` | PM Recurrences | scheduled | `cron:/api/cron/pm-recurrences` | Every 5 minutes. Materialize cards from due `card_recurrences` rows. |
| `cron-pm-column-snapshots` | PM Column Snapshots | scheduled | `cron:/api/cron/pm-column-snapshots` | Daily 23:55 UTC. Snapshot kanban column counts for the cumulative flow diagram; idempotent on (projectId, columnId, snapshotDate). |
| `cron-process-survey-email-followups` | Survey Email Follow-ups | scheduled | `cron:/api/cron/process-survey-email-followups` | Every 15 minutes. DIST-01/02 worker — dispatch follow-up emails for matching survey responses, capped at 100/tick, unique-indexed against double-send. |
| `cron-process-scheduled-automations` | Process Scheduled Automations | scheduled | `cron:/api/cron/process-scheduled-automations` | Every minute. Fire all automation rules whose `next_run_at` is past; CAS-claim to guarantee single firing under concurrent workers. |

## Skill details

### `simplerdev-feature-scaffold`
- **Domain:** developer-workflow
- **Trigger:** on-demand
- **Source:** `.claude/skills/simplerdev-feature-scaffold/SKILL.md`
- **Prompt template:** `Use simplerdev-feature-scaffold to add a new {{scope}} CRUD resource named "{{resource}}" with fields: {{fields}}. Per-id routes: {{withIdRoutes}}. Follow the categories canonical reference exactly. Generate the migration but stop before running db:migrate.`
- **Variables:** `[{ key: "scope", label: "Scope (portal-site | portal-client | admin-global)", required: true, placeholder: "portal-site" }, { key: "resource", label: "Resource name (singular camelCase)", required: true, placeholder: "serviceArea" }, { key: "fields", label: "Field list (name:type[:modifier])", required: true, placeholder: "title:varchar(255):required, priority:integer, isActive:boolean:default=true" }, { key: "withIdRoutes", label: "Generate per-id routes?", required: false, placeholder: "yes" }]`
- **Estimated runtime:** 5-10 min

### `simplerdev-ui-scaffold`
- **Domain:** developer-workflow
- **Trigger:** on-demand
- **Source:** `.claude/skills/simplerdev-ui-scaffold/SKILL.md`
- **Prompt template:** `Use simplerdev-ui-scaffold to generate {{surface}} pages for the existing resource "{{resource}}". API base: {{apiBase}}. Read the canonical categories page first and mirror its structure.`
- **Variables:** `[{ key: "surface", label: "Surface (admin | portal | both)", required: true, placeholder: "both" }, { key: "resource", label: "Resource name (must already exist as a CRUD route)", required: true, placeholder: "serviceArea" }, { key: "apiBase", label: "API base path", required: true, placeholder: "/api/portal/cms/websites/[siteId]/service-areas" }]`
- **Estimated runtime:** 5-10 min

### `feature-integrator`
- **Domain:** developer-workflow
- **Trigger:** on-demand
- **Source:** `.claude/skills/feature-integrator/SKILL.md`
- **Prompt template:** `Use feature-integrator to compare the external app at "{{sourcePath}}" against SimplerDevelopment2026. Focus area: {{focusArea}}. Produce a gap report, wait for my approval, then implement {{implementScope}}.`
- **Variables:** `[{ key: "sourcePath", label: "Absolute path to the external app source", required: true, placeholder: "../booking-app" }, { key: "focusArea", label: "Domain to compare (booking, chat, content, all)", required: true, placeholder: "booking" }, { key: "implementScope", label: "What to implement after the report (full-gaps-only | full-and-partial | nothing)", required: false, placeholder: "full-gaps-only" }]`
- **Estimated runtime:** 30+ min

### `project-orchestrator`
- **Domain:** developer-workflow
- **Trigger:** on-demand
- **Source:** `subagent:project-orchestrator`
- **Prompt template:** `Delegate to project-orchestrator. Goal: {{goal}}. Constraints: {{constraints}}. Use sub-skills as needed (simplerdev-feature-scaffold, simplerdev-ui-scaffold, e2e-writer). Gate each step on the previous output and report before merging.`
- **Variables:** `[{ key: "goal", label: "Goal in one sentence", required: true, placeholder: "Ship the service-areas feature end to end" }, { key: "constraints", label: "Constraints (style, scope, deadlines)", required: false, placeholder: "Portal-only, no admin UI, must pass test:tenancy" }]`
- **Estimated runtime:** 30+ min

### `security-auditor`
- **Domain:** developer-workflow
- **Trigger:** on-demand
- **Source:** `subagent:security-auditor`
- **Prompt template:** `Use security-auditor to review pending changes on the current branch. Focus: {{focus}}. Flag auth bypasses, IDOR, secret leaks, and tenancy violations. Output a triaged punch list.`
- **Variables:** `[{ key: "focus", label: "Optional focus area (auth | tenancy | secrets | all)", required: false, placeholder: "all" }]`
- **Estimated runtime:** 5-10 min

### `simplerdev-block-type`
- **Domain:** cms-blocks
- **Trigger:** on-demand
- **Source:** `.claude/skills/simplerdev-block-type/SKILL.md`
- **Prompt template:** `Use simplerdev-block-type to scaffold a new block "{{typeKey}}" ({{displayName}}). Category: {{category}}. Material icon: {{icon}}. Fields: {{fields}}. Mirror StatsBlockRender as the reference. Refuse if the block is client-specific.`
- **Variables:** `[{ key: "typeKey", label: "Type key (kebab-case)", required: true, placeholder: "pricing-cards" }, { key: "displayName", label: "Display name", required: true, placeholder: "Pricing Cards" }, { key: "category", label: "Category (basic|media|layout|component|ecommerce|form|email)", required: true, placeholder: "component" }, { key: "icon", label: "Material Symbols icon name", required: true, placeholder: "payments" }, { key: "fields", label: "Field schema", required: true, placeholder: "title:string, tiers:Tier[], ctaText:string" }]`
- **Estimated runtime:** 10-20 min

### `html-render-block`
- **Domain:** cms-blocks
- **Trigger:** on-demand
- **Source:** `.claude/skills/html-render-block/SKILL.md`
- **Prompt template:** `Edit this html-render block JSON. Operation: {{operation}}. Details: {{details}}. Return the complete block JSON in a single fenced code block, preserving all unknown keys. JSON:\n\n{{blockJson}}`
- **Variables:** `[{ key: "operation", label: "Operation (edit-copy | translate | rename-field | add-item | edit-html | validate)", required: true, placeholder: "edit-copy" }, { key: "details", label: "Operation specifics", required: true, placeholder: "Change headline to 'Stop guessing, start deciding.'" }, { key: "blockJson", label: "Pasted block JSON from the portal panel", required: true, placeholder: "{ \"version\": 1, \"type\": \"html-render\", ... }" }]`
- **Estimated runtime:** 1-3 min

### `block-orchestrator`
- **Domain:** cms-blocks
- **Trigger:** on-demand
- **Source:** `subagent:block-orchestrator`
- **Prompt template:** `Use block-orchestrator to drive a block audit pass. Audit scope: {{scope}}. For each finding, dispatch block-implementer. Commit one block per commit. Stop after {{maxBlocks}} blocks or when the audit is clean.`
- **Variables:** `[{ key: "scope", label: "Audit scope (e.g. 'all blocks missing responsive props', 'all blocks using emoji icons')", required: true, placeholder: "all blocks missing elementStyles support" }, { key: "maxBlocks", label: "Max blocks to touch in this pass", required: false, placeholder: "10" }]`
- **Estimated runtime:** 30+ min

### `block-implementer`
- **Domain:** cms-blocks
- **Trigger:** on-demand
- **Source:** `subagent:block-implementer`
- **Prompt template:** `Use block-implementer to apply this fix to block "{{blockType}}": {{fix}}. Verify render parity in dev mode and a published view. Commit with message scope "blocks".`
- **Variables:** `[{ key: "blockType", label: "Block type key", required: true, placeholder: "stats" }, { key: "fix", label: "Fix description", required: true, placeholder: "Resolve brand sentinels for background color" }]`
- **Estimated runtime:** 5-10 min

### `huashu-design`
- **Domain:** cms-blocks
- **Trigger:** on-demand
- **Source:** `.agents/skills/huashu-design/SKILL.md`
- **Prompt template:** `Use huashu-design to produce {{deliverable}} for "{{subject}}". Audience: {{audience}}. Design direction: {{direction}}. Output a self-contained HTML file. Remember: this is design exploration only — do not commit to the block registry.`
- **Variables:** `[{ key: "deliverable", label: "Deliverable (prototype | slide-deck | motion-demo | variant-explorer | infographic)", required: true, placeholder: "prototype" }, { key: "subject", label: "Subject / brief", required: true, placeholder: "Pricing page hero for an enrollment SaaS" }, { key: "audience", label: "Audience", required: false, placeholder: "Higher-ed enrollment VPs" }, { key: "direction", label: "Design direction (or 'advisor' to get 3 options)", required: false, placeholder: "Kenya Hara east-minimal" }]`
- **Estimated runtime:** 10-20 min

### `simplerdev-visual-editor`
- **Domain:** visual-editor
- **Trigger:** on-demand
- **Source:** `.claude/skills/simplerdev-visual-editor/SKILL.md`
- **Prompt template:** `Use simplerdev-visual-editor in {{mode}} mode. Target: {{target}}. Symptom or goal: {{description}}. Read the surface map first — never touch the iframe and parent state without confirming the invariants.`
- **Variables:** `[{ key: "mode", label: "Mode (research | audit | debug | implement)", required: true, placeholder: "debug" }, { key: "target", label: "Area (selection | drag | style-sidebar | layers-panel | postMessage | resize)", required: true, placeholder: "selection" }, { key: "description", label: "What's broken or what to change", required: true, placeholder: "Selection outline is wider than the rendered block on hero blocks" }]`
- **Estimated runtime:** 10-20 min

### `site-migration`
- **Domain:** site-migration
- **Trigger:** on-demand
- **Source:** `.claude/skills/site-migration/SKILL.md`
- **Prompt template:** `Use site-migration to migrate "{{sourceUrl}}" into a SimplerDevelopment tenant. Client name: {{clientName}}. Subdomain: {{subdomain}}. Use the domain-derived email pattern ({{sitename}}@simplerdevelopment.com). Map sections to universal blocks; flag anything client-specific with the placeholder pattern.`
- **Variables:** `[{ key: "sourceUrl", label: "Source URL to migrate", required: true, placeholder: "https://www.example.com" }, { key: "clientName", label: "Client display name", required: true, placeholder: "Example Co." }, { key: "subdomain", label: "Target subdomain on simplerdevelopment.com", required: true, placeholder: "exampleco" }]`
- **Estimated runtime:** 30+ min

### `e2e-writer`
- **Domain:** testing
- **Trigger:** on-demand
- **Source:** `~/.claude` (project-shared `/e2e-writer` command)
- **Prompt template:** `Run /e2e-writer for the feature "{{feature}}". Cover: {{flows}}. Tag: {{tag}}. Use the fixtures in tests/e2e/setup/fixtures.ts and a createTest helper for cleanup.`
- **Variables:** `[{ key: "feature", label: "Feature under test", required: true, placeholder: "Service areas portal CRUD" }, { key: "flows", label: "Flows to cover (comma-separated)", required: true, placeholder: "create, list, edit, delete, unauthenticated" }, { key: "tag", label: "Tag (critical | smoke | empty)", required: false, placeholder: "critical" }]`
- **Estimated runtime:** 10-20 min

### `e2e-runner`
- **Domain:** testing
- **Trigger:** on-demand
- **Source:** `~/.claude` (project-shared `/e2e-runner` command)
- **Prompt template:** `Run /e2e-runner in {{mode}} mode for tag "{{tag}}". If anything fails, debug and fix it. Re-run to confirm clean. Report pass/fail with a summary.`
- **Variables:** `[{ key: "mode", label: "Mode (default | parallel)", required: false, placeholder: "parallel" }, { key: "tag", label: "Tag filter (critical | tenancy | smoke | all)", required: false, placeholder: "critical" }]`
- **Estimated runtime:** 10-20 min

### `qa`
- **Domain:** testing
- **Trigger:** on-demand
- **Source:** `~/.claude` (project-shared `/qa` command)
- **Prompt template:** `Run /qa in {{mode}} mode for the flow "{{flow}}". Starting URL: {{startUrl}}. {{modeSpecifics}}`
- **Variables:** `[{ key: "mode", label: "Mode (interactive | exploratory | video)", required: true, placeholder: "exploratory" }, { key: "flow", label: "Flow under test", required: true, placeholder: "New client onboarding" }, { key: "startUrl", label: "Starting URL", required: true, placeholder: "http://localhost:3000/portal" }, { key: "modeSpecifics", label: "Extra context (e.g. test users, what to ignore)", required: false, placeholder: "Use staging seed user dan+test@example.com" }]`
- **Estimated runtime:** 10-20 min

### `e2e-visual-tester`
- **Domain:** testing
- **Trigger:** on-demand
- **Source:** `subagent:e2e-visual-tester`
- **Prompt template:** `Use e2e-visual-tester to verify the visual editor flow "{{flow}}" across viewports: {{viewports}}. Capture screenshots and report any regressions.`
- **Variables:** `[{ key: "flow", label: "Editor flow to test", required: true, placeholder: "Drag a hero block then resize via overlay handles" }, { key: "viewports", label: "Viewports (comma-separated)", required: false, placeholder: "desktop, mobile" }]`
- **Estimated runtime:** 10-20 min

### `simplerdev-mcp-tool`
- **Domain:** mcp-server
- **Trigger:** on-demand
- **Source:** `.claude/skills/simplerdev-mcp-tool/SKILL.md`
- **Prompt template:** `Use simplerdev-mcp-tool to register a new MCP tool named "{{toolName}}" for domain "{{domain}}". Inputs: {{inputs}}. Required scope: {{scope}}. Description: {{description}}. Use slim projections by default.`
- **Variables:** `[{ key: "toolName", label: "Tool name (snake_case, domain-prefixed)", required: true, placeholder: "crm_deals_archive" }, { key: "domain", label: "Domain (crm | brain | posts | tickets | etc.)", required: true, placeholder: "crm" }, { key: "inputs", label: "Input schema (Zod-shape pseudocode)", required: true, placeholder: "dealId: number, reason: string optional" }, { key: "scope", label: "Required scope", required: true, placeholder: "crm:write" }, { key: "description", label: "One-sentence description", required: true, placeholder: "Archive a CRM deal without deleting it" }]`
- **Estimated runtime:** 5-10 min

### `simplerdev-mcp-token-budget`
- **Domain:** mcp-server
- **Trigger:** on-demand
- **Source:** `.claude/skills/simplerdev-mcp-token-budget/SKILL.md`
- **Prompt template:** `Use simplerdev-mcp-token-budget to audit the MCP tool "{{toolName}}" (or all tools in domain "{{domain}}"). Enforce slim-by-default projections, gate heavy fields behind an include flag, and trim write-echoes. Report tokens saved.`
- **Variables:** `[{ key: "toolName", label: "Specific tool (or leave empty for full-domain audit)", required: false, placeholder: "posts_list" }, { key: "domain", label: "Domain to audit if no tool given", required: false, placeholder: "posts" }]`
- **Estimated runtime:** 10-20 min

### `mcp-server-builder`
- **Domain:** mcp-server
- **Trigger:** on-demand
- **Source:** `subagent:mcp-server-builder`
- **Prompt template:** `Use mcp-server-builder to scaffold an MCP adapter for feature domain "{{domain}}". Tools to expose: {{tools}}. Output goes to lib/{{domain}}/mcp-{{domain}}.ts. Wire into lib/mcp/server.ts.`
- **Variables:** `[{ key: "domain", label: "Feature domain", required: true, placeholder: "leases" }, { key: "tools", label: "Tool list (comma-separated names)", required: true, placeholder: "leases_list, leases_get, leases_create, leases_update" }]`
- **Estimated runtime:** 20-30 min

### `research-competitor`
- **Domain:** content-research
- **Trigger:** on-demand
- **Source:** `~/.claude/skills/research-competitor/SKILL.md`
- **Prompt template:** `Use research-competitor on "{{competitor}}". Focus: {{focus}}. Write the brief to discoveries/YYYY-MM-DD-competitor-<slug>.md in the postcaptain-kb vault.`
- **Variables:** `[{ key: "competitor", label: "Competitor name or slug", required: true, placeholder: "waybettermarketing" }, { key: "focus", label: "Optional angle", required: false, placeholder: "How they price their AI features" }]`
- **Estimated runtime:** 10-20 min

### `draft-blog-post`
- **Domain:** content-research
- **Trigger:** on-demand
- **Source:** `~/.claude/skills/draft-blog-post/SKILL.md`
- **Prompt template:** `Use draft-blog-post to write a Post Captain draft on "{{topic}}". Angle: {{angle}}. Length: {{length}}. Seed note: {{seedNote}}.`
- **Variables:** `[{ key: "topic", label: "Topic / headline idea", required: true, placeholder: "Why most enrollment-marketing dashboards lie" }, { key: "angle", label: "Audience / format / opinion", required: false, placeholder: "Deep dive for enrollment VPs" }, { key: "length", label: "Length", required: false, placeholder: "~1200 words" }, { key: "seedNote", label: "Optional seed note path in vault", required: false, placeholder: "discoveries/2026-04-10-higher-ed-enrollment-marketing-trends.md" }]`
- **Estimated runtime:** 20-30 min

### `video-ingest`
- **Domain:** content-research
- **Trigger:** on-demand
- **Source:** `~/.claude/skills/video-ingest/SKILL.md`
- **Prompt template:** `Use video-ingest on "{{source}}". Question to bias the summary toward: {{question}}. Frame count: {{frameCount}}.`
- **Variables:** `[{ key: "source", label: "YouTube URL or absolute local file path", required: true, placeholder: "https://youtu.be/abc123" }, { key: "question", label: "What you want from it", required: false, placeholder: "What's the framework for Domains→Tasks→Skills→Automations?" }, { key: "frameCount", label: "Number of frames", required: false, placeholder: "12" }]`
- **Estimated runtime:** 10-20 min

### `obsidian-note-taker`
- **Domain:** content-research
- **Trigger:** on-demand
- **Source:** `subagent:obsidian-note-taker`
- **Prompt template:** `Use obsidian-note-taker to capture a {{noteType}} note. Subject: {{subject}}. Details: {{details}}. Use the project's note conventions.`
- **Variables:** `[{ key: "noteType", label: "Note type (daily-log | ADR | spec | research | session-summary)", required: true, placeholder: "ADR" }, { key: "subject", label: "Subject", required: true, placeholder: "Switch automations queue from in-process to cron-claim CAS" }, { key: "details", label: "Body / context", required: true, placeholder: "We decided to use SELECT FOR UPDATE SKIP LOCKED..." }]`
- **Estimated runtime:** 1-3 min

### `visual-compare`
- **Domain:** qa-visual
- **Trigger:** on-demand
- **Source:** `~/.claude/skills/visual-compare/SKILL.md`
- **Prompt template:** `Use visual-compare to side-by-side compare "{{leftLabel}}" ({{leftSource}}) against "{{rightLabel}}" ({{rightSource}}). Viewport: {{viewport}}. Report per-section verdicts.`
- **Variables:** `[{ key: "leftLabel", label: "Left label", required: true, placeholder: "Original HTML deck" }, { key: "leftSource", label: "Left source (URL or path)", required: true, placeholder: "/Users/dan/desks/v3.html" }, { key: "rightLabel", label: "Right label", required: true, placeholder: "Portal-rendered deck" }, { key: "rightSource", label: "Right source", required: true, placeholder: "https://staging.simplerdevelopment.com/p/abc" }, { key: "viewport", label: "Viewport", required: false, placeholder: "1920x1080" }]`
- **Estimated runtime:** 5-10 min

### `connect-kb`
- **Domain:** kb-vault
- **Trigger:** on-demand
- **Source:** `~/.claude/skills/connect-kb/SKILL.md`
- **Prompt template:** `Use connect-kb to wire up the postcaptain-kb Obsidian vault via the Local REST API MCP server. If it's already connected, verify and report; otherwise walk me through the API key step.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `sync-kb`
- **Domain:** kb-vault
- **Trigger:** on-demand
- **Source:** `~/.claude/skills/sync-kb/SKILL.md`
- **Prompt template:** `Use sync-kb to commit and push pending changes in the postcaptain-kb vault. Infer commit type and scope from the changed paths. Don't amend, don't force-push.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-expire-mcp-pendings`
- **Domain:** automations-cron
- **Trigger:** scheduled (`17 3 * * *`)
- **Source:** `cron:/api/cron/expire-mcp-pendings`
- **Prompt template:** `(scheduled — no prompt) — fires via Vercel cron header. Manual re-run: curl with Authorization: Bearer $CRON_SECRET. Optional query: ?clientId=N for test-scoped runs.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-renew-gmail-watches`
- **Domain:** automations-cron
- **Trigger:** scheduled (`47 3 * * *`)
- **Source:** `cron:/api/cron/renew-gmail-watches`
- **Prompt template:** `(scheduled — no prompt) — daily Gmail watch renewal. Manual re-run via Authorization: Bearer $CRON_SECRET.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-renew-drive-watches`
- **Domain:** automations-cron
- **Trigger:** scheduled (`13 4 * * *`)
- **Source:** `cron:/api/cron/renew-drive-watches`
- **Prompt template:** `(scheduled — no prompt) — daily Drive watch renewal; bootstraps new connections.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-resend-usage-sync`
- **Domain:** automations-cron
- **Trigger:** scheduled (`15 4 * * *`)
- **Source:** `cron:/api/cron/resend-usage-sync`
- **Prompt template:** `(scheduled — no prompt) — daily email-send rollup into usage_meter_events.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-usage-rollup`
- **Domain:** automations-cron
- **Trigger:** scheduled (`45 4 * * *`)
- **Source:** `cron:/api/cron/usage-rollup`
- **Prompt template:** `(scheduled — no prompt) — daily Stripe metered-usage push. Override period via ?period=YYYY-MM. Dry-run via ?dryRun=1.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-drive-sync`
- **Domain:** automations-cron
- **Trigger:** scheduled (`*/10 * * * *`)
- **Source:** `cron:/api/cron/drive-sync`
- **Prompt template:** `(scheduled — no prompt) — every-10-min incremental Drive change sync for Meet Recordings.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-process-embeddings`
- **Domain:** automations-cron
- **Trigger:** scheduled (`* * * * *`)
- **Source:** `cron:/api/cron/process-embeddings`
- **Prompt template:** `(scheduled — no prompt) — every-minute embedding-queue drain. Override batch via ?batch=N (max 100).`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-brain-daily-notes`
- **Domain:** automations-cron
- **Trigger:** scheduled (`5 6 * * *`)
- **Source:** `cron:/api/cron/brain-daily-notes`
- **Prompt template:** `(scheduled — no prompt) — daily fan-out of trigger=daily brain note templates.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-brain-empty-old-trash`
- **Domain:** automations-cron
- **Trigger:** scheduled (`15 7 * * *`)
- **Source:** `cron:/api/cron/brain-empty-old-trash`
- **Prompt template:** `(scheduled — no prompt) — daily purge of brain notes trashed >90 days ago.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-brain-12`
- **Domain:** automations-cron
- **Trigger:** scheduled (`30 7 * * *`)
- **Source:** `cron:/api/cron/brain-12`
- **Prompt template:** `(scheduled — no prompt) — BRAIN-12 one-shot cleanup; no-ops outside its two firing dates.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-failing-automations-notify`
- **Domain:** automations-cron
- **Trigger:** scheduled (`0 12 * * *`)
- **Source:** `cron:/api/cron/failing-automations-notify`
- **Prompt template:** `(scheduled — no prompt) — daily failing-automations broadcast to tenant CRM inbox.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-surveys-zero-responses`
- **Domain:** automations-cron
- **Trigger:** scheduled (`30 10 * * 1`)
- **Source:** `cron:/api/cron/surveys-zero-responses`
- **Prompt template:** `(scheduled — no prompt) — weekly Monday scan for zero-response active surveys 14-60 days old.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-stale-crm-deals`
- **Domain:** automations-cron
- **Trigger:** scheduled (`0 11 * * 1`)
- **Source:** `cron:/api/cron/stale-crm-deals`
- **Prompt template:** `(scheduled — no prompt) — weekly Monday scan for 30+ day idle open deals.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-stuck-booking-holds`
- **Domain:** automations-cron
- **Trigger:** scheduled (`*/30 * * * *`)
- **Source:** `cron:/api/cron/stuck-booking-holds`
- **Prompt template:** `(scheduled — no prompt) — every-30-min preview detection of 24h+ pending booking holds.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-renew-microsoft-subscriptions`
- **Domain:** automations-cron
- **Trigger:** scheduled (`*/25 * * * *`)
- **Source:** `cron:/api/cron/renew-microsoft-subscriptions`
- **Prompt template:** `(scheduled — no prompt) — every-25-min Teams transcript subscription renewal.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-pm-recurrences`
- **Domain:** automations-cron
- **Trigger:** scheduled (`*/5 * * * *`)
- **Source:** `cron:/api/cron/pm-recurrences`
- **Prompt template:** `(scheduled — no prompt) — every-5-min materialization of due card recurrences.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-pm-column-snapshots`
- **Domain:** automations-cron
- **Trigger:** scheduled (`55 23 * * *`)
- **Source:** `cron:/api/cron/pm-column-snapshots`
- **Prompt template:** `(scheduled — no prompt) — nightly kanban column-count snapshot for cumulative flow diagrams.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-process-survey-email-followups`
- **Domain:** automations-cron
- **Trigger:** scheduled (`*/15 * * * *`)
- **Source:** `cron:/api/cron/process-survey-email-followups`
- **Prompt template:** `(scheduled — no prompt) — every-15-min DIST-01/02 follow-up email dispatch (max 100/tick).`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

### `cron-process-scheduled-automations`
- **Domain:** automations-cron
- **Trigger:** scheduled (`* * * * *`)
- **Source:** `cron:/api/cron/process-scheduled-automations`
- **Prompt template:** `(scheduled — no prompt) — every-minute firing of due automation rules; CAS-claim prevents double-fire.`
- **Variables:** `[]`
- **Estimated runtime:** 1-3 min

## Gap list — workflows worth turning into skills

These are concrete dev workflows the team performs by hand today. They have stable triggers, stable inputs, and stable outputs — all the signals that they belong in the registry. Each entry is one line of "when" and one line of "produces":

- **`simplerdev-drizzle-migration`** — trigger: any schema change in `lib/db/schema.ts`. Produces: a `bun run db:generate` invocation, a quick read of the resulting `drizzle/*.sql` for sanity, plus a refusal to auto-apply (matches existing convention). Today this lives in three different skills' tail steps; centralizing it would let the registry call it as a sub-step.
- **`simplerdev-tenancy-regression`** — trigger: any data-access change. Produces: a `bun test:tenancy` run, a diff of failing tests against the change, and a triage of whether failures are pre-existing or newly introduced. Currently a CLAUDE.md mention but nothing automates "remember to run this after every schema PR".
- **`simplerdev-admin-page-scaffold`** — trigger: a finished CRUD route that needs an admin-only management page (distinct from the portal page that `simplerdev-ui-scaffold` produces). Produces: an `app/admin/<resource>/page.tsx` matching the admin convention plus a nav entry. Today admin pages are hand-rolled, with inconsistencies.
- **`stripe-price-rotation`** — trigger: pricing change request. Produces: a new Stripe Price object, a migration row in the products table mapping the old → new price, a backfill plan for active subscriptions, and a compile-time check that no code references the retired price ID. High-risk and entirely manual today.
- **`simplerdev-cron-add`** — trigger: "I need a job that runs every N minutes/hours/days". Produces: a route file under `app/api/cron/<name>/route.ts` matching the auth pattern, a `vercel.json` entry, a test that exercises the manual `Authorization: Bearer` path, and an entry in this inventory. Today every new cron is a copy-paste from a sibling — pattern is stable, skill-worthy.
- **`mcp-scope-audit`** — trigger: a security review request or after adding any tool with privileged scopes. Produces: a matrix of every tool in `lib/mcp/server.ts`, its required scope, and the actual write surface it touches — flagging any tool whose declared scope under-grants what it does. Distinct from `simplerdev-mcp-token-budget` (which is about payload size, not authorization).
- **`brain-rag-eval`** — trigger: changes to embedding logic, chunking, or retrieval ranking. Produces: a deterministic eval pass over a captured set of brain queries + expected top-K matches, with a diff vs the previous run. Today these regressions are caught by users complaining.
- **`vendored-skill-refresh`** — trigger: upstream updates to `huashu-design` (the vendored `.agents/` skill) or any new vendored skill. Produces: a clean re-vendoring with a CHANGELOG note and a re-symlink instruction. Currently ad hoc.

Five-to-eight is the right size. Under-include rather than over-include — once the registry is real, gaps surface naturally.

## Notes on existing memory layer

The Agentic OS does not own memory; it composes on top of what's already there. The repo carries `CLAUDE.md` (architectural invariants, "don't-touch zones", workflow pointers), `.planning/` (in-flight plans and audit JSON), `.claude/learnings.md` (running retro of mistakes from autonomous dev-block runs), and `.claude/HANDS_OFF_DEV_PLAN.md` (the unattended workflow plan + state). Outside the repo there's a separate `postcaptain-kb` Obsidian vault for the Post Captain client (used by `research-competitor`, `draft-blog-post`, `connect-kb`, `sync-kb`) and an untracked `docs-vault/` sibling at the repo root for general project notes. The registry treats these as the read/write memory layer for skills — the registry stores **what a skill is** and **how to invoke it**, never the skill's intermediate state, prompt history, or output artifacts. Those continue to land in their existing homes.
