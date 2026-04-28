---
milestone: google-workspace-integration
created: 2026-04-28
status: planning
---

# Roadmap: Google Workspace Integration

## Overview

Five phases delivering a Workspace-only Google integration with dual connection model, OAuth + backfill, push-based real-time sync, AI-driven classification, and finished UI/privacy controls. Each phase is independently verifiable and unblocks the next. Estimated duration: 2.5–3 weeks of focused work.

## Phases

- [ ] **Phase 1: GCP Foundation + Schema** — Stand up the GCP project, configure consent screen, enable APIs, create Pub/Sub topic, store credentials, and ship the two new connection tables plus crmActivities.viaUserId.
- [ ] **Phase 2: OAuth + Backfill** — Build the dual OAuth flows (client + user), the `lib/google/oauth.ts` shared helper, the integrations settings page, and the on-demand backfill for Contacts + Calendar 90d + Gmail 30d. End-state: a user can connect, click "Sync now", and see CRM activities + contacts populated.
- [ ] **Phase 3: Push Notifications + Webhook Worker** — Build `workers/google-webhook` Cloudflare Worker, register Drive folder watches per-deal, register Calendar watches per-user, register Gmail Pub/Sub watches per-user, and ship the daily renewal cron. End-state: dropping a Doc into a deal folder creates a brain meeting record within seconds without manual sync.
- [ ] **Phase 4: AI Classification + Aggressiveness** — Wire the AI classifier through `brainAiJobs`, implement aggressiveness thresholds, populate `brainAiReviewItems` for ambiguous items, classify Drive Docs (meeting/proposal/contract/other), and respect confidentiality flags.
- [ ] **Phase 5: Privacy, Provenance, Polish** — Connection error UI, soft-revoke on clientMembers removal, opt-out of body storage, hard-delete purge action, dedupe across multi-user surfaces, and integration health dashboard.

## Phase Details

### Phase 1: GCP Foundation + Schema
**Goal:** A functioning GCP project + Pub/Sub setup exists, credentials are deployed to all environments, and the database has the columns needed for everything downstream.
**Depends on:** Nothing (first phase)
**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. A GCP project exists, billing is enabled, the OAuth consent screen is "Internal" with required scopes (gmail.readonly, calendar.readonly, drive, contacts.readonly, drive.metadata.readonly) registered.
  2. A Pub/Sub topic exists for Gmail watch with the necessary IAM grants for `gmail-api-push@system.gserviceaccount.com`.
  3. `google_workspace_client_connections` and `google_workspace_user_connections` tables exist in the database with all columns specified in REQUIREMENTS.md FOUND-02.
  4. `crmActivities.viaUserId` column exists, nullable, with FK to users.
  5. `lib/google/oauth.ts` exports `buildAuthUrl`, `exchangeCode`, `refreshIfExpired`, `revoke` and is unit-tested with mocked Google responses.

### Phase 2: OAuth + Backfill
**Goal:** A portal user can connect a Google account from the integrations page and pull historical Contacts, Calendar, and Gmail data into the CRM and brain.
**Depends on:** Phase 1
**Requirements:** CONN-01, CONN-02, CONN-03, BACK-01, BACK-02, BACK-03, BACK-04, UI-01, UI-02, DEDUPE-01, DEDUPE-02
**Success Criteria** (what must be TRUE):
  1. From `/portal/settings/integrations`, an owner|admin can click "Connect Workspace" and complete the OAuth flow. The page then shows the connection status with the Google account email and last sync timestamp.
  2. Any portal user can click "Connect my personal Google" on the same page and authorize their own connection without affecting the workspace connection.
  3. Clicking "Sync now" on a moderate-aggressiveness connection backfills Contacts, last 90 days of Calendar events, and last 30 days of Gmail messages. Re-clicking does not produce duplicates.
  4. After backfill, the CRM contacts list shows imported contacts, and contact detail pages show calendar events and emails as activities.
  5. Disconnect removes the connection row's tokens (or marks revokedAt), calls Google's revoke endpoint, and the UI reflects "not connected".

### Phase 3: Push Notifications + Webhook Worker
**Goal:** New activity in Google (a Doc dropped in a watched folder, a calendar event accepted, a new email) reaches the portal within seconds of arriving in Google, without polling.
**Depends on:** Phase 2
**Requirements:** PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. The Cloudflare Worker `workers/google-webhook` is deployed, HMAC-verifies incoming channel headers, and dispatches to `/api/google/sync` correctly for Drive, Calendar, and Gmail Pub/Sub payloads.
  2. From a CRM deal page, "Attach Drive folder" opens Google Picker, registers a `drive.changes.watch` channel, and stores the linkage. Dropping a new Doc in that folder produces a record visible in the portal within 30 seconds without manual refresh.
  3. Calendar watch fires on event creation/modification — new events appear as activities on the matching contact within 30 seconds.
  4. Gmail Pub/Sub watch fires on new mail — relevant messages produce activities within 30 seconds.
  5. The daily renewal cron runs and renews any watch with `expiration` < 24h. Failed renewals appear in the integrations page error state.

### Phase 4: AI Classification + Aggressiveness
**Goal:** Sync output is filtered intelligently — substantive interactions become brain review items, deal documents are classified correctly, and the aggressiveness setting actually changes behavior end-to-end.
**Depends on:** Phase 3
**Requirements:** AI-01, AI-02, AI-03, AI-04, BACK-03 (re-tested), UI-02 (aggressiveness selector wiring)
**Success Criteria** (what must be TRUE):
  1. A Doc dropped in a deal folder is classified by the AI as `brain_meeting | proposal | contract | other` and routed correctly (meetings → brainMeetings, proposals/contracts → deal documents, other → ignored or flagged).
  2. A connection set to "passive" only logs activities for already-known CRM contacts; the same connection set to "aggressive" auto-creates contacts and queues ambiguous Gmail threads into `brainAiReviewItems`.
  3. Switching aggressiveness from "passive" to "aggressive" does not retroactively create historical contacts; new sync output reflects the new level immediately.
  4. A meeting flagged confidential is not embedded for vector search even at "aggressive" level.

### Phase 5: Privacy, Provenance, Polish
**Goal:** The integration handles edge cases gracefully — user offboarding, token revocation, body-storage opt-out, multi-user dedupe, and visible health.
**Depends on:** Phase 4
**Requirements:** CONN-04, CONN-05, PRIV-01, PRIV-02, PRIV-03, PRIV-04, DEDUPE-03, UI-05
**Success Criteria** (what must be TRUE):
  1. Removing a user from `clientMembers` soft-revokes their personal connection within that client (revokedAt set, watches cancelled, activities preserved with viaUserId still recorded).
  2. A connection with `syncSettings.storeBodies: false` does not store Gmail body text in `crmActivities` — only sender/recipient/subject/date.
  3. An admin can hard-delete activities sourced from a specific (revoked) connection via a "purge data" action.
  4. When the same calendar event arrives via two reps' personal connections, only one activity row exists, but a record (jsonb column or sibling table) shows both reps' user IDs as touchpoints.
  5. The integrations page shows a banner when any connection has an invalidated refresh token or expired watch, with a one-click reconnect button.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. GCP Foundation + Schema | 0/3 | Planned | - |
| 2. OAuth + Backfill | 0/TBD | Not started | - |
| 3. Push Notifications + Webhook Worker | 0/TBD | Not started | - |
| 4. AI Classification + Aggressiveness | 0/TBD | Not started | - |
| 5. Privacy, Provenance, Polish | 0/TBD | Not started | - |
