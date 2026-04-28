# Company Brain — Adjusted Implementation Plan

> Supersedes `.planning/audits/companyBrain.md` for actual delivery into
> `simplerdevelopment2026`. The original plan is a generic spec written
> against an assumed `workspaces`-style multi-tenant Next.js project. This
> file translates it to the conventions actually in use here.

Branch: `company-brain`

---

## 1. Validity review of original plan

**Core thesis is sound.** The product idea — a structured, relational, AI-assisted operating layer that captures meetings → decisions → commitments → tasks, scoped per tenant, with human approval before AI writes — fits the platform well. SimplerDevelopment already has a portal, a CRM, projects, an AI chat with tools, and AI credits metering. Company Brain is a layer on top of those, not parallel to them.

**What's wrong / needs adjustment:**

| # | Issue in original plan | Reality in `simplerdevelopment2026` |
|---|---|---|
| 1 | Tenancy unit called `workspace_id` | Unit is `clients` row, scoping column is `clientId` (integer). `lib/db/schema.ts:212` |
| 2 | Routes `/workspaces/[workspaceId]/brain/...` | Portal routes are flat: `/portal/<feature>`. Active client resolved server-side via `getPortalClient(userId)` — no `[workspaceId]` segment. `lib/portal-client.ts`, `app/portal/layout.tsx` |
| 3 | "Server actions or route handlers following existing conventions" | Convention is **route handlers only** under `app/api/portal/...`. No `'use server'` actions in the portal. Examples: `app/api/portal/my-tasks/route.ts:8`, `app/api/portal/crm/saved-views/[id]/route.ts` |
| 4 | New `relationships`, `people`, `prospects` tables | The CRM already provides these: `crm_companies` (≈ relationships when "type=company"), `crm_contacts` (≈ people), `crm_deals` at "prospect" stage (≈ prospects). Building parallel tables would fork data. `lib/db/schema.ts:1893,1919,1962` |
| 5 | New `tasks` table | `kanban_cards` (project-scoped tasks) + `crm_activities` (type=task) + the My Tasks aggregator already exist. `lib/db/schema.ts:288,1985`, `app/portal/my-tasks/page.tsx` |
| 6 | New `ai_jobs`, `ai_review_items` | Reasonable to add. There's no equivalent. `aiConversations`/`aiMessages` exist but model conversational chat, not job queues or review queues. `lib/db/schema.ts:622,633` |
| 7 | "pgvector if already configured, otherwise add TODOs" | **pgvector is NOT configured.** No `vector(...)` columns or extension installed in any migration. Embeddings are deferrable. |
| 8 | "Use shadcn cards, tables, badges, tabs, dialogs" | shadcn is **minimally** installed (`components/ui/Button`, `Card`, `Accordion`, `Icon`). Most existing UI is custom + Material Icons spans. Don't assume the full shadcn primitive set — install what's needed or build with the existing patterns. |
| 9 | "AI provider abstraction with stub providers" | Anthropic is wired directly with `new Anthropic({apiKey})` in route handlers (e.g. `app/api/portal/ai/chat/route.ts:15`). There's no abstraction layer; one is reasonable to add but should not introduce a parallel "AI service" framework when the existing pattern is fine. |
| 10 | "Workspace settings" with `brain_profiles` table | A `brain_profiles` row per client makes sense, but it should reference `clients.id` and live alongside other per-client config. There is no global "workspace settings" table to extend — there's just `clients` plus feature-specific config tables. |
| 11 | "Confidentiality / compliance / industry template" requirements | No existing primitive for these. They are new and need to be designed. The wealth-advisory industry template is a reasonable seed but should be data-driven (a template config object), not hard-coded into the schema. |
| 12 | Service entitlement / billing | New feature. The portal gates many features behind `clientServices` subscriptions via `authorizePortal({requireService})`. Company Brain should be a billable service category — define it (`requireService: 'brain'`) and add a row in `services`. `lib/portal-auth.ts:42` |

**Net:** the original plan is best read as a *product brief*. Translate it directly into schema/routes and you'll fork the CRM, miss the auth wrapper, miss the AI chat plumbing, and ship a parallel app inside the portal. The adjusted plan below reuses what exists.

---

## 2. Repo conventions to follow

