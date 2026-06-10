---
type: domain-map
domain: email
status: active
date: 2026-06-10
sources:
  - lib/email/
  - lib/db/schema/email.ts
  - workers/email-inbound/
  - lib/email/website-email-events.ts
  - lib/publishing/channels/email.ts
  - lib/ai/portal-tools/email.ts
  - app/api/admin/email/
  - app/api/portal/cms/websites/[siteId]/email-templates/
  - app/api/cron/resend-usage-sync/route.ts
  - app/api/portal/publishing/channels/email/route.ts
---

# Domain: Email & Campaigns

## Purpose

Covers two distinct concerns that share the same schema and send infrastructure:

1. **Campaign email** — per-tenant marketing lists, subscriber management, HTML/block-built campaigns, A/B subject-line testing, scheduling, send execution, and engagement tracking (open/click/bounce/unsubscribe).
2. **Transactional email** — event-driven sends (order confirmation, booking reminders, invite, MCP approval notifications) fired from other domains, and per-website template customisation.

Outbound delivery is exclusively via Resend. Inbound email is handled by a Cloudflare Email Worker that parses MIME and forwards to a Next.js API route.

## Key entry points

| File | Role |
|---|---|
| `lib/email/index.ts` | Barrel: lazy Resend client proxy, `buildCampaignHtml`, `buildUnsubscribeUrl`, `generateUnsubscribeToken` |
| `lib/email/campaign-send.ts` | `executeCampaignSend` — resume-safe dispatch loop with A/B split |
| `lib/email/send-transactional.ts` | `sendTransactionalEmail(event, to, vars)` — loads website template, merges variables, falls back to default |
| `lib/email/booking-emails.ts` | Booking-specific helpers: `sendGuestConfirmation`, `sendHostNotification`, `sendCancellationEmail`, `sendBookingReminder`, `loadBookingBrand` |
| `lib/email/invite-email.ts` | Team invite mailer |
| `lib/email/mcp-approval-email.ts` | MCP pending-change approval notification |
| `lib/email/render-blocks-to-email.ts` | Block tree → inline-CSS email HTML |
| `lib/email/render-cache.ts` / `render-cache-core.ts` | sha256-keyed render cache backed by `email_renders` table |
| `lib/email/build-campaign-html.ts` | Wraps inner HTML in campaign document skeleton with `{{UNSUBSCRIBE_URL}}` |
| `lib/email/apply-branding-to-blocks.ts` | Injects branding profile colours/fonts into block content before render |
| `lib/email/subject-ab.ts` | A/B test split helpers: `splitForAbTest`, `aggregateAbVariantCounts` |
| `lib/email/website-email-events.ts` | Event definitions (store, booking, account categories) and variable schemas |
| `lib/email/default-email-templates.ts` | Fallback HTML templates when no website template is configured |
| `lib/email/email-block-types.ts` | `EMAIL_BLOCK_TYPES` constant — block types valid inside an email |
| `workers/email-inbound/src/index.ts` | Cloudflare Email Worker: postal-mime parse, R2 attachment upload, POST to API |
| `app/api/email/inbound/route.ts` | Receives worker POST; resolves client by email prefix; runs Claude agentic loop; dispatches reply via Resend. Brain path: `brain+<token>@simplerdevelopment.com` ingests into `brain_meetings`. |
| `app/api/email/webhooks/route.ts` | Resend webhook: updates `email_campaign_sends` opened/clicked/bounced; hard-bounce flips subscriber status |
| `app/api/email/unsubscribe/route.ts` | Public unsubscribe link handler (token-based) |
| `lib/mcp/tools/email.ts` | All MCP email tools registration |
| `app/api/cron/resend-usage-sync/route.ts` | Cron: rolls up per-client email send counts into `usage_meter_events` for billing (stub mode; TODO: wire real Resend usage API) |
| `lib/ai/portal-tools/email.ts` | Claude AI tool definitions for the inbound email agentic loop (`get_my_email_campaigns`, `get_my_email_lists`, `create_email_campaign`, `update_email_campaign`, `add_email_subscriber`, etc.) — distinct from MCP tools |
| `lib/publishing/channels/email.ts` | Publishing adapter — link campaigns to Publishing Command Center kanban cards (`linkEmailCampaignToCard`, `unlinkEmailCampaignFromCard`, `syncCardStageToCampaign`) |

## Data model

### `email_lists`
Subscriber lists scoped to `clientId` (null = global/agency-level). Referenced by campaigns; delete is blocked if a campaign points to it.

### `email_subscribers`
Per-list rows. Status enum: `active | unsubscribed | bounced | complained`. Unique `(listId, email)`. Carries a 64-char `unsubscribeToken` for public opt-out URL. Soft-remove default; hard-delete available via MCP tool.

