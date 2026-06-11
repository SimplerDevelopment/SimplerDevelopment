# SimplerDevelopment2026 — Architecture Map

> Generated 2026-05-28 via a fan-out of read-only Explore subagents over each major
> subtree (the `/learn-codebase` pass), then synthesized. This is a navigation aid, not
> a spec — when it disagrees with code, the code wins. Pairs with `.claude/index.md`
> (task → file pointers) and the nested `CLAUDE.md` files (per-area invariants).

## The shape of it

A multi-tenant SaaS platform: `clients` (tenant accounts) own `clientWebsites` (sites).
On top sit a CMS/page-builder, CRM, an AI "Company Brain" (RAG), e-commerce, email
marketing, project management, automations, and Google/Microsoft Workspace + Stripe
integrations. ~903k LOC across `app` (1145 files), `lib` (439), `components` (488), plus
`scripts`/`tests`.

**Three audiences, three route trees** — the load-bearing split:

- `app/admin/**` — staff-only, global, no tenant scoping (assumes role verified upstream)
- `app/portal/**` — authenticated per-tenant client UI
- `app/sites/**` + `app/s/**` — public-facing per-tenant sites (`/s/` = public surveys on the agency domain)

## Tenancy — the spine

Everything keys on `clientId` (and `siteId` for site-scoped data). Resolution chain:

- **`lib/active-client.ts`** — reads the `sd-active-client` cookie. `getActiveClientId()` / `parseActiveClientId(header)`.
- **`lib/portal-client.ts`** — `getPortalClient(userId)`, `getPortalClients(userId)`, and the critical `resolvePortalSite(userId, siteId)` which **cross-checks the URL's `[siteId]` against the user's accessible clients**. The URL `[siteId]` is navigation only — trusting it alone leaks data. Enforced in `app/portal/websites/[siteId]/layout.tsx`.
- **`middleware.ts`** — hostname routing: app domain vs. custom domain (rewrites to `/portal` with `x-agency-client-id`) vs. public site (rewrites to `/sites/[domain]`); subdomain detection; plugin iframe JWT proxy at `/portal/apps/<slug>`.
- **`lib/security/assert-owned.ts`** — `assertContactInClient()` etc., called before every foreign-key write. Staff impersonation via `sd_impersonate_client_id`.
- Regression gate: **`bun test:tenancy`** after any data-access change. Leaks have shipped before.

## API layer (`app/api`, ~72k LOC)

Standard route = **`auth()` (or bearer) → resolve client → tenant-scoped query → `{ success, data | error }` envelope**. ~250+ portal routes, ~50 admin, plus public (booking/chat/webhooks), `/api/v1/*` legacy REST, `/api/extension/v1/*`.

- **Dual auth**: `authorizePortal({action})` in `lib/portal-auth.ts` tries a bearer token (`sd_mcp_*`/`sd_oauth_*`, bound to one client at issuance) first, then the NextAuth session. Bearer resolution: `lib/mcp-auth.ts` (`resolvePortalFromRequest`, `resolvePortalFromCurrentRequest`).
- **Webhooks**: Stripe, Dropbox Sign (e-sign — must echo a literal ack string), Google Drive/Gmail pub-sub, Microsoft lifecycle/transcripts, SendGrid, EasyPost.
- **Cron**: ~20 routes wrapped in `withCronHealth(...)`, auth'd via `x-vercel-cron` or `CRON_SECRET`, all idempotent.

## The block system (CMS / page builder)

Cardinal rule: **blocks are universal, never client-specific.** A block is JSON in
`posts.content`. Adding one is a **5-part lockstep** (use the `simplerdev-block-type`
skill, never hand-roll):

1. TS interface in `types/blocks/*`
2. Registry entry in `lib/blocks/registry.ts` (`BUILT_IN_BLOCK_TYPES`, ~47 entries / 7 categories)
3. Render component in `components/blocks/render/*BlockRender.tsx`
4. Dispatch case in `components/blocks/render/BlockRenderer.tsx` (the central switch)
5. `/api/blocks` metadata