- **DB:** Drizzle `pgTable`, `serial('id').primaryKey()`, `integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' })`, `timestamp('created_at').defaultNow().notNull()`. New tables go in `lib/db/schema.ts` — single file, namespaced by section comments. Migration via `drizzle-kit generate` into `drizzle/`.
- **Routes:**
  - Pages → `app/portal/brain/...`
  - APIs → `app/api/portal/brain/...`
  - Each route handler starts with `const auth = await authorizePortal({action:'read'|'write', requireService:'brain'}); if (isAuthError(auth)) return auth.response;` then uses `auth.client.id` for scoping.
- **Mutations:** Route handlers (POST/PUT/DELETE) — no `'use server'`. Pages fetch via `fetch('/api/portal/brain/...')` from server components or client components.
- **AI:** Use existing `Anthropic` client + extend `PORTAL_TOOLS` in `lib/ai/portal-tools.ts` if the assistant needs to read/write Brain entities. Use `aiConversations` / `aiMessages` for "Ask Brain" chat. Use `hasCredits` / `deductCredits` for metering.
- **UI:** Material Icons spans (`<span className="material-icons">`), Tailwind, existing portal components in `components/portal/`. shadcn primitives where they exist (`components/ui/`). Empty/loading states match the patterns in `app/portal/projects/page.tsx` and `app/portal/crm/page.tsx`.
- **No emojis** (per project memory — use Material Icons).

---

## 3. Adjusted schema design

Goal: layer "Brain" intelligence on top of CRM, don't duplicate it. New tables are `brain_*` and reference existing entities (`crm_companies`, `crm_contacts`, `crm_deals`, `users`, `clients`) by FK.

### New tables

```text
brain_profiles            (one per client — feature on/off + config)
  - id (serial)
  - clientId (FK clients, unique)
  - name (display name e.g. "Acme Brain")
  - industryTemplate (varchar — 'wealth_advisory' | 'generic' | …)
  - enabled (boolean)
  - defaultConfidentiality (varchar — 'standard' | 'restricted' | 'confidential')
  - aiProvider (varchar default 'anthropic')
  - embeddingProvider (varchar nullable)
  - enabledModules (json — {meetings:true, prospects:true, knowledge:true, …})
  - serviceLines (json string[])
  - createdAt / updatedAt

brain_relationship_overlays   (Brain-only fields layered onto a CRM company OR deal)
  - id
  - clientId
  - companyId (FK crm_companies, nullable)
  - dealId (FK crm_deals, nullable)
  - relationshipType (varchar — 'household' | 'divorce_case' | 'family_business' | 'plan_sponsor' | 'prospect' | 'referral_partner' | 'generic')
  - status (varchar)
  - secondaryOwnerId (FK users, nullable)
  - priority (varchar)
  - serviceLines (json string[])
  - summary (text)
  - currentPriorities (text)
  - openLoops (text)
  - lastTouchAt (timestamp)
  - nextReviewAt (timestamp)
  - confidentialityLevel (varchar)
  - complianceFlags (json string[])
  - sourceSystem (varchar)
  - externalUrl (varchar)
  - staleAfterDays (integer nullable)        ← covers "prospects going stale"
  - createdAt / updatedAt
  - CHECK: exactly one of (companyId, dealId) is non-null

brain_meetings
  - id
  - clientId
  - companyId (FK crm_companies, nullable)
  - dealId (FK crm_deals, nullable)
  - title
  - meetingDate (timestamp)
  - participantsJson (json — denormalised list of {contactId?, name, email?})
  - transcript (text)
  - aiSummary (text)
  - humanSummary (text)
  - status: 'draft' | 'processing' | 'needs_review' | 'approved'
  - reviewedBy (FK users)
  - reviewedAt
  - confidentialityLevel
  - createdBy (FK users)
  - createdAt / updatedAt

brain_meeting_participants    (when we want true relational link to crm_contacts)
  - id
  - meetingId (FK brain_meetings)
  - contactId (FK crm_contacts, nullable — null for ad-hoc participants)
  - name (varchar)
  - email (varchar, nullable)
  - roleInMeeting (varchar)

brain_tasks                   (Brain-flavoured tasks; bridges to existing systems)
  - id
  - clientId
  - companyId (FK crm_companies, nullable)
  - dealId (FK crm_deals, nullable)
  - meetingId (FK brain_meetings, nullable)
  - linkedKanbanCardId (FK kanban_cards, nullable)   ← lets a Brain task get pushed into a project board
  - linkedActivityId (FK crm_activities, nullable)   ← or logged as a CRM activity
  - title
  - description
  - ownerId (FK users)
  - status (varchar — open|in_progress|blocked|done)
  - priority (varchar)
  - dueDate (timestamp)
  - blockedReason (text)
  - source (varchar — 'manual' | 'meeting' | 'ai_suggestion')
  - createdByAi (boolean default false)
  - needsReview (boolean default false)
  - complianceFlag (boolean default false)
  - createdAt / updatedAt

brain_notes
  - id
  - clientId
  - companyId / dealId (FK, nullable)
  - title
  - body (text)
  - type (varchar — 'general' | 'decision' | 'commitment' | 'context')
  - tags (json string[])
  - confidentialityLevel
  - createdBy (FK users)
  - createdAt / updatedAt

brain_documents
  - id
  - clientId
  - companyId / dealId (FK, nullable)
  - title
  - fileUrl (varchar)
  - source (varchar — 'upload' | 'gdrive' | 'email' | 'imported')
  - extractedText (text)
  - summary (text)
  - confidentialityLevel
  - createdAt / updatedAt

brain_ai_review_items         (the human approval queue — central to product story)
  - id
  - clientId
  - sourceType (varchar — 'meeting' | 'document' | 'manual')
  - sourceId (integer)
  - proposedType (varchar — 'task' | 'note' | 'relationship_update' | 'follow_up')
  - proposedPayload (json)
  - status (varchar — 'pending' | 'approved' | 'rejected' | 'edited')
  - reviewedBy (FK users)
  - reviewedAt
  - createdAt

brain_ai_jobs                 (async processing — meeting transcript → structured output)
  - id
  - clientId
  - jobType (varchar — 'process_meeting' | 'embed' | 'summarize_doc')
  - status (varchar — 'queued' | 'running' | 'completed' | 'failed')
  - input (json)
  - output (json)
  - error (text)
  - createdBy (FK users)
  - createdAt / completedAt

brain_audit_logs
  - id
  - clientId
  - actorId (FK users — null for AI-only actions)
  - action (varchar — 'approve_review_item' | 'edit_relationship' | 'reject_suggestion' | …)
  - entityType
  - entityId (integer)
  - metadata (json)
  - createdAt

brain_embeddings              (DEFERRED until pgvector is enabled — schema stub only)
  -- migration adds CREATE EXTENSION IF NOT EXISTS vector
  - id
  - clientId
  - sourceType
  - sourceId
  - content (text)
  - embedding vector(1536)
  - metadata (json)
  - createdAt
```