### `email_campaigns`
Campaign header + content. Status lifecycle: `draft → scheduled → sending → sent | cancelled` (plus `ab_testing` while an A/B split is running). Key fields:
- `htmlContent` — final rendered HTML (always present).
- `blockContent` / `contentBlocks` / `useBlockEditor` — dual-path: legacy `BlockEditorData` JSON vs the newer `Block[]` tree. When `useBlockEditor=true`, HTML is rendered from `contentBlocks` at send time.
- `abEnabled`, `abSubjectB`, `abTestSizePct`, `abWinnerMetric`, `abWinnerSubject`, `abDecidedAt` — standalone A/B engine (independent of `lib/ab/`).
- `parentCampaignId` — fork pointer set by `email_campaigns_fork` MCP tool.

### `email_templates`
Reusable templates. `isGlobal=true` = admin-created, visible to all tenants. `category`: `welcome | newsletter | promotion | transactional | custom`. Tracks `usageCount`.

### `email_campaign_sends`
Per-recipient send record. Unique `(campaignId, subscriberId)` — ensures idempotent re-runs. Stores `resendEmailId` for webhook correlation. `abVariant`: `a | b | winner | null`.

### `email_segments`
Rule-based subscriber filters. Rules: `[{ field, operator, value }]` with `matchType=all|any`. `subscriberCount` is a cached aggregate.

### `email_subscriber_tags` / `email_subscriber_tag_assignments`
Free-form tags on subscribers (colour-coded). Assignment junction table.

### `email_renders`
Render cache: sha256 of `contentBlocks` JSON → rendered HTML + subject. Keyed by `(campaignId, blocksHash)`. Scoped via campaign's `clientId`.

### `website_email_templates`
Per-website overrides for transactional events (e.g. `order.confirmed`, `booking.confirmed`). Keyed by `(websiteId, event)`. Supports block content + variable merging + `brandingProfileId`.

## API surface

### Portal REST (tenant-scoped, auth required)

| Route | Methods | Notes |
|---|---|---|
| `app/api/portal/email/campaigns/route.ts` | GET, POST | List / create campaigns |
| `app/api/portal/email/campaigns/[id]/route.ts` | GET, PATCH, DELETE | Campaign detail / edit / delete |
| `app/api/portal/email/campaigns/[id]/send/route.ts` | POST | Trigger send |
| `app/api/portal/email/campaigns/[id]/promote-winner/route.ts` | POST | Promote A/B winner, send remainder |
| `app/api/portal/email/lists/route.ts` | GET, POST | Lists CRUD |
| `app/api/portal/email/lists/[id]/route.ts` | GET, PATCH, DELETE | List detail |
| `app/api/portal/email/subscribers/route.ts` | GET, POST | Subscribers |
| `app/api/portal/email/segments/route.ts` | GET, POST | Segments |
| `app/api/portal/email/segments/[id]/route.ts` | PATCH, DELETE | Segment detail |
| `app/api/portal/email/templates/route.ts` | GET, POST | Templates |
| `app/api/portal/email/templates/[id]/route.ts` | PATCH, DELETE | Template detail |
| `app/api/portal/email/tags/route.ts` | GET, POST | Subscriber tags |
| `app/api/portal/email/tags/[id]/route.ts` | PATCH, DELETE | Tag detail |
| `app/api/portal/email/preview/route.ts` | POST | Render preview (HTML) |
| `app/api/portal/email/render-preview/route.ts` | POST | Block-based render preview with cache |
| `app/api/portal/email/analytics/route.ts` | GET | Aggregate open/click/bounce stats |

### Website email template overrides (Portal, site-scoped)

| Route | Methods | Notes |
|---|---|---|
| `app/api/portal/cms/websites/[siteId]/email-templates/route.ts` | GET, POST | List / create per-site transactional template overrides |
| `app/api/portal/cms/websites/[siteId]/email-templates/[templateId]/route.ts` | GET, PATCH, DELETE | Template detail / update / delete |
| `app/api/portal/cms/websites/[siteId]/email-templates/seed-defaults/route.ts` | POST | Seed the default set of transactional templates for a site |

### Admin REST (global, super-admin scoped)

| Route | Methods | Notes |
|---|---|---|
| `app/api/admin/email/campaigns/route.ts` | GET, POST | List / create campaigns across all tenants |
| `app/api/admin/email/campaigns/[id]/route.ts` | GET, PATCH, DELETE | Campaign detail / edit / delete |
| `app/api/admin/email/campaigns/[id]/send/route.ts` | POST | Trigger send (admin-initiated) |
| `app/api/admin/email/domains/route.ts` | GET, POST | List / add sending domains |
| `app/api/admin/email/domains/[id]/route.ts` | GET, PATCH, DELETE | Domain detail / edit / delete |
| `app/api/admin/email/domains/[id]/verify/route.ts` | POST | Trigger DNS verification for a sending domain |
| `app/api/admin/email/lists/route.ts` | GET, POST | List / create subscriber lists |
| `app/api/admin/email/lists/[id]/route.ts` | GET, PATCH, DELETE | List detail / edit / delete |
| `app/api/admin/email/subscribers/route.ts` | POST, PUT, DELETE | Bulk subscriber create / update / remove |

