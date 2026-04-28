---
project: SimplerDevelopment 2026
milestone: google-workspace-integration
milestone_status: planning
created: 2026-04-28
parallel_namespace: true
parent_milestone_state: .planning/STATE.md (survey-system-enhancement, mid-flight)
---

# Milestone: Google Workspace Integration

## Why this exists as a parallel namespace

The repo's primary `.planning/` namespace tracks the **Survey System Enhancement** milestone (v1.0), currently mid-flight at Phase 2. This Google Workspace work is unrelated and shouldn't be folded into that milestone, but GSD doesn't natively support concurrent milestones. Files live under `.planning/milestones/google-workspace/` to avoid colliding with survey state. When survey milestone completes, this can be promoted to the primary namespace.

Operationally: `/gsd-plan-phase` and `/gsd-execute-phase` won't auto-target this namespace. Phase plans are authored manually following the same conventions, and execution either runs by hand or via a future namespace-aware variant.

## Core value

Portal users (small agencies running on Google Workspace and their clients running on Google Workspace) can authorize their Google account once and have **Gmail, Calendar, Drive, Contacts, and Meet recordings flow into the SimplerDevelopment portal** — populating CRM activity logs, Brain meeting notes, deal-room document attachments, and the AI-driven review queue, with privacy controls per connection.

## Constraints driving the design

- **Workspace-only.** OAuth consent screen configured as "Internal" within a Workspace-resident GCP project. Sidesteps the CASA tier-2/3 security audit ($3–15k, multi-month) that gating Gmail to non-Workspace users would require.
- **Dual connection model.** Per-client connections (shared org resources — agency-wide Drive folders, calendar booking) **and** per-user connections (a rep's personal inbox/calendar). Both authorize within the same Workspace, scopes overlap but data ownership doesn't.
- **Multi-tenant isolation.** All ingested data is `clientId`-scoped following existing portal conventions (`getPortalClient`, `crmContacts.clientId`, `brainMeetings.clientId`).
- **Aggressiveness toggle.** Each connection has a `syncSettings.aggressiveness` level (off/passive/moderate/aggressive) that controls auto-CRM-contact creation, AI confidence thresholds, and what gets promoted into Brain review queues.
- **Privacy at the connection level.** A rep's personal Gmail at "passive" only logs activities for already-known CRM contacts; the agency-wide connection at "aggressive" captures the long tail.
- **Push-first with polling fallback.** Drive and Calendar push directly to webhooks; Gmail requires Pub/Sub. Daily cron renews any watch expiring within 24h.
- **Existing patterns reused.** OAuth refresh logic mirrors `lib/google-calendar.ts`. Cloudflare Worker for webhook reception mirrors `workers/email-inbound`. AI review queue mirrors `brainAiReviewItems`.

## Key Decisions

| Decision | Rationale | Date |
|---|---|---|
| Workspace-only (Internal consent) | Skip CASA audit; small-agency users all on Workspace | 2026-04-28 |
| Dual connection (client + user) | Mirrors HubSpot/Salesforce; supports shared deal-room folders AND personal inbox sync | 2026-04-28 |
| Two new tables, not extending existing `googleCalendarTokens` | Refresh-token economics — Google issues one refresh token per (app, user, prompt=consent); separate flows would invalidate each other | 2026-04-28 |
| Aggressiveness on connection.syncSettings, not brainProfiles | Different connections in the same client legitimately want different levels (shared = aggressive, personal = passive) | 2026-04-28 |
| Drive folder watches in MVP | Most "magical" feature; pulls webhook worker into v1 | 2026-04-28 |
| Pub/Sub required for Gmail watch | No workaround; phase 0 sets up GCP project + topic | 2026-04-28 |
| `crmActivities.viaUserId` for provenance | Multiple reps may surface the same email; need to track whose token did | 2026-04-28 |
| Soft-revoke connections on `clientMembers` removal | Offboarding hygiene; don't hard-delete activities (data was real) | 2026-04-28 |

## Out of scope (deferred)

- Two-way Contacts sync (writing back to Google Contacts)
- Google Docs live-editing inside the portal
- Google Marketplace listing (skipping per-user OAuth screens via admin install)
- Non-Workspace Gmail users (would require CASA audit)
- Slack/Microsoft 365 equivalents
- Per-surface aggressiveness (Gmail aggressive / Drive moderate) — v1 ships one global level per connection