### Deliberately NOT created

- `relationships` — use `brain_relationship_overlays` over `crm_companies` / `crm_deals`.
- `people` — use `crm_contacts`. Add Brain-specific columns there (or use a `brain_contact_overlays` table) only if/when needed.
- `prospects` — use `crm_deals` with stage filter + `brain_relationship_overlays.staleAfterDays`.

### Decisions to confirm before writing migration

1. **Overlay pattern vs. extend CRM tables directly.** Two valid approaches:
   - (A) `brain_relationship_overlays` as a separate table (proposed — keeps Brain isolated and disablable per client).
   - (B) Add nullable Brain columns directly to `crm_companies` / `crm_deals`.
   Recommendation: (A) for cleanliness. Worth flagging.
2. **Brain tasks vs. CRM activities vs. kanban cards.** Brain tasks are a separate concept (cross-project, decision-driven, AI-suggested) but they should be promotable. The `linkedKanbanCardId` / `linkedActivityId` columns are how. Confirm this lift-over is desired.
3. **Confidentiality enforcement.** This is a UI-level filter for MVP. Real RLS / per-record ACLs are out of scope unless the product demands it.

---

## 4. Adjusted route map

All routes scoped via `getPortalClient(userId)` in handlers. No `[workspaceId]` segment.

### Pages (under `app/portal/brain/`)

```
/portal/brain                          → dashboard (command center)
/portal/brain/ask                      → "Ask Brain" chat (reuses aiConversations)
/portal/brain/relationships            → list (filters by type, owner, priority)
/portal/brain/relationships/[id]       → detail (snapshot + people + tasks + meetings + notes + docs)
/portal/brain/meetings                 → list
/portal/brain/meetings/new             → create form
/portal/brain/meetings/[id]            → detail (read-only after approval)
/portal/brain/meetings/[id]/review     → review/approval workflow
/portal/brain/tasks                    → Brain task views (My/All/Overdue/Blocked/Needs Review/By Relationship)
/portal/brain/prospects                → CRM-deals view filtered to "prospect" stages with stale flagging
/portal/brain/knowledge                → notes + documents
/portal/brain/settings                 → brain_profiles config + module toggles + industry template
```

