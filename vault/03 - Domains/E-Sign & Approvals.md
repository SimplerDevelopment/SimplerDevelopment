---
type: domain-map
domain: esign-approvals
status: active
date: 2026-06-16
sources:
  - lib/esign/
  - lib/db/schema/approvals.ts
  - lib/db/schema/crm.ts
  - app/api/portal/crm/contracts/[id]/send/route.ts
  - app/api/admin/approvals/route.ts
  - lib/preview-token.ts
  - app/approve/[token]/page.tsx
  - app/approve/[token]/PostPreview.tsx
  - app/approve/[token]/ApprovalReviewer.tsx
---

# Domain: E-Sign & Approvals

## Purpose

Two related but distinct sub-systems that share the concept of "a human must review/authorize before something goes live":

1. **MCP Approval Queue** — AI-authored changes (from MCP-keyed clients) are staged as pending changes or minted as tokenized approval links. A non-authenticated reviewer clicks a URL to approve or reject the draft, which then fires a publish side-effect.
2. **Contract E-Signature** — CRM contracts are sent to a client for embedded electronic signing via DropboxSign (formerly HelloSign). Status transitions are driven by provider webhooks and a pure state machine.

---

## Key entry points

| Path | Role |
|---|---|
| `app/api/approve/[token]/route.ts` | Public token API (GET status / POST approve\|reject); no auth required |
| `app/approve/[token]/page.tsx` (310) | Public reviewer UI page (renders `ApprovalReviewer`); mints page-scoped preview token for post entities |
| `app/approve/[token]/PostPreview.tsx` (92) | NEW — faithful WYSIWYG preview component: live-site iframe (desktop/mobile toggle) with `BlockRenderer` fallback when no domain is resolvable |
| `app/approve/[token]/ApprovalReviewer.tsx` (647) | React component for the external reviewer flow; uses `PostPreview` for post entities |
| `lib/preview-token.ts` (61) | `generatePreviewToken(siteId, scope?)` / `verifyPreviewToken(siteId, token, scope?)` — optional page-scoped HMAC narrowing; see [[ADR approval-preview-page-scoped-token]] |
| `app/portal/approvals/page.tsx` | Portal staff approvals queue dashboard |
| `app/admin/approvals/page.tsx` | Admin global approvals queue |
| `app/api/portal/approvals/route.ts` | Portal CRUD for `mcp_pending_changes` (list/filter) |
| `app/api/portal/approvals/[id]/approve/route.ts` | Staff approve a specific pending change |
| `app/api/portal/approvals/[id]/reject/route.ts` | Staff reject a specific pending change |
| `app/api/portal/approvals/bulk-approve/route.ts` | Bulk approve portal pending changes |
| `app/api/portal/approvals/bulk-reject/route.ts` | Bulk reject portal pending changes |
| `app/api/admin/approvals/route.ts` | Admin aggregated approvals inbox (read-only list across MCP CMS changes, Brain AI review items, service requests, suggested-project requests) |
| `app/api/admin/approvals/[source]/[id]/approve/route.ts` | Admin approve (cross-tenant) |
| `app/api/admin/approvals/[source]/[id]/reject/route.ts` | Admin reject (cross-tenant) |
| `app/api/portal/crm/contracts/[id]/send/route.ts` | Native email-based send (no DropboxSign): emails each signer their unique `/contract/<token>` link via Resend, sets status=`sent`, records `documentHash` |
| `app/api/portal/crm/contracts/[id]/send-for-signature/route.ts` | Send contract to DropboxSign |
| `app/api/portal/crm/contracts/[id]/sign-url/route.ts` | Mint embedded sign URL (5-min TTL) |
| `app/api/portal/crm/contracts/[id]/signing-events/route.ts` | List signing events on a contract |
| `app/api/portal/crm/contracts/[id]/cancel-signature/route.ts` | Cancel a pending signature request |
| `app/api/webhooks/dropbox-sign/route.ts` | DropboxSign inbound webhook (status updates) |
| `app/contract/[token]/page.tsx` | Public contract viewer (signer-facing HTML view) |
| `app/api/contracts/[token]/route.ts` | Public contract token API |

---

## Data model

### `mcp_pending_changes` (`lib/db/schema/approvals.ts`)

Stages an MCP-issued mutation before it touches live data. Created by MCP write tools when the API key has `require_cms_approval=true`.

| Column | Notes |
|---|---|
| `clientId` | Tenancy key (always scoped) |
| `entityType` | e.g. `post`, `pitch_deck`, `email_campaign` |
| `operation` | `create` \| `update` \| `delete` |
| `payload` | The proposed mutation (JSON) |
| `originalSnapshot` | Pre-change state for diff display |
| `status` | `pending` \| `approved` \| `rejected` \| `applied` |
| `reviewerId` / `reviewedAt` | Set by staff approver |
| Indexes | `(clientId, status, createdAt)` + `(status)` |

