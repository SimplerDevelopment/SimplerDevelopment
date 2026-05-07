# Microsoft Teams → Company Brain — Implementation Status

_Last updated: 2026-05-06. Source of truth: this file plus the linked PR._

This document captures the state of the Microsoft Teams transcripts → Company Brain knowledge integration. End-to-end: portal user OAuths their Microsoft 365 account → Graph subscription created → Teams meeting transcripts arrive automatically as `brain_meetings` rows.

## Pull request

| Repo | PR | Branch | Target |
|---|---|---|---|
| `DanielPCoyle/simplerdevelopment` | [#12](https://github.com/DanielPCoyle/simplerdevelopment/pull/12) | `feat/teams-transcriptions-brain` | `staging` |

Worktree: `/Users/dancoyle/simplerdevelopment-teams-brain`. Remove with `git worktree remove` once PR #12 lands.

## Architecture — mirrors the existing Google Workspace integration

The Brain already had a clean meeting-source adapter abstraction at `lib/brain/meeting-sources/`. Teams plugs in alongside Google Meet point-for-point:

| Google component | Microsoft equivalent |
|---|---|
| `googleapis` SDK | raw fetch (Graph SDK deferred — see "Decisions" below) |
| `lib/google/oauth.ts` | `lib/microsoft/oauth.ts` |
| `lib/google/scopes.ts` | `lib/microsoft/scopes.ts` |
| `lib/google/oauth-state.ts` | `lib/microsoft/oauth-state.ts` (forked, byte-identical except for surface type) |
| `lib/google/drive-changes.ts` | `lib/microsoft/transcripts-fetch.ts` + `transcripts-sync.ts` |
| `lib/google/gmail-watch.ts` | `lib/microsoft/transcripts-watch.ts` |
| `app/api/google-webhook/drive/route.ts` | `app/api/microsoft-webhook/transcripts/route.ts` |
| (no Google equivalent) | `app/api/microsoft-webhook/lifecycle/route.ts` |
| Cron `renew-drive-watches` (daily) | Cron `renew-microsoft-subscriptions` (**every 25 min**) |
| Schema `googleWorkspaceUserConnections` | Schema `microsoftTeamsUserConnections` |
| `meeting-sources/google-meet-recording.ts` | `meeting-sources/teams-transcript.ts` |
| `brainMeetings.source = 'google_meet_recording'` | `brainMeetings.source = 'teams_transcript'` |
| `/portal/settings/integrations` Google section | `/portal/settings/integrations` Microsoft section |

## The 4 slices

PR #12 is one branch with four logical commits, each independently reviewable.

### Slice 1 — OAuth foundation

**What:** schema, OAuth client (raw fetch against `login.microsoftonline.com/{tenant}/oauth2/v2.0`), HMAC-signed state, 4 portal routes (connect/callback/disconnect/status).

**Files:**
- `lib/db/schema/tools.ts` — added `microsoftTeamsUserConnections` table (subscription columns included up front so PR 2 doesn't need a follow-up migration)
- `lib/microsoft/scopes.ts` — `MicrosoftSurface = 'identity' | 'transcripts'`
- `lib/microsoft/oauth-state.ts` — forked from `lib/google/oauth-state.ts`
- `lib/microsoft/oauth.ts` — `buildAuthUrl`, `exchangeCode`, `refreshAccessToken`, `refreshIfExpired`, `revoke` (no-op)
- `app/api/portal/integrations/microsoft/{connect,callback,disconnect,status}/route.ts`
- `drizzle/0074_microsoft_teams_user_connections.sql` — hand-written (drizzle-kit fails with snapshot-chain collision per existing migration drift)

### Slice 2 — Subscription + webhook + renewal

**What:** Graph change-notification subscriptions, webhook receivers (transcripts + lifecycle), 25-minute renewal cron.

**Files:**
- `lib/microsoft/graph-client.ts` — authenticated Graph wrapper with auto-refresh on near-expiry; returns the (possibly refreshed) connection so callers persist new tokens
- `lib/microsoft/transcripts-watch.ts` — `createTranscriptsSubscription`, `renewTranscriptsSubscription`, `deleteTranscriptsSubscription`. `SubscriptionGoneError` distinguishes 404 from other failures so the cron can recreate cleanly.
- `app/api/microsoft-webhook/transcripts/route.ts` — validation handshake (echo `validationToken` as `text/plain` within 10s) + change-notification dispatch
- `app/api/microsoft-webhook/lifecycle/route.ts` — handles `reauthorizationRequired`, `subscriptionRemoved`, `missed`
- `app/api/cron/renew-microsoft-subscriptions/route.ts` — every 25 minutes; creates if missing, PATCHes if expiring, recreates on 404
- `vercel.json` — cron entry `*/25 * * * *`
- Wired into the OAuth callback (best-effort `createTranscriptsSubscription` on connect, mirrors `startGmailWatch`) and disconnect (best-effort DELETE before scrubbing tokens)

### Slice 3 — Adapter + ingestion

**What:** the actual content path — fetch transcript VTT, parse to plaintext, run through the meeting-source adapter, write the `brain_meetings` row.

**Files:**
- `lib/microsoft/transcripts-fetch.ts` — fetches online-meeting metadata + transcript content (`?$format=text/vtt`); `vttToPlainText` parser strips WebVTT framing and converts `<v Speaker>text</v>` cues to "Speaker: text" lines
- `lib/microsoft/transcripts-sync.ts` — orchestrator. Loads connection by `subscriptionId`, fetches via Graph, runs adapter, calls `createMeetingFromAdapter`, persists `lastSyncAt`. `parseTranscriptResource` decodes the `/communications/onlineMeetings('id')/transcripts('id')` path from the notification body.
- `lib/brain/meeting-sources/teams-transcript.ts` — adapter conforming to `MeetingSourceAdapter`. `sourceRef = teams:<meetingId>:<transcriptId>` for idempotency.
- `lib/brain/meeting-sources/index.ts` — `'teams_transcript'` added to `MeetingSourceId` union and `ADAPTERS` registry
- `lib/db/schema/brain.ts` — `brainMeetings.source` comment updated (no migration; varchar)
- `app/api/microsoft-webhook/transcripts/route.ts` — webhook now calls `syncTranscriptForSubscription` per notification (inline, within Graph's 30-second budget)

### Slice 4 — Portal UI

**What:** Microsoft Teams section on `/portal/settings/integrations`, alongside the existing Google Workspace section.

**File:** `app/portal/settings/integrations/page.tsx` — added Microsoft section + `disconnectMicrosoftAction` server action.

States rendered:
- **Not configured** (env missing): tells user to contact admin
- **Not connected**: prominent amber organizer-only caveat callout + connect button
- **Connected**: account email, last-sync timestamp, subscription active-until timestamp (or "Subscription pending" if cron hasn't picked it up), disconnect button

The organizer-only caveat is rendered *before* consent so users understand the constraint before they OAuth.

## Architectural decisions

| Decision | Rationale |
|---|---|
| **Multi-tenant Azure AD app** (`signInAudience: AzureADMultipleOrgs`) | One SD-owned app, any M365 tenant's users can OAuth. Per-tenant BYO-app credentials matching the Google enterprise tier is phase 3+. |
| **Raw `fetch` over MSAL / Graph SDK** | All eight Microsoft endpoints we hit are simple HTTP — token exchange, token refresh, `/subscriptions` CRUD, `/users/{oid}/onlineMeetings`, transcript content fetch. MSAL adds a cache layer + complex flows we don't use; Graph SDK adds dependency weight without earning it on these endpoints. Reconsider in PR 5+ if we add streaming/batching/paging. |
| **Fork oauth-state, don't generalize** | Lower blast radius in foundation slice. ~80 dup lines is cheaper than touching Google call sites. Generalize when a third provider lands. |
| **ID token decoded without signature verification** | We received the token directly over TLS from `login.microsoftonline.com` — no intermediary could substitute it. We need its claims (`oid`, `tid`, `email`), not authentication. |
| **`revoke()` is a no-op** | Microsoft v2.0 has no programmatic refresh-token revoke endpoint. Users go to `account.microsoft.com/consent`. We scrub tokens + set `revoked_at` locally. |
| **Hand-written migration SQL** | `bun run db:generate` fails with snapshot-chain collision (existing journal drift, see CLAUDE.md memory). Apply `drizzle/0074_*.sql` manually. |
| **Subscription columns added in slice 1** | Forward-compatible — slice 2's webhook-and-renewal code populates them without another migration. |
| **Inline sync on webhook (not queue/async)** | Graph allows 30 seconds for ack. Typical fetch + parse + insert is <5s. If we hit the budget, Graph retries; sync is idempotent on `(clientId, sourceRef)` so retry is safe. Re-evaluate if we ever ingest 1+ hour transcripts at scale. |
| **Delegated permissions, organizer-only** | `OnlineMeetingTranscript.Read.All` (delegated) only returns transcripts where the user is organizer or co-organizer. Participant-only access requires app-only + Resource-Specific Consent — out of MVP. The portal UI surfaces this caveat prominently before consent. |
| **Subscription lifetime: 50min ask, 60min cap, 25min renewal cron** | Microsoft caps this resource at 60 minutes. Asking for 50 leaves headroom; running the cron every 25 means we always have at least one renewal window even if a single tick is skipped. |
| **`includeResourceData: false` on subscriptions** | Without resource-data, notifications carry only IDs and we fetch content separately. With resource-data, payloads embed encrypted content and we'd need to manage a public-key-pinned encryption certificate. Skip until there's a reason. |

## End-to-end flow

```
[portal user]
   ↓ clicks "Connect Microsoft Teams"
GET /api/portal/integrations/microsoft/connect
   ↓ HMAC-signs state, redirects to login.microsoftonline.com/common/oauth2/v2.0/authorize

[user consents on Microsoft]
   ↓
GET /api/portal/integrations/microsoft/callback?code=…&state=…
   ↓ verifyState() (HMAC + TTL + CSRF-bind to session)
   ↓ exchangeCode() — POST /token, decode id_token claims (oid, tid, email)
   ↓ best-effort: createTranscriptsSubscription() — POST /subscriptions
   ↓ upsert microsoft_teams_user_connections
   ↓ redirect to /portal/settings/integrations?microsoft_connected=1

[user organizes a Teams meeting with transcription enabled]
   ↓ meeting ends, Graph processes the transcript

[Graph fires change notification]
   ↓
POST /api/microsoft-webhook/transcripts
   ↓ if ?validationToken=… → echo as text/plain (10s budget)
   ↓ else for each notification:
   ↓   validate clientState
   ↓   parseTranscriptResource() → meetingId, transcriptId
   ↓   syncTranscriptForSubscription():
   ↓     fetchTeamsTranscript:
   ↓       GET /users/{oid}/onlineMeetings/{meetingId}     — metadata
   ↓       GET .../transcripts/{tid}/content?$format=text/vtt
   ↓     vttToPlainText() → "Speaker: text\n…"
   ↓     teams-transcript adapter → NormalizedMeetingInput
   ↓     createMeetingFromAdapter() → brain_meetings row + participants + audit
   ↓ 202 Accepted

[every 25 minutes]
GET /api/cron/renew-microsoft-subscriptions
   ↓ for each connection where (subscription expires <30min) OR (no subscriptionId):
   ↓   if no subscriptionId: createTranscriptsSubscription()
   ↓   else: renewTranscriptsSubscription() (PATCH expirationDateTime)
   ↓     on 404: createTranscriptsSubscription() (recreate)
   ↓ persist token-refresh side-effects
```

## Required follow-ups before this is fully live

1. **Azure AD app registration** at https://entra.microsoft.com:
   - "Supported account types" → **Accounts in any organizational directory and personal Microsoft accounts** (multi-tenant)
   - Redirect URIs (Web):
     - `http://localhost:3000/api/portal/integrations/microsoft/callback`
     - `https://staging.simplerdevelopment.com/api/portal/integrations/microsoft/callback`
     - `https://www.simplerdevelopment.com/api/portal/integrations/microsoft/callback`
   - API permissions → **Microsoft Graph (Delegated)**:
     - `OnlineMeetingTranscript.Read.All`
     - `OnlineMeetings.Read`
     - `User.Read`
     - `offline_access`
     - `openid`, `profile`, `email`
   - Client secret (Certificates & secrets → New client secret) — copy the **Value**, not the ID

2. **Env vars on staging + prod:**
   ```
   MICROSOFT_TEAMS_CLIENT_ID=<application-client-id>
   MICROSOFT_TEAMS_CLIENT_SECRET=<the-value-not-the-id>
   # MICROSOFT_TEAMS_TENANT defaults to 'common' (multi-tenant) — leave unset
   ```
   `OAUTH_STATE_SECRET` is shared with the Google flow — already set.

3. **Apply migration** by hand on staging + prod:
   ```bash
   psql $STAGING_DATABASE_URL -f simplerdevelopment2026/drizzle/0074_microsoft_teams_user_connections.sql
   psql $PROD_DATABASE_URL    -f simplerdevelopment2026/drizzle/0074_microsoft_teams_user_connections.sql
   ```

4. **Merge PR #12 → `staging`.** Verify the cron starts ticking and that connecting from a real M365 account creates a row with a populated subscription.

5. **Local dev caveat:** because Graph can't reach `localhost`, the connect-time subscription create will fail silently. The OAuth flow still works; you'll get a connected row without a subscription. Either:
   - Use a tunnel (`cloudflared`, `ngrok`) and set `NEXTAUTH_URL` to the tunnel URL
   - Or rely on the production-deployed renewal cron to create the subscription later

## Smoke-test path

```bash
# 1. After Azure setup + env + migration, visit (logged in to portal):
open https://staging.simplerdevelopment.com/portal/settings/integrations

# 2. Click "Connect Microsoft Teams" → consent → confirm landing back at the page
# 3. Confirm the row landed:
psql $STAGING_DATABASE_URL_READONLY -c "
  SELECT id, microsoft_account_email, microsoft_tenant_id,
         subscription_id IS NOT NULL AS has_subscription,
         subscription_expiration, last_sync_at
  FROM microsoft_teams_user_connections
  ORDER BY created_at DESC LIMIT 5
"

# 4. Schedule a Teams meeting WHERE YOU ARE THE ORGANIZER, enable transcription,
#    let it run for ~30 seconds, end it. Check the brain_meetings table:
psql $STAGING_DATABASE_URL_READONLY -c "
  SELECT id, source, source_ref, title, byte_length(transcript) AS bytes, meeting_date
  FROM brain_meetings
  WHERE source = 'teams_transcript'
  ORDER BY created_at DESC LIMIT 5
"

# 5. Verify the renewal cron is firing — check Vercel cron logs or:
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://staging.simplerdevelopment.com/api/cron/renew-microsoft-subscriptions
# expect: { success: true, data: { durationMs, considered, results: [...] } }
```

## Not implemented (deferred)

- **App-only auth + Resource-Specific Consent** — would let participants (not just organizers) get their meetings synced. Requires Azure admin consent at the tenant level + RSC integration. Phase 2.
- **Per-tenant BYO-app credentials** — matching Google's enterprise tier (`googleWorkspaceTenantCredentials`). Each enterprise client owns their own Azure AD app. Phase 3.
- **Delta-sync fallback** — when notifications get dropped (`missed` lifecycle event), we currently just log. Phase 2.
- **Recordings + chat messages** — only transcripts in MVP. Phase 2 if there's demand.
- **Graph SDK adoption** — switch from raw `fetch` to `@microsoft/microsoft-graph-client` if/when we add streaming or paging. Not needed for the current endpoint set.

## File index

```
simplerdevelopment2026/
├── lib/
│   ├── microsoft/
│   │   ├── scopes.ts                    (PR 1)
│   │   ├── oauth-state.ts               (PR 1)
│   │   ├── oauth.ts                     (PR 1)
│   │   ├── graph-client.ts              (PR 2)
│   │   ├── transcripts-watch.ts         (PR 2)
│   │   ├── transcripts-fetch.ts         (PR 3)
│   │   └── transcripts-sync.ts          (PR 3)
│   ├── brain/meeting-sources/
│   │   ├── teams-transcript.ts          (PR 3)
│   │   └── index.ts                     (PR 3 — modified)
│   └── db/schema/
│       ├── tools.ts                     (PR 1 — modified)
│       └── brain.ts                     (PR 3 — modified)
├── app/api/
│   ├── portal/integrations/microsoft/
│   │   ├── connect/route.ts             (PR 1)
│   │   ├── callback/route.ts            (PR 1, modified PR 2)
│   │   ├── disconnect/route.ts          (PR 1, modified PR 2)
│   │   └── status/route.ts              (PR 1)
│   ├── microsoft-webhook/
│   │   ├── transcripts/route.ts         (PR 2, modified PR 3)
│   │   └── lifecycle/route.ts           (PR 2)
│   └── cron/
│       └── renew-microsoft-subscriptions/route.ts  (PR 2)
├── app/portal/settings/integrations/
│   └── page.tsx                          (PR 4 — modified)
├── drizzle/
│   └── 0074_microsoft_teams_user_connections.sql   (PR 1)
└── vercel.json                           (PR 2 — modified)
```

## Counts

- **4 logical slices** in one PR
- **17 files** touched (13 new, 4 modified)
- **Zero typecheck errors** in any new file across all 4 slices
- **0 in production yet** — gated on Azure setup + env vars + migration + PR merge