Public render path: `app/sites/[domain]/[[...slug]]/page.tsx` → resolve site by
domain/subdomain (`lib/actions/client-sites.ts`) → `wrapWithTypeTemplate` →
`expandLoopsInContent` → `SiteBlockRenderer` (3-layer custom CSS/JS cascade: site → type →
post). The **`html-render`** block is a Mustache-style author-friendly template engine
(`lib/blocks/html-render-*.ts`) with `{{placeholders}}`, `data-field` swaps, `data-repeat`
loops, validation, sandboxing — *not* iframe-based (scripts are re-created on render).
`html-embed` *is* iframe-sandboxed.

## Visual editor (`components/portal/visual-editor`)

Route: `app/portal/websites/[siteId]/posts/[id]/edit`. iframe preview + selection/resize
overlays + **postMessage protocol** (`lib/visual-editor/protocol.ts`,
`types/visual-editor.ts`) — load-bearing, typed both directions
(`EDITOR_INIT`/`BLOCKS_UPDATE`/`SELECT_BLOCK` ↔ `BLOCK_CLICKED`/`BLOCKS_REORDERED`/`BLOCK_RESIZED`…).
New message types go in **both** ends in one commit. Overlays desync if you mutate iframe
DOM outside the update path. Yjs CRDT collaboration via `CollaborationProvider` + presence
cursors. `block.style` (block-level) vs `block.elementStyles[key]` (per-element).

**God-files** (spawn a subagent / surgical Read only): `BlockContentEditor.tsx` (2018),
`HtmlRenderEditor.tsx` (1695). New logic goes in `_hooks/`/`_lib/`, never the shell.

## AI / Brain / MCP

- **Company Brain** (`lib/brain`) — notes, versioned documents (required-reads +
  acknowledgments), immutable decisions (`supersedeDecision`), people/org-units/expertise,
  hierarchical topics + glossary, playbooks + runs, initiatives + goals, meetings
  (Google Meet/Teams transcript ingestion). **Hybrid search** = lexical + pgvector semantic
  (`lib/brain/search.ts`, `embeddings.ts`, OpenAI text-embedding-3-small).
- **MCP server** (`lib/mcp/server.ts`) — `buildMcpServer(ctx)` dispatches to per-domain
  registrars in `tools/<domain>.ts`. Every tool: handler + Zod schema + `hasScope()` guard
  + telemetry, in lockstep (`simplerdev-mcp-tool` skill). Most **writes mint an approval
  URL** rather than mutating (`approvals.ts`, `approval-links.ts`, `pending-changes.ts` →
  `stageOrApply`). Slim projections by default (`projections.ts`). Guardrail test:
  `tests/integration/api/mcp-tool-registry-baseline.test.ts` (part of `bun test:critical`).
  God-files: `tools/cms.ts` (2184), `tools/crm.ts` (1670), `tools/kanban.ts` (1458).
- **Agentic OS** (`lib/agentic-os`) — in-process headless `claude -p` executor; single-host only today.

## Database (`lib/db`, Drizzle + Postgres)

24 schema modules / 130+ tables. Singleton client, `max: 1` connection. Import from
`@/lib/db/schema` (barrel), never a specific module. Cross-cutting patterns:

- **Draft-overlay**: draft JSON column + live columns, publish copies over (nav/decks/templates/docs).
- **Polymorphic linking**: `entityType` + `entityId` discriminators.
- **Append-only audit trails**.

Migration workflow: edit `schema/<domain>.ts` → `bun run db:generate` (never hand-edit
`drizzle/*.sql`) → `bun run db:migrate`. **Prod (metro DB) requires hand-applied SQL —
Vercel does not run migrations.** The Drizzle tracker is drifted in prod.