> Reused: `crm_contacts` continues to be managed at `/portal/crm/contacts`. Brain relationships *link* to contacts but don't reimplement their list.

### APIs (under `app/api/portal/brain/`)

```
GET    /api/portal/brain/dashboard
GET    /api/portal/brain/relationships?type=&owner=&priority=
POST   /api/portal/brain/relationships              (create overlay over crm_company or crm_deal)
GET    /api/portal/brain/relationships/[id]
PUT    /api/portal/brain/relationships/[id]
DELETE /api/portal/brain/relationships/[id]

GET    /api/portal/brain/meetings
POST   /api/portal/brain/meetings                   (creates draft meeting)
GET    /api/portal/brain/meetings/[id]
PUT    /api/portal/brain/meetings/[id]
POST   /api/portal/brain/meetings/[id]/process      (enqueues brain_ai_job, returns jobId)
GET    /api/portal/brain/meetings/[id]/review       (returns ai_review_items for this meeting)
POST   /api/portal/brain/review-items/[id]/approve  (writes the proposed payload + audit log)
POST   /api/portal/brain/review-items/[id]/reject

GET    /api/portal/brain/tasks
POST   /api/portal/brain/tasks
PUT    /api/portal/brain/tasks/[id]
POST   /api/portal/brain/tasks/[id]/promote-to-kanban   (creates kanban_cards row, links)

GET    /api/portal/brain/prospects                  (crm_deals join brain_relationship_overlays + stale calc)

GET    /api/portal/brain/notes / POST / [id] PUT/DELETE
GET    /api/portal/brain/documents / POST / [id] PUT/DELETE

POST   /api/portal/brain/ask                        (chat; reuses Anthropic + extended PORTAL_TOOLS)

GET    /api/portal/brain/settings
PUT    /api/portal/brain/settings                   (updates brain_profiles row; admin only)

POST   /api/portal/brain/jobs/[id]/run              (server-side worker hook; or via existing cron)
```

---

## 5. Service layer / file layout

```
lib/brain/
  index.ts                  re-exports
  profiles.ts               getOrCreateBrainProfile(clientId), updateProfile(...)
  relationships.ts          listRelationships, getRelationship, upsertOverlay
  meetings.ts               createMeeting, getMeeting, listMeetings, processMeeting
  review.ts                 listReviewItems, approveItem (transactional: writes target + audit)
  tasks.ts                  brain task CRUD + promoteToKanban
  prospects.ts              listProspects (deal stage filter + stale calc)
  notes.ts / documents.ts   CRUD + extracted-text helpers
  search.ts                 keyword search MVP; pgvector branch behind feature flag
  audit.ts                  logAudit(...) helper
  industry-templates/
    wealth-advisory.ts      relationship types, service lines, default views, compliance flags
    generic.ts
    index.ts                getTemplate(name)

lib/ai/
  brain-tools.ts            new tool defs to extend PORTAL_TOOLS:
                              - search_brain
                              - get_relationship
                              - list_open_tasks
                              - propose_task_from_text
                              - summarise_meeting
  meeting-processor.ts      transcript → structured JSON {summary, decisions, commitments,
                              tasks[], suggested owners, suggested dates, missing context,
                              relationship updates, compliance warnings}
                            Returns brain_ai_review_items rows; never writes business records directly.
```

---

## 6. AI integration

- **Provider:** keep direct Anthropic SDK usage. Add `lib/ai/anthropic.ts` only if needed for shared headers / model selection — not required.
- **Meeting processor:** structured-JSON prompt → Claude (model: `claude-sonnet-4-6` for cost; upgradable). Output parsed and stored as `brain_ai_review_items` rows. `brain_ai_jobs` tracks status. **Nothing writes to `brain_tasks` / `brain_notes` / `brain_relationship_overlays` until a human approves.**
- **Ask Brain:** new conversation flow that:
  1. Reuses `aiConversations` / `aiMessages` (add a `kind: 'brain'` discriminator column, or filter by tool set).
  2. Uses `PORTAL_TOOLS` extended with Brain tools (search, get_relationship, etc.).
  3. Cites sources by `{type, id, title}` — system prompt enforces.