### Publishing channel

| Route | Methods | Notes |
|---|---|---|
| `app/api/portal/publishing/channels/email/route.ts` | GET, POST, DELETE | Link / unlink campaigns to Publishing Command Center kanban cards |

### Public / webhook

| Route | Method | Notes |
|---|---|---|
| `app/api/email/inbound/route.ts` | POST | CF Worker destination; shared-secret auth |
| `app/api/email/webhooks/route.ts` | POST | Resend event webhook |
| `app/api/email/unsubscribe/route.ts` | GET | Token-based public unsubscribe |

## MCP tools

Registered in `lib/mcp/tools/email.ts` via `registerEmailTools`. All gated on `requireService(clientId, 'email')` — client must have the email service enabled.

| Tool | Scope |
|---|---|
| `email_lists` | `email:read` |
| `email_lists_create` | `email:write` |
| `email_lists_update` | `email:write` |
| `email_lists_delete` | `email:write` |
| `email_subscribers_list` | `email:read` |
| `email_subscribers_add` | `email:write` |
| `email_subscribers_update` | `email:write` |
| `email_subscribers_remove` | `email:write` |
| `email_campaigns_list` | `email:read` |
| `email_campaigns_create` | `email:write` |
| `email_campaigns_update` | `email:write` |
| `email_campaigns_schedule` | `email:write` |
| `email_campaigns_send` | `email:send` (separate scope) |
| `email_campaigns_fork` | `email:write` |
| `email_campaigns_delete` | `email:write` |
| `email_templates_list` | `email:read` |
| `email_templates_create` | `email:write` |
| `email_segments_list` | `email:read` |
| `email_segments_create` | `email:write` |

Write/send tools route through `stageOrApply` — campaigns needing approval produce a pending change and return an approval URL rather than mutating immediately.

## UI surfaces

| Path | Purpose |
|---|---|
| `app/portal/email/page.tsx` | Email section dashboard |
| `app/portal/email/campaigns/page.tsx` | Campaign list |
| `app/portal/email/campaigns/new/page.tsx` | Campaign builder (new) |
| `app/portal/email/campaigns/[id]/page.tsx` | Campaign detail / edit (with A/B config, collaboration presence) |
| `app/portal/email/lists/page.tsx` | Subscriber lists |
| `app/portal/email/templates/page.tsx` | Reusable templates |
| `app/portal/email/segments/page.tsx` | Audience segments |
| `app/portal/email/analytics/page.tsx` | Engagement analytics |
| `app/portal/email/automations/page.tsx` | Email automations (linked to workflows) |
| `app/portal/email/settings/page.tsx` | Domain/from-address settings |
| `app/portal/email/editor-preview/page.tsx` | Block-editor email preview pane |
| `app/admin/email/page.tsx` | Admin email overview |
| `app/admin/email/campaigns/page.tsx` | Admin campaign list |
| `app/admin/email/campaigns/new/page.tsx` | Admin campaign creation |
| `app/admin/email/campaigns/[id]/page.tsx` | Admin campaign detail / edit |
| `app/admin/email/lists/page.tsx` | Admin subscriber list management |
| `app/admin/email/domains/page.tsx` | Admin sending-domain management |

## Tests and gates

| Layer | Key files |
|---|---|
| Unit | `tests/unit/email-campaign-send.test.ts`, `email-render-blocks.test.ts`, `email-render-cache.test.ts`, `email-send-transactional.test.ts`, `email-booking-emails.test.ts`, `email-default-templates.test.ts`, `email-apply-branding-to-blocks.test.ts`, `email-website-email-events.test.ts`, `email-mcp-approval-email.test.ts`, `components-email-ab-config.test.tsx`, `mcp-tools-email.test.ts`, `api-email-inbound-route.test.ts` |
| Integration | `tests/integration/api/email/campaigns.test.ts`, `tests/integration/api/email/campaign-send.test.ts`, `tests/integration/api/portal/email/campaign-send-blocks.test.ts`, `tests/integration/api/email-unsubscribe.test.ts` |
| E2E | `tests/e2e/portal-email.spec.ts`, `portal-email-mutations.spec.ts`, `portal-email-extras.spec.ts`, `portal-email-segments.spec.ts`, `email-block-builder.spec.ts`, `email-block-editor.spec.ts`, `email-events.spec.ts` |

