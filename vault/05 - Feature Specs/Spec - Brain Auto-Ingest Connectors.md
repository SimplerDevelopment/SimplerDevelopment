---
type: spec
domain: brain
status: proposed
date: 2026-06-22
sources:
  - lib/brain/ingest-gmail-message.ts
  - lib/brain/embeddings.ts
  - lib/brain/embedding-queue.ts
  - lib/db/schema/tools.ts
  - app/api/cron/drive-sync/route.ts
  - app/api/cron/renew-gmail-watches/route.ts
  - app/api/cron/process-embeddings/route.ts
---

# Feature: Brain Auto-Ingest Connectors + ACL

## Overview

Extend the Brain ingestion pipeline to pull content from Slack, Confluence, and SharePoint incrementally, and add a source-aware ACL layer so retrieved embeddings respect the permission model of the originating system.

## Domain context

Read first: [[Company Brain AI E2E Audit]]. The Brain already ingests Gmail messages (`ingestGmailMessageIntoBrain` — refactored this session into a shared helper) into `brain_meetings`, chunks + embeds via `embedEntity` (OpenAI text-embedding-3-small, pgvector), and drains the queue via cron (`process-embeddings`). OAuth token storage follows per-user (`google_workspace_user_connections`) + per-client (`google_workspace_client_connections`) patterns; `microsoft_teams_user_connections` is a connector-table precedent. `searchSemantic` today filters only by `clientId` + `entityType` — **no permission fence at retrieval time**. `confidentialityLevel` columns exist on brain tables but are not enforced at search.

## Problem

1. Content in Slack/Confluence/SharePoint is invisible to the Brain.
2. Retrieval has no ACL — any portal user for a tenant can surface content their external identity cannot access in the source system.

## Goal

- Pull Slack channel messages, Confluence pages, SharePoint document-library pages into `brain_notes` (pages/docs) + `brain_meetings` (Slack threads), incrementally, with source attribution.
- At retrieval, filter `brain_embeddings` to chunks the requesting user may see, from mirrored group memberships + stored source ACL.

## Design

### Connector OAuth tables (`lib/db/schema/tools.ts`, modeled on `microsoft_teams_user_connections`)

`slack_user_connections`, `confluence_user_connections`, `sharepoint_user_connections` — each: id, clientId, userId, provider ids (team/cloud/site+drive), accessToken/refreshToken/expiresAt, scopes jsonb, deltaToken text, lastSyncAt, revokedAt. All require external OAuth app credentials (Slack App, Atlassian OAuth2, Azure AD) stored via `lib/crypto/secrets`.

### Shared ingestion helper — `lib/brain/ingest-connector-document.ts`

`ingestConnectorDocument({clientId, connectorType, entityTarget:'note'|'meeting', title, content, sourceRef, sourceUrl?, sourceMetadata?, sourceAcl?, storeBodies?})` → writes `brain_notes`/`brain_meetings` with `source=connectorType`, dedupes on `UNIQUE(clientId, sourceRef)` (upsert), enqueues embedding via `after()`.

### ACL

- New column on `brain_notes` + `brain_meetings`: `source_acl jsonb` ({ allowedUserIds?, allowedGroupIds?, sourcePermissions? }).
- New table `brain_connector_group_memberships` (clientId, userId, connectorType, externalGroupId, syncedAt; PK on all four).
- Updated `searchSemantic({clientId, query, k?, entityTypes?, userId?})` — when `userId` is given, the SQL adds a WHERE passing rows where `source_acl` is NULL (legacy/native), the user is in `allowedUserIds`, or the user is in a group in `allowedGroupIds` via the memberships table. No-`userId` callers unaffected.

### Incremental sync crons (follow the `drive-sync` pattern: `withCronHealth`, `FOR UPDATE SKIP LOCKED`, fetch delta, ingest, advance cursor)

`app/api/cron/slack-sync` (deltaToken per channel), `confluence-sync` (cql lastModified watermark), `sharepoint-sync` (deltaLink per drive).

## Phasing

- **Phase 1 (needs Slack App creds)** — `slack_user_connections` + `ingestConnectorDocument` + `source_acl` column (nullable, non-breaking) + `brain_connector_group_memberships` + `slack-sync` cron + `searchSemantic` userId filter.
- **Phase 2 (Atlassian OAuth)** — confluence connection + `confluence-sync`.
- **Phase 3 (Azure AD)** — sharepoint connection + `sharepoint-sync`.

## Key decisions (ADR-style)

- **One shared `ingestConnectorDocument`** (not per-connector ingestors) — connector-specific fetch stays in the cron; dedup/enqueue is shared.
- **`source_acl` jsonb + group-membership table** (not a per-entity ACL join) — ACL is co-located with the entity; the membership table handles many-users-to-group expansion.
- **ACL filter in the `searchSemantic` WHERE** (not post-retrieval) — pgvector returns approximate-k; post-filtering silently returns < k. Prune before LIMIT.
- **Group membership synced inside each content cron** — low-volume, same token; avoid a separate cron at this scale.

## Open questions

1. Slack public-only (bot scopes) vs member-restricted channels — affects ACL population + scopes.
2. Confluence space-level group ACLs need admin scopes — accept coarser space-level mirroring, or require admin OAuth?
3. SharePoint sensitivity labels → map to `confidentialityLevel` or leave in `sourceMetadata`?
4. Re-embedding on ACL change vs upsert-acl-on-sync — is the upsert pass sufficient, or a dedicated ACL-refresh sweep?

## Verification plan

- Unit: `ingestConnectorDocument` dedup (second call same `sourceRef` ⇒ created:false); `searchSemantic` userId path adds ACL predicate, no-userId path unchanged.
- Integration: note with `source_acl={allowedUserIds:['u1']}` ⇒ u2 gets 0, u1 gets 1; add a group membership for u2 ⇒ u2 now matches.
- `bun test:tenancy` — cross-client isolation holds after ACL columns.
- `bun test:critical` — Brain search golden paths unchanged when `userId` absent.
- Manual: Slack cron happy path (provider OAuth requires a real Slack App — env-guarded/stubbed in CI).