- **Embeddings:** schema-stubbed only. MVP uses ILIKE keyword search across `brain_meetings.transcript`, `brain_meetings.aiSummary`, `brain_notes.body`, `brain_documents.extractedText`, `brain_relationship_overlays.summary/currentPriorities/openLoops`. Migration to add `CREATE EXTENSION IF NOT EXISTS vector` + `brain_embeddings` table is a separate phase, gated behind `brain_profiles.embeddingProvider != null`.

---

## 7. Meeting source adapters

Meetings ingest content via pluggable **source adapters**. Each adapter produces a normalized payload `{ transcript, title?, meetingDate?, participants?, sourceRef }` that the meeting CRUD layer (`lib/brain/meetings.ts`) accepts. New sources can be added without touching the AI processor or review queue.

### Adapter contract

```ts
// lib/brain/meeting-sources/index.ts
export interface NormalizedMeetingInput {
  transcript: string;
  title?: string;
  meetingDate?: Date;
  participants?: { name: string; email?: string; contactId?: number }[];
  sourceRef: string;          // doc id, file id, recording id, or 'paste-{uuid}'
  sourceMetadata?: Record<string, unknown>;
}

export interface MeetingSourceAdapter {
  id: 'paste' | 'upload' | 'google-doc' | 'google-drive-watch' | 'google-meet-recording' | 'zoom';
  label: string;
  enabledFor(client: Client, profile: BrainProfile): boolean | Promise<boolean>;
  fetch(input: unknown, ctx: { clientId: number; userId: number }): Promise<NormalizedMeetingInput | null>;
}
```

UI: the **New Meeting** page (`app/portal/brain/meetings/new/page.tsx`) renders adapters as tabs. Adapter selection is gated by feature flags + OAuth status (e.g. only show "Google Doc" if Google is connected with the right scopes). All adapters write a `brain_audit_logs` row with `action='meeting.imported'` and metadata `{adapterId, sourceRef, byteCount}`. Idempotency: add a unique index on `(clientId, sourceRef)` to `brain_meetings` so repeated imports update rather than duplicate.

### Adapter A — Manual paste (MVP, Phase 2a)

- File: `lib/brain/meeting-sources/paste.ts`
- Input: `{ transcript: string, title?: string, meetingDate?: Date, participants?: ... }`
- No auth, no fetch. Always available. The fallback and demo path.
- Effort: included in Phase 2a.

### Adapter B — Direct upload (Phase 2b, low effort)

- File: `lib/brain/meeting-sources/upload.ts`
- Accepts `.txt`, `.vtt`, `.srt`, `.docx`. Reuses the existing media upload at `app/api/upload/`.
- Strips `.vtt` / `.srt` timestamps and speaker labels into clean transcript text.
- Useful for Otter / Fathom / Granola / manual exports.
- Effort: ~½ day.

### Adapter C — Google Docs (Phase 2c, ~½ day)

- File: `lib/brain/meeting-sources/google-doc.ts`
- Input: `{ docUrl: string }` (paste a URL) **or** `{ docId: string }` (Google Picker selection from the client).
- Reuses existing OAuth: `googleCalendarTokens` table + `getAuthedClient(clientId)` from `lib/google-calendar.ts:13` (already handles refresh).
- Scope additions in `app/api/portal/tools/booking/google/auth/route.ts:29`:
  - `https://www.googleapis.com/auth/documents.readonly` (read Doc body)
  - `https://www.googleapis.com/auth/drive.readonly` (only if shipping the Picker UI; lets the user search/pick instead of pasting URLs)
  - This triggers an OAuth re-consent for already-connected clients — the auth route should detect missing scopes and return a re-auth URL.
- Implementation:
  1. Client-side: optional Google Picker to choose a Doc; otherwise URL paste.
  2. Server: `docs.documents.get({documentId})`, walk `body.content`, flatten paragraph runs into plain text → `transcript`.
  3. `title` ← Doc `title`. `meetingDate` left null (user fills in form).
  4. `sourceRef` ← `gdoc:${documentId}`. Optionally store `revisionId` in `sourceMetadata` so we can re-pull on Doc updates.
- Audit: `meeting.imported_from_google_doc`.
- Out of scope: comments, suggestions, embedded images.

### Adapter D — Google Drive folder watch (deferred, ~2 days)