### `mcp_approval_links` (`lib/db/schema/approvals.ts`)

Shareable tokenized links minted by MCP tools. Two shapes:

- `linkType = 'entity'` — direct pointer to a draft entity; approve publishes it.
- `linkType = 'pending_change'` — wraps an `mcp_pending_changes` row; approve applies the staged mutation.

Token is 64 hex chars (`crypto.randomBytes(32)`). Tenancy is locked at mint time via `clientId` — a leaked token cannot reach other tenants.

### `crm_contracts` (in `lib/db/schema/crm.ts`)

E-sign state lives inline on the contract row:

| Column | Notes |
|---|---|
| `clientToken` | 64-char public viewer token — the only credential behind `/contract/[token]` |
| `documentHash` | SHA-256 of `clauses`/`lineItems`/`fees` at send time (tamper detection) |
| `esignProvider` | `'dropboxsign'` \| null |
| `esignProviderRequestId` | DropboxSign `signature_request_id` |
| `esignSignerEmail` / `esignSignerName` | Single-signer fields for the DropboxSign path (distinct from multi-signer `crm_contract_signers` rows) |
| `esignStatus` | `not_sent` \| `sent` \| `viewed` \| `signed` \| `declined` \| `canceled` |
| `esignSentAt` / `esignSignedAt` / `esignDeclinedAt` | Timestamps |
| `esignAuditFileUrl` | Signed PDF / audit trail link |
| `esignWebhookEvents` | JSON array of raw webhook payloads |

### `crm_contract_signers` (`lib/db/schema/crm.ts`)

One row per signer per contract. Used by the native send path (`send/route.ts`) to fan out per-signer email links.

| Column | Notes |
|---|---|
| `contractId` | FK → `crm_contracts.id` (cascade delete) |
| `name` / `email` | Signer identity |
| `role` | `signer` \| `witness` \| `approver` |
| `order` | Signing order (0 = any order) |
| `token` | 64-char unique per-signer signing link (credential for `/contract/<token>`) |
| `status` | `pending` \| `viewed` \| `signed` \| `declined` |
| `signatureData` | Base64 PNG of captured signature |
| `signedAt` / `viewedAt` / `declinedAt` | Timestamps |

### `crm_contract_templates` (`lib/db/schema/crm.ts`)

Reusable clause/line-item/fee templates scoped by `clientId`. Columns: `clientId`, `name`, `description`, `clauses`, `lineItems`, `fees`, `accentColor`, `footerText`. No dedicated API routes exist yet (`app/api/portal/crm/contract-templates/` is absent).

---

## API surface

### Shared approval-token flow (`app/api/approve/[token]/route.ts`)

The single public endpoint handles all approvable entity types. No portal session required — the 64-char token is the only credential.

**Entity types gated by this endpoint:**

| `entityType` | Approve side-effect |
|---|---|
| `post` | `published = true`, `publishedAt = now` |
| `pitch_deck` | `status = 'published'` + all draft slides promoted to live |
| `email_campaign` | No status change; send is a separate deliberate author action |
| `survey` | `status = 'active'` (accepts public responses) |
| `booking_page` | `active = true` (accepts reservations at `/book/<slug>`) |
| `block_template` | Draft overlay promoted to live row (or row deleted if `pendingDelete`) |
| `pending_change` | Re-uses `applyPendingChange` from `lib/mcp/approvals.ts` |

Side-effects run first; the link stays `pending` if they throw, so the author can retry without re-minting.

### Contract e-sign flow

There are two distinct send mechanisms — they are not aliases of each other:

**Native send path** (`app/api/portal/crm/contracts/[id]/send/route.ts`): no DropboxSign involved. The route reads `crm_contract_signers` rows, computes a SHA-256 `documentHash` over `clauses`/`lineItems`/`fees`, sets the contract `status='sent'`, then emails each signer a unique `/contract/<token>` link via Resend. The signer's `token` in `crm_contract_signers` is the credential for the public contract viewer.

**DropboxSign path** (`app/api/portal/crm/contracts/[id]/send-for-signature/route.ts`):

1. POST `send-for-signature` → `lib/esign/dropbox-sign.ts:createSignatureRequest` (uploads PDF generated by `lib/esign/contract-pdf.ts`)
2. GET `sign-url` → `lib/esign/dropbox-sign.ts:getEmbeddedSignUrl` (one-time 5-min URL for iframe embed)
3. DropboxSign fires events → `app/api/webhooks/dropbox-sign/route.ts` → `lib/esign/status-machine.ts:applyWebhookEvent`

---

## MCP tools

All live in `lib/mcp/approvals.ts` and are re-exported via `lib/mcp/tools/approvals.ts`:

