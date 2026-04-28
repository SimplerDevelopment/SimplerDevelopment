---
milestone: google-workspace-integration
created: 2026-04-28
---

# Requirements: Google Workspace Integration

Each requirement maps to one or more phases. Phase plans must claim every REQ-ID in their frontmatter `requirements:` field. Coverage is verified at planning time.

## Foundation (FOUND)

- **FOUND-01** — A Google Cloud project exists with billing enabled, OAuth consent screen configured as "Internal" (Workspace-only), required Google APIs enabled (Gmail, Calendar, Drive, Contacts, Pub/Sub), a Pub/Sub topic exists for Gmail push, and OAuth client credentials are present in environment variables for both local and production.
- **FOUND-02** — Two new database tables exist: `google_workspace_client_connections` (one per client, unique on clientId) and `google_workspace_user_connections` (one per user-within-client, unique on clientId+userId). Both have accessToken, refreshToken, expiresAt, scopes (jsonb), syncSettings (jsonb), per-surface sync cursors (gmailHistoryId, driveStartPageToken, calendarSyncToken, contactsSyncToken), revokedAt, and lastSyncAt.
- **FOUND-03** — `crmActivities` has a new nullable `viaUserId` column (FK to users) recording which user's Google connection surfaced an activity. Existing rows have NULL.
- **FOUND-04** — A shared OAuth helper module exists at `lib/google/oauth.ts` providing buildAuthUrl, exchangeCode, refreshIfExpired, revoke. Reused by both connection types and any future Google integration.

## OAuth & Connection Lifecycle (CONN)

- **CONN-01** — Portal user with role owner|admin can authorize a client-level Google connection from `/portal/settings/integrations`. The OAuth flow requests `access_type=offline&prompt=consent&include_granted_scopes=true`, captures refresh token, and stores it against the active clientId.
- **CONN-02** — Any portal user can authorize their personal Google connection from the same page. Their connection is scoped to (clientId, userId) and visible only to themselves and client admins.
- **CONN-03** — Disconnect calls Google's revoke endpoint, marks `revokedAt`, and stops further sync. UI reflects disconnected state. Cached data (CRM activities, brain meetings) is preserved.
- **CONN-04** — When a `clientMembers` row is deleted (user removed from client), their personal connection within that client is soft-revoked automatically (revokedAt set, watches cancelled, historical data preserved).
- **CONN-05** — A daily cron detects connections where the refresh token has been invalidated (Google returns invalid_grant) and surfaces "reconnect required" in the integrations UI.

## Backfill (BACK)

- **BACK-01** — On first connect (or on-demand "Sync now"), backfill pulls: Contacts (full list, deduped against existing `crmContacts.email`), Calendar events from last 90 days (deduped by Google `event.id` against `crmActivities`), and Gmail messages from last 30 days (deduped by Gmail `message.id`).
- **BACK-02** — Backfill runs in a background job (Cloudflare Worker or Next.js route handler with async dispatch), not synchronously in the OAuth callback. UI shows progress.
- **BACK-03** — Backfill respects the connection's `syncSettings.aggressiveness`: at "passive", only logs activities for already-known CRM contacts; at "moderate" or "aggressive", auto-creates contacts.
- **BACK-04** — Backfill is idempotent — re-running does not create duplicate activities or contacts.

## Push Notifications (PUSH)

- **PUSH-01** — A new Cloudflare Worker `workers/google-webhook` receives webhooks from Google (Drive `changes.watch`, Calendar `events.watch`, Gmail Pub/Sub push). HMAC-verifies channel ID + token, parses payload, dispatches to `/api/google/sync` with the appropriate connection ID and surface.
- **PUSH-02** — Drive folder watches: from a CRM deal page, an "Attach Drive folder" button opens Google Picker. User selects (or creates) a folder. We register a `drive.changes.watch` channel scoped to that folder, store channel ID in `crm_deal_drive_folders` (new table) linking dealId → folderId → channelId.
- **PUSH-03** — Calendar watches: on connection enable, register `events.watch` for the user's primary calendar. New/changed events deduped by `event.id` and logged to `crmActivities` (type=meeting) or promoted to `brainMeetings` per aggressiveness rules.
- **PUSH-04** — Gmail watches: on connection enable (per-user only — client connections don't watch inboxes), register `users.watch` against the Pub/Sub topic. Push deliveries are processed via the webhook worker.
- **PUSH-05** — A daily cron renews any watch where `expiration` is within 24 hours. Failed renewals are logged and surfaced as "sync paused" in the UI.

## AI Classification (AI)

- **AI-01** — When a Drive Doc lands in a watched deal folder, an AI classifier reads the document content and emits one of: `brain_meeting` (looks like meeting notes), `proposal` (deal artifact), `contract` (deal artifact), `other`. Classification is stored on the resulting record.
- **AI-02** — When a Calendar event or Gmail thread surfaces and aggressiveness is `moderate` or `aggressive`, an AI classifier scores "is this a substantive interaction worth promoting to brain review?" Items above threshold create a `brainAiReviewItems` row.
- **AI-03** — Classification calls are queued via existing `brainAiJobs` infrastructure with bounded concurrency. Failures retry with exponential backoff up to 3 times.
- **AI-04** — AI classifier respects `brainProfiles.confidentiality` — confidential meetings/emails are not embedded into vector storage if vector storage is enabled.

## UI (UI)

- **UI-01** — A new page at `/portal/settings/integrations` lists all integrations. The Google Workspace card has two sections: "Workspace connection" (gated by owner|admin role, shows shared connection state) and "My personal connection" (shows current user's personal connection state).
- **UI-02** — Each connection card shows: connected Google account email, scope summary, last sync timestamp, and aggressiveness selector (off/passive/moderate/aggressive radio or dropdown).
- **UI-03** — From a CRM deal page, an "Attach Drive folder" button opens Google Picker. Selected folder is shown in the deal's right rail with a "browse folder contents" link.
- **UI-04** — The brain meeting detail page surfaces "Source: Google Drive folder watch" provenance with a deep link back to the source Doc when applicable.
- **UI-05** — Connection error states (refresh token invalidated, watch expired, scope downgrade) surface as a banner on the integrations page with a one-click reconnect.

## Provenance & Dedupe (DEDUPE)

- **DEDUPE-01** — `crmActivities.externalId` (existing or new column) holds the Google `event.id` for calendar items and `message.id` for Gmail items. Composite unique index on (clientId, externalId) prevents double-logging.
- **DEDUPE-02** — `brainMeetings.sourceRef` (existing) holds the Google ID for meetings sourced from Google. Re-ingesting the same item updates rather than creates.
- **DEDUPE-03** — When the same item surfaces via two connections (e.g., Alice and Bob both have the calendar event), the activity is logged once (first writer wins on externalId) but `viaUserId` is set, and a sibling table or jsonb column records all users whose connections also touched it.

## Privacy & Compliance (PRIV)

- **PRIV-01** — A user's personal Gmail content is never readable by other users in the same client through the portal. Activities sourced from a personal connection still respect normal CRM access rules but the original Gmail body/subject is not stored — only metadata (sender, recipient, subject, date, classification) by default.
- **PRIV-02** — At any aggressiveness level, the user can opt out of body storage (`syncSettings.storeBodies: false`).
- **PRIV-03** — Disconnect + revoke leaves historical activities in place by default; a separate "purge data" action (admin-only) can hard-delete activities sourced from a specific connection.
- **PRIV-04** — Confidentiality flags propagate: a brain meeting flagged confidential and sourced from Google does not have its body sent to AI summarization unless an admin explicitly approves.