- File: `lib/brain/meeting-sources/google-drive-watch.ts`
- Per-client config: pick a "Meeting Notes" folder. Add columns to `brain_profiles` (or a sidecar `brain_meeting_source_configs` table):
  - `meetingDriveFolderId`
  - `meetingDriveChannelId`
  - `meetingDriveChannelExpires`
  - `meetingDriveStartPageToken`
- Implementation:
  1. On enable: `drive.files.watch` registers a push channel pointing at `/api/portal/brain/google-drive/webhook`.
  2. Webhook: dedupe via `X-Goog-Channel-Id`, call `drive.changes.list({pageToken})`, filter to docs whose parent equals the watched folder, fetch each Doc body, create `brain_meetings` row with `status='draft'` and `source='google_drive_watch'`.
  3. Cron renewal job (channels expire after 7 days max). Reuse the existing `app/api/cron/` pattern.
- Scopes: `drive.metadata.readonly` + `drive.readonly` + `documents.readonly`.
- Risks: webhook delivery is at-least-once → idempotency via `(clientId, sourceRef)` unique constraint; channel quotas; folder rename or move; users adding non-meeting docs into the watched folder (mitigation: filename heuristic + Brain still requires human approval before any record is written).

### Adapter E — Google Meet recordings (deferred, ~2 days, depends on customer Workspace tier)

- File: `lib/brain/meeting-sources/google-meet-recording.ts`
- Google Meet auto-saves recordings, transcripts, and "Take notes for me" summaries to Drive when enabled at the Workspace policy level. Files land in a `Meet Recordings` folder owned by the meeting host.
- Implementation: a specialization of Adapter D — watch the user's `Meet Recordings` folder, filter to transcript files (e.g. `Notes from Meeting…` Docs and `*.txt` transcripts), parse, ingest as drafts.
- Highest-value UX: meeting happens → transcript appears in Drive → Brain creates a draft → AI processes → review queue. Zero copy-paste.
- Depends on Adapter D infra. Ship together if the team commits to it.
- Customer prerequisites: Google Workspace plan that allows Meet recording/transcripts; meeting host enables recording.

### Adapter F — Zoom (deferred, opportunistic)

- File: `lib/brain/meeting-sources/zoom.ts`
- `lib/zoom.ts` already exists — confirm scope before implementing. Zoom Cloud Recordings include a transcript file via the `recordings.list` REST endpoint.
- Subscribe to the `recording.completed` webhook → fetch transcript → ingest. Same shape as Adapters D/E.
- Activate when there's customer pull. Architecture supports it without rework.

### Adapter routing in the meeting service

`lib/brain/meetings.ts::createFromAdapter(adapterId, input, ctx)` is the single entry point for all adapters. It:

1. Looks up the adapter, calls `enabledFor` and `fetch`.
2. Inserts the `brain_meetings` row (`status='draft'`).
3. Writes the audit log row.
4. (Optional, gated by adapter config) auto-enqueues a `brain_ai_jobs` row for processing — useful for watch-based adapters where there's no UI moment to click "Process".

### Storage and confidentiality

- Pulled transcripts are stored in `brain_meetings.transcript` (text). For very large transcripts (>50KB) consider moving to S3 (`lib/s3/`) and keeping just a URL — defer until a real customer hits that profile.
- `confidentialityLevel` defaults from `brain_profiles.defaultConfidentiality`. Adapters can override (e.g. Drive folder labelled "Confidential" → set `confidentialityLevel='confidential'` on import). Out of scope for MVP.

---

## 8. Authorization & billing

- **Service entitlement:** Add row to `services` with `category='brain'`. Each `authorizePortal` call in Brain handlers passes `requireService: 'brain'`. `lib/portal-auth.ts:81`
- **Roles:** read = viewer+, write = member+, settings = admin+, hard-delete = owner. Use the existing `action: 'read'|'write'|'admin'|'owner'` levels.
- **AI metering:** every AI-powered call (`processMeeting`, `askBrain`) goes through `hasCredits` / `deductCredits` from `lib/ai-credits.ts`.
- **Audit log:** every approval / reject / edit on a review item, every relationship overlay edit, every confidential-doc access, every adapter import — write a `brain_audit_logs` row.

---

## 9. Build order (revised, with phases)

### Phase 0 — Foundations (1 PR)