| Tool name | Description |
|---|---|
| `approvals_list` | List pending changes for the tenant |
| `approvals_get` | Get a single pending change with diff |
| `approvals_approve` | Apply a staged mutation as staff approver |
| `approvals_reject` | Reject a staged mutation |

Supporting helpers:
- `lib/mcp/approval-links.ts` — `lookupApprovalLink`, `createApprovalLink`, `recordReview`
- `lib/mcp/pending-changes.ts` — wraps write tools to produce staged rows when `require_cms_approval=true`
- `lib/decks/publish-slide.ts` — `applyPublishAllToSlides` (shared by deck approval and `decks_publish_all` tool)

---

## UI surfaces

| Surface | Path |
|---|---|
| Public reviewer page (external client) | `app/approve/[token]/page.tsx` |
| Portal approvals queue (tenant staff) | `app/portal/approvals/page.tsx` |
| Admin approvals queue (super-admin) | `app/admin/approvals/page.tsx` |
| CRM contract detail (with embedded signing) | `app/portal/crm/contracts/[id]/page.tsx` |
| Public contract viewer (signer-facing) | `app/contract/[token]/page.tsx` |

---

## Approval preview — WYSIWYG post rendering

When `entityType = 'post'`, the public approval page (`app/approve/[token]/page.tsx`) embeds the same live-site preview iframe the visual editor uses (`app/sites/[domain]/[[...slug]]/page.tsx` with `?_preview=true&_token=...`), so external reviewers see a faithful render of the actual page at both desktop (1280 px) and mobile (390 px) viewports.

`PostPreview.tsx` handles the iframe path. It falls back to `BlockRenderer` (inline component rendering) when the approval's site has no resolvable public domain.

### Page-scoped preview token

The public approval page is unauthenticated. Embedding a site-wide preview token in the iframe URL would allow an external reviewer to lift the token from the URL and enumerate every draft page on the site.

The fix is a page-scoped narrowing of the HMAC in `lib/preview-token.ts`:

- `generatePreviewToken(siteId)` — site-wide token (unchanged; used by the authenticated visual editor).
- `generatePreviewToken(siteId, scope)` — page-scoped token, `scope` = page path string (e.g. `"blog/hello"`). HMAC payload: `preview:<siteId>:<scope>:<day>`. A token minted with one scope cannot validate against a different page path.
- `verifyPreviewToken(siteId, token, scope?)` — if `scope` is supplied, the server accepts either the site-wide token (backward-compatible) or the narrow scoped token. If `scope` is absent, only the site-wide token validates (no regression for the editor).

`app/sites/[domain]/[[...slug]]/page.tsx` passes the resolved `pageSlug` as scope when verifying preview tokens, so the site renderer enforces the narrowing server-side.