Run the critical E2E gate before declaring email work done: `bun test:critical`.

## Cross-domain dependencies

| Domain | Touch point |
|---|---|
| **CRM** | `api-crm-send-email-and-email-preview-routes.test.ts` suggests a CRM "send email" action; `lib/mcp/tools/crm.ts` imports from `@/lib/email` |
| **Automations / Workflows** | `lib/mcp/tools/automations.ts` imports `@/lib/email`; `lib/automation/survey-notifications.ts` uses `resend` directly; `app/portal/email/automations/page.tsx` links the two domains |
| **Bookings** | `lib/email/booking-emails.ts` drives confirmation, cancellation, and reminder sends; called from `app/api/public/booking/[slug]/book/route.ts`, `app/api/public/booking/cancel/route.ts`, `app/api/cron/booking-reminders/route.ts`, and the Stripe booking webhook |
| **Store / Orders** | `lib/email/send-transactional.ts` called from order routes, Stripe ecommerce webhook, and Printful webhook for fulfilment events |
| **Surveys** | `lib/automation/survey-notifications.ts` sends follow-up emails; `route-survey-email-sequences.test.ts` and cron `cron-survey-email-followups.test.ts` |
| **Company Brain** | Inbound path `brain+<token>@simplerdevelopment.com` ingests email into `brain_meetings` via `handleBrainIngest`; `lib/brain/process-meeting.ts` can auto-process on arrival |
| **Auth / Teams** | `lib/email/invite-email.ts` called by `app/api/portal/team/route.ts` |
| **MCP approvals** | `lib/mcp/approvals.ts` uses `renderBlocksToEmailHtml`; `lib/email/mcp-approval-email.ts` sends approval notification emails |
| **Billing** | `requireService(clientId, 'email')` gates all campaign write/send MCP tools — client must have the email service provisioned. `app/api/cron/resend-usage-sync/route.ts` rolls up per-client send counts from `email_campaign_sends` into `usage_meter_events` (currently in stub/local-count mode; TODO: wire real Resend billing API) |
| **Publishing / Kanban** | `lib/publishing/channels/email.ts` and `app/api/portal/publishing/channels/email/route.ts` implement the Publishing Command Center email-channel adapter, linking campaigns to kanban cards |

## Invariants and gotchas

- **Send is never re-entrant.** `executeCampaignSend` fetches already-sent subscriber IDs first and skips them. Idempotent across partial failures and retries.
- **`email:send` is a separate MCP scope from `email:write`.** Sending a campaign to a live list requires explicit scope grant beyond ordinary write access.
- **Draft / approval flow on writes.** `stageOrApply` wraps campaign create, update, send, and delete. In approval-required contexts, the mutation is stored as a pending change and a review URL is returned. The caller must click the approval link — the campaign is not mutated until then.
- **A/B testing is standalone.** It does NOT use `lib/ab/`. Status `ab_testing` is a transient state between sending the test split and promoting a winner. `promote-winner` endpoint at `app/api/portal/email/campaigns/[id]/promote-winner/route.ts` finalises and dispatches the remainder.
- **Resend webhook must be configured** for opens/clicks/bounces to land. Signature verification is present but check that `RESEND_WEBHOOK_SECRET` is set in production.
- **Hard bounces suppress the subscriber.** The webhook flips `email_subscribers.status` to `bounced` on hard bounces. Soft bounces are only logged (a `soft_bounce_count` improvement is noted as a TODO in the webhook route).
- **Block editor dual path.** Older campaigns store `blockContent` (BlockEditorData); newer campaigns use `contentBlocks` (Block[]) with `useBlockEditor=true`. Both coexist in the schema.
- **Inbound email body is capped at 1 MB.** The CF worker truncates at `MAX_BODY_BYTES` and archives the full `.eml` to R2. Truncation is flagged in the forwarded payload.
- **`emailLists` with `clientId=null`** are global/agency-level lists. Queries that expect tenant-scoped lists must filter explicitly.

## Planning notes

- Soft-bounce suppression after N retries is an open TODO (noted in `app/api/email/webhooks/route.ts`).
- `websiteEmailTemplates` supports per-event template customisation per site but the block editor path (`blockContent`) is not fully wired through `sendTransactionalEmail` for all events.
- The `emailSegments` `subscriberCount` is a cached value; no cron or trigger currently keeps it in sync after subscriber mutations.
- Scheduled campaigns (`status=scheduled`, `scheduledAt` set) have no automated dispatcher — a cron or UI-triggered send is still required.

## Related

[[CRM]]
[[Automations & Workflows]]
[[Company Brain]]
[[Bookings]]
[[Store & Ecommerce]]