- Add `services` row for `brain` category (seed).
- Add `lib/db/schema.ts` additions: `brainProfiles` only.
- Add `lib/brain/profiles.ts` + `getOrCreateBrainProfile`.
- Migration generated.
- `app/portal/brain/page.tsx` skeleton ("Company Brain — coming soon" + enable CTA if disabled).
- Sidebar entry under "Tools" or top-level (gated by `requireService:'brain'`).
- Settings page `app/portal/brain/settings/page.tsx` + `/api/portal/brain/settings` GET/PUT.

**Deliverable:** Brain can be enabled per client; admin can pick industry template.

### Phase 1 — Relationships overlay (1 PR)

- `brainRelationshipOverlays` table + migration.
- `lib/brain/relationships.ts` service.
- API + pages: `/portal/brain/relationships`, `/portal/brain/relationships/[id]`.
- Detail page composes data from `crm_companies` / `crm_deals` / `crm_contacts` (linked) + overlay fields.
- Industry template seeds: `wealth-advisory.ts` (types, service lines, default views, compliance defaults).

**Deliverable:** Browseable relationship list + detail, surfaced atop existing CRM data.

### Phase 2 — Meetings + review queue (3 PRs)

- PR 2a: `brainMeetings`, `brainMeetingParticipants`, `brainAiReviewItems`, `brainAiJobs`, `brainAuditLogs` tables + unique `(clientId, sourceRef)` index on meetings. Adapter contract scaffolding. Service layer, CRUD, `/portal/brain/meetings`, `/portal/brain/meetings/new`, `/portal/brain/meetings/[id]`. **Adapter A (paste)** wired. No AI yet.
- PR 2b: `lib/ai/meeting-processor.ts`, `POST /meetings/[id]/process`, review page `/portal/brain/meetings/[id]/review`, approval API. Audit logging on every approval. Metering via `deductCredits`. **Adapter B (upload)** for `.txt`/`.vtt`/`.srt`/`.docx`.
- PR 2c: **Adapter C (Google Doc)**. Scope additions to OAuth route + re-consent flow. URL paste + optional Picker.

**Deliverable:** Paste / upload / Google Doc → AI proposes → human approves → records written.

### Phase 3 — Brain tasks (1 PR)

- `brainTasks` table.
- Task views: My / All / Overdue / Blocked / Needs Review / By Relationship.
- Promote-to-kanban path (creates `kanban_cards` row in selected project; links back).
- Approval of a "task" review item creates a `brain_tasks` row with `createdByAi=true`, `needsReview=false`, `source='meeting'`.

**Deliverable:** Full meeting → task lifecycle, with promotion into existing project boards.

### Phase 4 — Dashboard, prospects, knowledge (1–2 PRs)