`app/approve/[token]/page.tsx` (`buildPostPreviewIframeSrc`):
1. Cross-checks that the post's site `clientId` matches the approval link's `clientId` (tenancy guard — prevents a crafted approval link from previewing another tenant's page).
2. Mints a page-scoped token (never site-wide) for the iframe URL.

See [[ADR approval-preview-page-scoped-token]] for the full decision rationale and alternatives.

### New unit tests

`tests/unit/lib-misc-batch-37h.test.ts` — 2 new cases:
- Page-scoped token validates only for its own scope (not for a different page, not as a site-wide token).
- A site-wide token still validates when a `scope` argument is passed to `verifyPreviewToken`.

---

## Tests & gates

**Coverage floor:** `lib/esign/**/*.ts` has a 70% target (lines/statements/functions/branches) per `tests/CI-GATES.md`. Not a hard blocking gate in CI currently — but documented and enforced when coverage mode is enabled.

| Test file | Layer | Covers |
|---|---|---|
| `tests/unit/contracts-esign-status.test.ts` | unit | `lib/esign/status-machine.ts` state transitions |
| `tests/unit/dropbox-sign-fetch.test.ts` | unit | DropboxSign HTTP client |
| `tests/unit/dropbox-sign-verify.test.ts` | unit | HMAC webhook verification |
| `tests/unit/lib-esign-contract-pdf.test.ts` | unit | PDF renderer |
| `tests/unit/mcp-approvals.test.ts` | unit | MCP approval tools |
| `tests/unit/lib-mcp-approvals-coverage.test.ts` | unit | MCP approvals coverage supplement |
| `tests/unit/api-approve-token-route.test.ts` | unit | `app/api/approve/[token]/route.ts` |
| `tests/unit/app-approvals-page.test.tsx` | unit | Portal approvals page |
| `tests/unit/app-portal-crm-contract-detail-page.test.tsx` | unit | CRM contract detail |
| `tests/unit/app-contract-token-page.test.tsx` | unit | Public contract viewer |
| `tests/unit/api-webhooks-dropbox-sign-route.test.ts` | unit | Webhook handler |
| `tests/unit/email-mcp-approval-email.test.ts` | unit | Approval notification emails |
| `tests/integration/api/approve/approval-links.test.ts` | integration | Token lookup + review recording |
| `tests/integration/api/approvals/decisions.test.ts` | integration | Approve/reject decisions |
| `tests/integration/api/approvals/queue.test.ts` | integration | Pending change queue |
| `tests/integration/api/approvals/bulk.test.ts` | integration | Bulk approve/reject |
| `tests/integration/api/portal/contracts-esign/send-for-signature.test.ts` | integration | Send flow |
| `tests/integration/api/portal/contracts-esign/sign-url.test.ts` | integration | Sign URL minting |
| `tests/integration/api/portal/contracts-esign/signing-events.test.ts` | integration | Signing events |
| `tests/integration/api/webhooks/contracts-esign/webhook-handler.test.ts` | integration | Webhook processing |
| `tests/e2e/contracts-esign.spec.ts` | e2e | Contract signing golden path |
| `tests/e2e/portal-mcp-approvals.spec.ts` | e2e | MCP approval queue portal flow |
| `tests/e2e/portal-approvals-mutations.spec.ts` | e2e | Staff approval mutations |
| `tests/unit/components-approval-reviewer.test.tsx` | unit | `app/approve/[token]/ApprovalReviewer.tsx` component rendering and interaction |
| `tests/unit/lib-misc-batch-37h.test.ts` | unit | Page-scoped preview token: validates only for own scope; site-wide token backward-compatible when scope supplied |

---

## Cross-domain dependencies

- **CRM** — `crm_contracts` table owns the e-sign state; contract PDF renderer imports `ContractClause` from `lib/db/schema/crm.ts`.
- **MCP / API Keys** — `mcp_pending_changes` and `mcp_approval_links` reference `portalApiKeys`; the `require_cms_approval` flag on a key activates the staged-change path.
- **CMS & Blocks** — `post`, `block_template` are approvable entity types; approving a post publishes it to `app/sites/`.
- **Pitch Decks & Product Designer** — `pitch_deck` is an approvable entity type; `lib/decks/publish-slide.ts` is shared with the decks MCP tool.
- **Bookings & Services** — `booking_page` is an approvable entity type; approval flips `active=true`.
- **Surveys** — `survey` is an approvable entity type; approval flips `status='active'`.
- **Email & Campaigns** — `email_campaign` is an approvable entity type (approval recorded; send is separate).

---

## Invariants & gotchas

- **Token is the only auth credential for public links.** Reads and writes in `app/api/approve/[token]/route.ts` are always re-scoped via `clientId` captured at mint time — never trust a param for tenant identity.
- **Apply side-effects before recording the decision.** If the side-effect throws, the link stays `pending` so the author can retry without re-minting. This is an intentional retry-safety guarantee.
- **Only webhooks can promote `sent`/`viewed` → `signed`.** The send route never sets `signed` directly — see `lib/esign/status-machine.ts`. Terminal states (`signed`, `declined`, `canceled`) are sticky; webhooks replayed against them are no-ops.
- **DropboxSign test mode defaults to `true` outside production** — dev/staging do not burn signature credits. `lib/esign/dropbox-sign.ts` checks `NODE_ENV !== 'production'`.
- **`DROPBOX_SIGN_API_KEY` and `DROPBOX_SIGN_WEBHOOK_SECRET` must be set in production.** `lib/esign/dropbox-sign.ts` throws immediately (not silently) if missing.
- **Tenancy:** both `mcp_pending_changes` and `mcp_approval_links` carry `clientId`. Run `bun test:tenancy` after any data-access change touching these tables.
- **Approval link expiry** — `expiresAt` column exists on `mcp_approval_links` but expiry enforcement is the responsibility of `lookupApprovalLink` in `lib/mcp/approval-links.ts`; confirm before relying on it.
- **Never mint a site-wide preview token on the public approval page.** The approval route is unauthenticated; use `generatePreviewToken(siteId, pageSlug)` (page-scoped) so a leaked URL validates only for that one page. The visual editor (authenticated) uses the unscoped site-wide token — the two paths are intentionally different. See `lib/preview-token.ts` and [[ADR approval-preview-page-scoped-token]].

---

## Planning notes

- `lib/esign/contract-pdf.ts` has an inline TODO: replace the plain pdf-lib renderer with a themed renderer that mirrors the public `/contract/{token}` HTML view (logo, accent color, etc).
- The `email_campaign` approval path records approval but deliberately does NOT change the campaign's status — the author must trigger send explicitly. This is intentional but easy to misread.

---

## Related

- [[CRM]]
- [[Pitch Decks & Product Designer]]
- [[Bookings & Services]]
- [[CMS & Blocks]]
- [[Surveys]]
- [[Email & Campaigns]]