**`brain_embeddings` nuance** (corrected 2026-05-28): the *table* IS declared in
`lib/db/schema/brain.ts:631` (added so `drizzle-kit push` doesn't drop it — it was lost once
and recovered from a prod dump). What's NOT in schema is its pgvector **HNSW index**
(managed via `drizzle/0061_brain_embeddings.sql`) — drizzle-kit can't reconcile HNSW
indexes, so `push --force` silently drops the index. Never `--force` a DB with real brain
data; use journaled `db:migrate`.

## Feature libs worth knowing

- `lib/branding` — where client-specific styling belongs (the destination for any
  "if clientId===100" temptation). Brand profiles → block defaults → email/site render.
- `lib/google` + `lib/microsoft` — per-tenant OAuth, stateless (creds loaded on demand),
  auto refresh; Gmail/Drive/Teams transcript watchers.
- `lib/automation` (rule engine + event bus, can kick Brain playbooks) vs `lib/workflows`
  (demo-grade graph runner, no durable queue).
- `lib/plugins` — manifest validation (Zod, 60s cache, SSRF defense) + JWT-scoped iframe
  proxy + KMS secrets + entitlement checks.
- `lib/s3` — presigned uploads, all served via `/api/media/proxy/<key>`.
- `lib/email` — blocks → email-safe inlined HTML; campaign vs transactional (Resend) paths.
- `lib/ab` — experiments; one running per (target_type, target_id); never blocks page render.
- `lib/security/assert-owned.ts` — FK ownership checks before writes.
- `lib/magamommy` — a fully-autonomous AI t-shirt shop (weekly cron: research → concept →
  design → publish; hard content safety filters).

## Voice assistant (branch `feat/portal-voice-assistant`, ~753 new LOC)

Browser voice assistant over OpenAI Realtime API (WebRTC).

- `app/api/portal/voice/session` mints an ephemeral client secret with **server-baked**
  instructions + a curated 6-tool set (4 read, 2 confirm-gated writes); a tampered client
  can't widen scope.
- `app/api/portal/voice/tool` executes tools; mutations use HMAC-signed 5-min confirmation
  tokens (`lib/voice/confirm-token.ts`) bound to exact `(tool, args, userId, clientId)`.
  Tools forward the caller's cookie to internal REST routes (auth/validation stays central).
- UI: `components/portal/voice/VoiceAssistant.tsx` + `useRealtimeVoice.ts`, mounted in
  `PortalLayoutClient`.
- Supporting changes: bearer-token support (`mcp-auth.ts`, `portal-auth.ts`,
  `clients/route.ts`); `next.config.ts` flips `Permissions-Policy: microphone` to `(self)`.
- Looks production-ready. Deferred: precise per-session audio-token metering (currently
  gates upfront on plan + AI-credit balance).

## God-file index (don't full-Read in the main thread)

| File | Lines | What |
|---|---|---|
| `lib/brain/mcp-sdk-adapter.ts` | 5471 | Full Brain tool mirror for SDK clients |
| `lib/mcp/tools/cms.ts` | 2184 | CMS MCP domain |
| `components/portal/visual-editor/BlockContentEditor.tsx` | 2018 | Editor shell |
| `lib/mcp/tools/crm.ts` | 1670 | CRM MCP domain |
| `components/portal/visual-editor/HtmlRenderEditor.tsx` | 1694 | html-render author UI |
| `lib/mcp/tools/kanban.ts` | 1458 | Kanban MCP domain |
| `components/blocks/render/BookingFormInline.tsx` | 1427 | Booking widget |
| `app/portal/brain/automations/page.tsx` | ~1500 | Automation builder |
| `app/portal/tools/pitch-decks/[id]/page.tsx` | 1412 | Pitch-deck editor |
| `lib/mcp/approvals.ts` | 1193 | Approval dispatcher |
| `lib/brain/documents.ts` | 1194 | Versioned SOPs |
| `lib/brain/playbook-runs.ts` | 1145 | Playbook execution |