- Dashboard tile queries (today's priorities, overdue tasks, decisions needed, meetings needing review, prospects going stale, recently updated relationships, blocked work). All on `/portal/brain`.
- Prospects view (`crm_deals` filtered to "prospect" pipeline stages, ordered by `lastTouchAt` with `staleAfterDays` flag from overlay).
- `brainNotes` + `brainDocuments` tables, CRUD, `/portal/brain/knowledge`.

**Deliverable:** Command-center landing page; prospects board; notes/docs.

### Phase 5 — Ask Brain (keyword) (1 PR)

- `/portal/brain/ask` page, reusing chat UI patterns from existing `AIChatWidget`.
- `lib/ai/brain-tools.ts` (search_brain, get_relationship, list_open_tasks).
- Extend `PORTAL_TOOLS` and `executePortalTool`.
- Keyword search across transcripts, summaries, notes, docs, overlays.
- Citations enforced via system prompt.

**Deliverable:** Conversational query layer over the brain. No embeddings yet.

### Phase 5.5 — Drive watch + Meet recordings (1–2 PRs, deferred)

- **Adapter D (Drive folder watch)** + **Adapter E (Meet recordings)** — ship together (E is a thin specialization of D).
- `brain_profiles` columns for Drive folder + channel state; webhook handler at `/api/portal/brain/google-drive/webhook`; channel-renewal cron.
- Auto-enqueues `brain_ai_jobs` on import so watch-based meetings flow straight into the review queue without a UI click.
- Re-consent UX: prompts users with old Calendar-only OAuth to grant Drive scopes.

**Deliverable:** Meetings on Google Meet → transcript appears in Drive → Brain creates a draft → review queue. Zero copy-paste path.

### Phase 6 — Embeddings (deferred, separate epic)

- Migration: `CREATE EXTENSION IF NOT EXISTS vector`.
- `brainEmbeddings` table.
- Background job (existing cron infra) to embed new content.
- Replace ILIKE search with hybrid keyword + vector when `brain_profiles.embeddingProvider != null`.

### Phase 7 — Seed + docs

- Seed/demo data hooks (look for existing seed pattern; if none, ship a `scripts/seed-brain-demo.ts`).
- `BRAIN.md` in repo root: how to enable for a client, template selection, AI cost notes, security model.

---

## 10. MVP slice (smallest shippable unit)

If the goal is a demo within ~1–2 days of focused work, ship **Phase 0 + Phase 2** (skipping Phase 1 relationships overlay for now):

- Brain enable/disable per client.
- Paste meeting transcript → AI processes → review queue → human approves.
- Approved tasks land in a simple `brain_tasks` list at `/portal/brain/tasks`.

Skip relationships overlay, dashboard, prospects, ask, embeddings. This proves the core value — AI never writes without approval — without recreating the CRM.

---

## 11. Risks & open questions

1. **Are we forking the CRM?** The product brief uses CRM-shaped vocabulary ("relationships", "people", "prospects"). If the answer is "yes, build a parallel system," much of the overlay design changes. Recommend: confirm with stakeholder before Phase 1.
2. **Industry templates: how many?** `wealth_advisory` is named explicitly. The proposed mechanism (data-driven config under `lib/brain/industry-templates/`) supports many, but the first one needs careful scoping with subject-matter input.
3. **Compliance / confidentiality enforcement.** MVP filters by `confidentialityLevel` in queries based on user role. Real per-record ACLs / encrypted fields / audit-log retention SLAs are out of scope and should be a separate phase if regulated industries are sold.
4. **Meeting transcript ingestion.** Adapter framework defined in Section 7. MVP ships Adapters A (paste), B (upload), C (Google Doc). Adapters D (Drive watch), E (Meet recordings), F (Zoom) are deferred. Pre-Phase-2c, confirm willingness to add Drive/Docs scopes to the existing OAuth consent screen — clients will need to re-grant.
5. **AI cost & rate.** Long transcripts → expensive `messages.create` calls. Phase 2b should cap input length, queue rather than block, and count tokens against `aiCredits`.
6. **pgvector availability.** Hosting target needs the extension. Confirm Supabase / Postgres provider supports it before scheduling Phase 6.
7. **Multi-client members.** A user with access to multiple clients should see the right Brain (resolved by active client cookie / subdomain). Inherit existing pattern; no new work.
8. **Service definition.** Need a SKU + price for the `brain` service category before turning it on for paying clients. Out of engineering scope but blocks GA.
9. **Google Workspace tier for Meet recordings.** Adapter E only works for customers whose Workspace plan allows Meet recording/transcripts and whose admins have enabled it. Don't build it speculatively — only when a paying customer requests it.

---

## 12. What changes in the original `companyBrain.md`

If you keep the original spec doc as a product brief, the following lines should be annotated as "rewritten in companyBrain-adjusted.md":

- All `/workspaces/[workspaceId]/...` route paths
- `workspace_id` columns (→ `clientId` integer FK)
- `relationships` / `people` / `prospects` as new entities (→ overlays + reuse CRM)
- "Server actions or route handlers" (→ route handlers only)
- "AI service abstraction with stub providers" (→ direct Anthropic + meeting-processor module)
- "pgvector if already configured" (→ stubbed; MVP keyword-only)
- Meeting "paste transcript" only (→ adapter framework: paste, upload, Google Doc, Drive watch, Meet recording, Zoom)

---

## 13. Suggested next step

Confirm the five high-leverage decisions before any code:

1. **Overlay vs. CRM extension** for relationships (default: overlay).
2. **Brain tasks as separate table** with promotion to kanban (default: yes).
3. **MVP slice** = Phase 0 + Phase 2 only? (recommended for fastest demo, paste-only).
4. **Service entitlement** — should Brain require a paid `brain` service from day 1, or be free during alpha? (default: free with feature flag, paid at GA).
5. **Google Docs adapter scope** — add `documents.readonly` (URL paste) only, or also `drive.readonly` for the Picker UI? (default: both, accept the OAuth re-consent UX cost). Decision drives whether 2c ships in Phase 2 or slips to Phase 3+.

Once those are answered, Phase 0 is ~half a day of work and unblocks everything else.
