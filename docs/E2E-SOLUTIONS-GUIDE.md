# E2E + UX/Completeness Guide — 19 Platform Solutions

_Generated 2026-06-04 from a multi-agent workflow: one code-grounded evaluator per solution (reading the real routes/components/lib/API + `tests/e2e/**`), synthesized here. Ratings are 1–5; every claim is backed by file:line evidence in the per-solution sections._

**How to read it:** **UX** = clarity/friction/polish/empty+error states. **Completeness** = how fully the intent is *wired* (vs stubbed/half-built). **E2E** = test-coverage depth. **Intent** = does it deliver the product's purpose directly and concisely.

## Summary

| Solution | UX | Compl. | E2E coverage | Intent verdict |
|---|:--:|:--:|---|---|
| Publishing | 3 | **2** | thin (1 spec) | Partial — only 1 of 6 channels (email) truly works |
| Automations | 3 | **2** | partial | Partial — rule engine fires; workflow builder + 16 events are dead |
| AI Chatbot | 3 | 3 | partial (API) | Partial — live chat solid; Brain auto-responder dormant |
| Experiments (A/B) | 3 | 3 | partial | Partial — posts work; deck path unwired; JSON-only editor |
| Contracts/E-Sign | 3 | 3 | partial | Partial — e-sign solid but Send is a live 400 bug |
| Ecommerce | 3 | 3 | partial | Partial — deep model; order-detail actions hit dead routes |
| Invoicing | 3 | 3 | partial | Core pay-flow works; webhook untested, breadcrumb 404 |
| Email Marketing | **4** | 3 | partial | Good; settings-save bug + scheduled/segments unwired |
| Agency/White-Label | **4** | 3 | partial | Good; primary-color stored but never applied; no tier gate |
| Help Desk | 3 | **4** | partial (API only) | Delivers; no UI E2E, no unread/pagination |
| Company Brain | 3 | **4** | strong API / no UI | Mostly; "Ask" page is MCP setup, not a query UI |
| CRM | **4** | **4** | strong API / thin UI | Delivers well; scoring-rules UI missing |
| AI Connect (MCP) | **4** | **4** | strong | Delivers; reject/get tools + BYOK untested |
| Websites/CMS | **4** | **4** | strong API / thin UI | Delivers; no browser editor E2E |
| Booking | **4** | **4** | strong | Delivers; payment + public happy-path untested |
| Surveys | **4** | **4** | strong | Delivers (broad); public-form + logic E2E thin; 11-tab overload |
| Project Mgmt | **4** | **4** | strong | Delivers; WIP client-rollback bug; reports/roadmap no E2E |
| Hosting | **4** | **4** | strong API / thin UI | Delivers; one service-gate hole on the [id] route |
| Pitch Decks | **4** | **4** | strong API / no browser | Delivers; real AI pipeline; no autosave; browser flows untested |

## Priority ranking — where to invest first

1. **Publishing (Compl. 2)** — the "one workflow for every channel" promise works for *email only*; `move_to_*` permissions render in the UI but aren't enforced in the move handler; stage→campaign sync never fires. Biggest gap between promise and delivery.
2. **Automations (Compl. 2)** — 16 declared trigger events are never emitted, the visual builder's nodes are immutable after placement, and `send_email`/`add_to_list` actions are silent no-ops. The rule engine is real; the workflow builder is largely a shell.
3. **AI Chatbot** — the headline differentiator (`brainEnabled` Brain auto-responder) is 100% dormant (schema-only); no visitor lead-capture form; SSE untested.
4. **Experiments** — deck A/B is implemented (`applyAbToDeckSlides`) but never wired into the slide renderer; the variant editor is a raw-JSON textarea non-devs can't use; list endpoint scopes by `createdBy` (hides teammates' experiments).
5. **Contracts** — proposal **Send** posts an empty body to a route that requires `recipientEmail` → 400 on every click; no contracts list page; PDF renderer is plain-text TODO.
6. **Ecommerce** — order-detail page calls `/status`, `/fulfillment`, and `PATCH /notes` sub-routes that **don't exist** (backend only has `PUT /orders/[id]`); no built-in cart/checkout pages (hard-coded `/cart` link 404s on fresh stores); negative prices accepted.
7. **Invoicing** — breadcrumb links to `/portal/billing` (404, should be `/settings/billing`); invoice number is `COUNT(*)+1` (race); payment-method storage + Stripe detach are TODOs; webhook untested.
8. **Email Marketing** — Email Settings default-sender form has **no save handler** (typed values silently lost — trust-breaking); `scheduled` status is a dead-end (no cron); segments aren't wired to campaign targeting.
9. **Agency** — `agencyPrimaryColor` is collected/stored/fetched but **never applied** to the shell; white-label routes have no tier/billing gate despite "Scale tier" copy; logo is URL-paste only.

Everything below the line (CRM, AI Connect, Websites, Booking, Surveys, Project Mgmt, Hosting, Pitch Decks, plus Help Desk & Company Brain) is **Compl. 4 and solid** — the work there is mostly (a) browser-level E2E and (b) targeted polish, not core completeness.

## Cross-cutting findings

1. **Near-zero browser-level E2E.** Almost every solution is tested at the **API layer only**. The actual portal UI — forms, dialogs, drag-and-drop, the block/email editors, charts — has little or no Playwright coverage. This is the single biggest systemic gap and is exactly why several live UI bugs below shipped unnoticed.
2. **"Backend-complete, frontend-dead" pattern (recurring).** Fully-built backends with the last mile missing: CRM scoring-rules (no UI), email settings (no save), Brain "Ask" (MCP-setup page, not a query UI), agency primary-color (never applied), automations' 16 events (never emitted) + `send_email`/`add_to_list` (no-ops), experiments deck-AB (not wired), publishing move-permissions (shown, not enforced). **Wiring the last mile would unlock a lot of already-paid-for value.**
3. **Live happy-path bugs a UI E2E would have caught:** proposal Send (400), ecommerce order-detail actions (dead routes), invoicing breadcrumb (404), email settings (data loss), PM WIP-limit (no client rollback on 409).
4. **Sequential-number race conditions:** `COUNT(*)+1` for both invoice numbers and ticket numbers → duplicate risk under concurrent insert. Use a DB sequence / `MAX()+1 FOR UPDATE`.
5. **`window.confirm()` / `prompt()`** appear in CRM settings, AI-Connect approvals/rename, booking, and pitch-deck path-groups — inconsistent, block the event loop, and fail a11y. Standardize on a modal.
6. **Stripe/webhook revenue paths are untested E2E** across ecommerce, booking, and invoicing (hard to mock → a consistent hole in the money path). Worth a seeded-webhook integration test pattern.
7. **Consistent strengths:** tenancy isolation is rigorously enforced at every layer across all solutions; realtime (Postgres LISTEN/NOTIFY + SSE) is solid (inbox, chat); data models are deep; and the AI pipelines (decks, automations NLP, brain hybrid search) are real implementations, not stubs.

---

# Per-solution detail

_Each section: intent verdict · E2E coverage + gaps · strengths · top improvements · recommended E2E._

## Publishing / Editorial Calendar — UX 3 · Completeness 2 · E2E thin
**Intent:** Partial. "One workflow for every outbound channel" is structurally sound (data model + nav shell), but the workflow only fully works for **email**, 1 of 6 channels. Board/calendar are functional for what exists.
**E2E:** Single spec (`portal-publishing.spec.ts`) — campaign CRUD, card lifecycle, calendar schedule/unschedule. Gaps: no page-level UI E2E (board/calendar/campaigns/permissions), no PermissionMatrix toggle, email-linkage test self-skips when no campaigns seeded.
**Strengths:** transactional idempotent bootstrap; rigorous tenancy at every route; well-designed 11-key permission model; well-specified calendar API (validates range, excludes null `scheduledFor`).
**Top improvements:** (1) **enforce `move_to_*` permissions in `cards/[id]/move`** — the UI grants them but nothing checks them (actively misleading). (2) Call `syncCardStageToCampaign` from the move handler (stage-sync never fires). (3) Replace the title-prefix hack for campaign/artifact chips with real chip slots. (4) Hide/replace the empty Tags stub tab.
**Recommended E2E:** board renders 6 columns + add-card; member with/without `move_to_scheduled` can/can't move; campaign modal create→edit→delete; calendar month-grid shows a scheduled card on its date.

## Automations & Workflows — UX 3 · Completeness 2 · E2E partial
**Intent:** Partial. Rule engine (NLP→rule, real events) largely delivers; the visual **workflow builder** is mostly a shell.
**E2E:** Rule CRUD + validation + consolidated mutations. Gaps: NLP parse happy-path (only 400 tested), scheduled-rule cron fire, the ReactFlow builder canvas (0 coverage), workflow templates.
**Strengths:** rule event bus genuinely wired to booking/CRM/tickets/surveys/email/orders/proposals; live NLP parser (Claude, BYOK); CAS-idempotent scheduled cron; Brain-playbook + plugin-script bridges.
**Top improvements:** (1) **Emit the 16 declared-but-never-fired events** (booking.*, task.*, ticket.replied/resolved, invoice.*, form.submitted, order.*, proposal.*) — a large slice of the catalog is dead UI. (2) Add a node-properties inspector to the builder (nodes are immutable after placement). (3) Wire `enqueueWorkflowRunsForTrigger` into the live bus (TODO; only the test-run endpoint calls it). (4) Implement `send_email`/`add_to_list` runtime actions (currently no-ops).
**Recommended E2E:** NLP parse happy-path → create rule; live rule exec (trigger booking → log row `success`); scheduled rule fires via cron; builder add+connect+save+test-run.

## AI Chatbot / Live Chat — UX 3 · Completeness 3 · E2E partial
**Intent:** Partial. Visitor→agent live chat is shippable and solid (realtime, security, status machine); the **Brain auto-responder differentiator is dormant**.
**E2E:** Full visitor↔agent round-trip + widget CRUD + status machine. Gaps: visitor/agent SSE streams (skipped — needs live server), rate-limit 429, body-too-long 413, browser widget loader.
**Strengths:** complete loop wired (HMAC token, rate limit, LISTEN/NOTIFY, dual SSE) with no stubs; tenancy enforced at every layer; complete status machine w/ auto-claim + 409 closed-guard; self-contained iframe embed.
**Top improvements:** (1) **Implement `brainEnabled`** (Brain first-responder) — the headline feature, hardcoded `false`. (2) Add a "Create widget" CTA to the inbox empty state (currently a dead end). (3) Add a pre-chat lead-capture form (schema already supports name/email). (4) Wire inbox pagination (UI never passes limit/offset).
**Recommended E2E:** rate-limit 429 on 11th msg; disabled-widget 404; body-length 413; browser widget bubble→panel→greeting.

## A/B Experiments — UX 3 · Completeness 3 · E2E partial
**Intent:** Partial. Works end-to-end for **post** targets (deterministic assignment, sticky cookie, z-test); deck targets and the editor lag.
**E2E:** 3 specs for post lifecycle. Gaps: deck SSR path never exercised (and the deck spec hits the wrong URL so it "passes" for the wrong reason); variant `blockTreeOverride` content-swap unverified; `cta_click`/`form_submit` goals + `goalSelector` untested.
**Strengths:** pure FNV-1a bucketing; fire-and-forget exposure recording; safety rails (control-protected, min-2-variants, running-blocked, malformed-JSON fallback); dependency-free two-proportion z-test with sample-size guard.
**Top improvements:** (1) **Wire `applyAbToDeckSlides` into `/sites/[domain]/slides/[slug]`** (function exists + unit-tested; ~4-line integration). (2) Scope the list endpoint by `clientId` not `createdBy` (hides teammates' experiments). (3) Replace the raw-JSON variant textarea with a visual/guided editor (biggest UX barrier). (4) Fix the deck E2E URL.
**Recommended E2E:** deck SSR variant swap (pinned visitorId → arm B text); post content swap per arm; `cta_click` goal fires; multi-user tenant list scoping.

## Contracts & E-Sign — UX 3 · Completeness 3 · E2E partial
**Intent:** Partial. DropboxSign integration is well-engineered, but **proposal Send is broken** and there's no contracts list page.
**E2E:** `contracts-esign.spec.ts` (auth/validation/webhook) + integration suite. Gaps: no full proposal send→public-view→accept; no `/contract/[token]` signing-page flow; e-sign tests use non-existent contract IDs.
**Strengths:** complete DropboxSign provider coverage (create/sign-url/webhook HMAC/cancel/signed-file); extracted pure status machine; thorough integration tests (tenancy, blocked-state 409, dual-auth, audit rows); polished public proposal page (live totals, expiry, signature canvas).
**Top improvements:** (1) **Fix proposal Send** — UI posts empty body but route requires `recipientEmail` → 400 (make it optional/derived, or add the field). (2) Add a contracts list page (the GET API already exists). (3) Replace the plain-text PDF renderer (TODO) with the themed HTML→PDF. (4) Add an E2E for the send→view→accept path.
**Recommended E2E:** proposal create→Send (with email)→public accept→sign→status `accepted`; contract send-for-signature (DropboxSign mocked); webhook `all_signed`→status `signed`; public `/contract/[token]` canvas-sign flow.

## Ecommerce / Online Store — UX 3 · Completeness 3 · E2E partial
**Intent:** Partial. Deep model + designer + Stripe + EasyPost are above-average; but **order-detail actions call routes that don't exist** and there's no built-in cart/checkout.
**E2E:** 5 specs (settings/product/category/discount CRUD, dup-slug rejection). Gaps: no full cart→checkout→PaymentIntent→webhook→order flow; order-detail `/status`,`/fulfillment`,`PATCH /notes` sub-routes are called but **don't exist** (backend only has `PUT /orders/[id]`); EasyPost rate/label untested.
**Strengths:** deep product model (variants/options/bulk-pricing/designable); Stripe dual-mode (Connect vs BYOK) with tenancy-asserted webhook; EasyPost wired end-to-end; webhook covers succeeded/failed/refunded with inventory + email + automation events.
**Top improvements:** (1) **Consolidate the broken order-detail actions into the existing `PUT /orders/[id]`** (which already accepts those fields). (2) Ship built-in cart/checkout storefront routes (the `ProductPage` `/cart` link 404s on fresh stores). (3) Add server-side price≥0 validation (−100 silently accepted). (4) Add a portal refund button.
**Recommended E2E:** order status update via `PUT`; full customer checkout→clientSecret→webhook→`paid`; webhook decrements inventory + discount usage; cart cross-tenant isolation.

## Invoicing & Payments — UX 3 · Completeness 3 · E2E partial _(currently hidden from marketing)_
**Intent:** Delivers the core (create→send→pay via Stripe Checkout→webhook) directly; not yet the broader "billing suite."
**E2E:** 4 `@critical` specs (admin CRUD, checkout status-gate, auth split). Gaps: **Stripe webhook `paidAt` path entirely untested**; no UI E2E for list filters / PayInvoiceButton / payment-method delete.
**Strengths:** full Checkout + metadata-driven webhook reconciliation; strong status-gate (draft/paid/cancelled reject with "not payable"); cross-tenant scope enforced; admin dashboard cache invalidation on pay.
**Top improvements:** (1) Fix breadcrumb `/portal/billing`→`/portal/settings/billing` (404). (2) Fix invoice-number race (`COUNT(*)+1`→sequence/txn). (3) Implement payment-method storage in the webhook (tab is non-functional). (4) Implement Stripe detach in the DELETE route (TODO).
**Recommended E2E:** webhook `checkout.session.completed`→`paid`+`paidAt`; admin list filter/search/inline-status; PayInvoiceButton click→redirect; breadcrumb resolves 200.

## Email Marketing — UX 4 · Completeness 3 · E2E partial
**Intent:** Delivers the core (list→campaign→send→analytics, real Resend emails, collaborative block editor) directly; a few sub-features are dead-ends.
**E2E:** 5 specs (list/subscriber/campaign CRUD, mutations `@critical`). Gaps: A/B lifecycle (EmailAbConfig untested), scheduled-send, **Settings save (no handler)**, Resend webhook (open/click/bounce) untested.
**Strengths:** full Resend pipeline (per-recipient unsubscribe tokens, List-Unsubscribe, HTML+text); email-safe table HTML w/ Outlook VML; Yjs real-time co-editing + presence; A/B subject testing fully implemented (split, 4h window, promote-winner).
**Top improvements:** (1) **Wire the Email Settings default-sender form** — values are local `useState` with no submit (silent data loss; highest priority). (2) Implement scheduled-send cron (or remove the status). (3) Wire segments to campaign targeting (rules exist; no selector). (4) Cron auto-promote A/B winner (manual today).
**Recommended E2E:** A/B lifecycle (enable→subjectB→send→promote-winner); Settings save round-trip (would currently fail, exposing the bug); Resend webhook open→`totalOpened++`; segment-targeted send.

## Agency / White-Label — UX 4 · Completeness 3 · E2E partial
**Intent:** Delivers the core (brand the portal under a custom domain/identity) directly; one prominent field is inert.
**E2E:** `portal-agency-white-label.spec.ts` (`@critical`) — branding persist/clear, custom-domain pending+TXT, white-label rejected pre-verification. Gaps: verified-domain happy-path (only the unverified branch is tested), visual chrome swap, `agencyPrimaryColor` persistence, 409 domain-claim conflict.
**Strengths:** production-grade middleware (dual-layer TTL cache, 1s DB timeout fail-open, tag invalidation); tight security (32-byte TXT token, apex blocked, clean 409); toggle gated on verified-domain AND name with specific missing-prereq messaging; domain audit trail.
**Top improvements:** (1) **Apply `agencyPrimaryColor` to the shell** (stored + fetched but never consumed — set `--primary` in `AgencyChromeProvider`). (2) Add a tier/billing gate to the white-label routes (copy says "Scale tier"; API doesn't check). (3) Replace the logo URL input with file-upload. (4) Add DNS-propagation auto-poll.
**Recommended E2E:** seed `verifiedAt`→enable→`/chrome` returns white-label on; 422 when name missing; 409 domain already claimed; browser: sidebar shows agencyName not "Simpler Development".

## Help Desk (Inbox + Tickets) — UX 3 · Completeness 4 · E2E partial (API only)
**Intent:** Delivers — async tickets + realtime inbox chat, complementary and lightweight (no third-party push).
**E2E:** 5 specs (ticket CRUD, SLA fields, chat round-trip). Gaps: **no browser E2E for any inbox/ticket page**; SLA-breach cron untested; staff `TicketStatusControl` PATCH (assigneeId) untested; internal-note hiding from clients untested.
**Strengths:** SSE inbox via Postgres LISTEN/NOTIFY; fully-wired SLA (deadlines, countdown badges, overdue filter, hourly cron w/ 24h dedup); strong tenancy (SSR clientId guard, assignee validated vs `clientMembers`); internal notes (`isInternal`, hidden from clients).
**Top improvements:** (1) Fix ticket-number race (`COUNT(*)+1001`→sequence). (2) Implement (or remove) the hardcoded `avgResponseTime '--'` admin stat. (3) Add unread badges to inbox rows + nav. (4) Add pagination to tickets list + inbox (API supports it; UI doesn't).
**Recommended E2E:** browser smoke for `/portal/inbox` + `/portal/tickets/new` submit→detail; internal-note invisible to client GET; staff assignee PATCH valid/invalid member.

## Company Brain — UX 3 · Completeness 4 · E2E strong (API) / none (UI)
**Intent:** Mostly delivers — capture→AI-propose→human-approve→cited cross-record search is fully implemented for the paste adapter, review queue, and hybrid search; the human-approval invariant holds.
**E2E:** 10 API-driven specs (no browser flows). Gaps: zero Playwright UI; "Ask" route is MCP-setup instructions (not a query UI); review-queue approve/reject UI untested; 1273-line automations page has no dedicated spec.
**Strengths:** 10+ fully-wired sub-features (real DB/typed routes/UI); hybrid search (lexical ILIKE + pgvector cosine, graceful no-key fallback); excellent entitlement architecture (trial/sub/bypass, context-preserving upsell); IDE-quality knowledge editor (resizable panes, wikilinks, history, command palette).
**Top improvements:** (1) **Add an in-portal "Ask Brain" query UI** with cited, deep-linked results — the current `/brain/ask` doesn't fulfill the "ask anything with citations" promise for portal users (highest-value gap). (2) Rename/redirect `ask` vs `connect` confusion. (3) Wire the no-op `topicId` filter in `brain_decisions_list`. (4) Add browser E2E for enable-toggle, task review-approve, knowledge create.
**Recommended E2E:** enable-Brain island→dashboard; paste→review-queue→approve task; knowledge note + wikilink backlinks; entitlement wall for non-subscribed tenant.

## CRM — UX 4 · Completeness 4 · E2E strong (API) / thin (UI)
**Intent:** Delivers well — self-contained pipeline (contacts→companies→deals→proposals→contracts) with power features (custom fields, scoring, notifications, import/export, saved views).
**E2E:** 8 specs (deep API CRUD + notifications). Gaps: no browser E2E for contacts/companies/proposals list+detail pages, saved-view apply, import/export UI.
**Strengths:** production-grade deal kanban (DnD, slide-over, 3-tab drawer); unusually complete contacts filter stack (debounced search, company typeahead, multi-select, custom-field filters, saved views); well-tested notification fan-out (5 event types, actor-excluded, dedup, mention parsing); two-step CSV import with per-row errors.
**Top improvements:** (1) **Add a Scoring Rules tab to CRM Settings** — API complete, purely a missing UI panel (lead scoring is invisible today). (2) Surface the implemented Brain CRM-suggestions endpoint somewhere (deal/company detail). (3) Add a tag filter to contacts list (API accepts `tagId`). (4) Replace native `confirm()` in settings with a modal.
**Recommended E2E:** contacts filter round-trip; contact edit-save-reload + tag add/remove; proposal create→Send→public view→`proposal_viewed` notification; contract send-for-signature badge.

## AI Connect (MCP / BYO AI) — UX 4 · Completeness 4 · E2E strong
**Intent:** Delivers clearly — MCP endpoint + scope-filtered tool catalog + `requireCmsApproval` + approvals UI = a coherent "AI drives the portal with human-in-the-loop" story.
**E2E:** 5 specs (key CRUD, approval flow, scope filter, cron expiry). Gaps: `approvals_reject`/`approvals_get` MCP tools (0 coverage); BYOK provider-key lifecycle (only unit-mocked); OAuth token revoke; `/docs/mcp` page.
**Strengths:** production-grade approval workflow (`stageOrApply` primitive used consistently across CMS/decks/proposals/email); scope-filtered `tools/list` is a real differentiator (cuts AI token cost); AES-256-GCM BYOK encryption (per-row IV, never echoed); field-level diff viewer in approvals UI.
**Top improvements:** (1) **Unify the two "API key" nav paths** (`/settings/api-keys` MCP keys vs `/integrations/api-keys` BYOK) into one "AI & Connect" hub — biggest new-user confusion. (2) Replace `confirm()`/`prompt()` in approvals/rename. (3) Add E2E for `approvals_reject`/`approvals_get`. (4) Add a BYOK lifecycle integration test.
**Recommended E2E:** `approvals_reject`/`approvals_get` via MCP; BYOK POST→masked preview→DELETE; revoked key→401 from `/api/mcp`.

## Websites / CMS / Visual Editor — UX 4 · Completeness 4 · E2E strong (API) / thin (UI)
**Intent:** Delivers — non-technical clients build+publish sites; 47-block registry, draft-gating public API, revision system.
**E2E:** 14+ specs (every one of 47 block types API round-tripped). Gaps: **no browser test adds a block via the UI** (all via direct API injection); DnD reorder untested; revision-history UI untested; collaboration/presence has zero coverage; a hard-coded `CLIENT_SITE_URL` TODO silently skips public-render assertions in CI.
**Strengths:** full 47-block API round-trip coverage (unusually thorough); revision history w/ content-hash dedup + 100-cap; category/tag diff-sync on PUT (no churn); block security gate (non-admins can't insert html-render/embed).
**Top improvements:** (1) **Add a browser E2E: open editor→Add Block→pick type→fill RightPanel→save→verify public API** (validates postMessage + picker + save together — most valuable missing coverage). (2) Fix the hard-coded `CLIENT_SITE_URL`. (3) Add editor controls for the `sticky-scroll-tabs` block. (4) Initial-letter presence avatars.
**Recommended E2E:** add-block-via-UI; DnD reorder→public order; revisions panel revert; public site renders a heading block.

## Booking / Scheduling — UX 4 · Completeness 4 · E2E strong
**Intent:** Delivers directly — full white-label scheduling (Calendly-equivalent) plus waivers, group classes, gift certs, check-in, Stripe Connect.
**E2E:** 6 specs (booking-page CRUD, group, gift certs, etc.). Gaps: public slot-selection in isolation; **full public happy-path** (date→time→info→confirmed) on a test-created page; Stripe payment path (0 coverage); waiver submit + PDF.
**Strengths:** very thorough single-transaction book handler (min-notice, capacity, discount, gift cert, group, staff assign, Stripe, calendar, Zoom, email, automation); paid bookings defer side-effects to webhook (no double-create); multi-mode staff assignment; deep widget theming.
**Top improvements:** (1) Add a waiver signature step to `BookingFormInline` (schema/API/viewer exist; guests can't sign). (2) Replace freetext timezone with a searchable IANA dropdown. (3) Extend calendar HOURS to full 0–23. (4) Add QR-scan to check-in.
**Recommended E2E:** public happy-path (create page→fetch slots→book→checkinCode + DB row); check-in by code (+409 re-check-in); cancel via token (+409); refund of a seeded paid booking.

## Surveys & Forms — UX 4 · Completeness 4 · E2E strong
**Intent:** Delivers (surprising breadth) — full pipeline from creation to CRM lead routing; well-served for power users who find all 11 tabs.
**E2E:** 5 specs (API CRUD, variant lifecycle, branding). Gaps: public `/s/[slug]` with a **fixture** survey (current branding test depends on a brittle hardcoded seed slug); conditional `showIf` logic; Settings tab (thank-you/redirect/closesAt/requireEmail); email follow-up sequences.
**Strengths:** complete create-to-result pipeline (16 field types, logic, branching, A/B, partial capture, webhooks, CRM routing, follow-ups, AI summary, CSV, results page, certificates) — all real; hardened public submit (CORS, HMAC webhooks, SSRF guard, PII stripping, swallowed CRM failures); deterministic A/B with tamper-guard.
**Top improvements:** (1) Fix the stale `TAB_INDEX` in the baseline spec (settings 6→10, masking regressions). (2) Add an unsaved-changes guard on the Edit tab (highest friction). (3) Collapse the 11-tab strip (overflows; buries config). (4) Make ShareTab integration callouts actionable deep-links.
**Recommended E2E:** fixture public submit→thank-you + count++; Settings round-trip (custom thank-you); conditional logic show/hide on public form; email-sequence create/delete.

## Project Management — UX 4 · Completeness 4 · E2E strong
**Intent:** Delivers directly — create project, DnD cards, plan sprints, burndown/velocity, unified My-Tasks inbox, all in-portal.
**E2E:** 6 specs (cards, columns, sprints, labels, my-tasks). Gaps: Reports tab (burndown/velocity/cycle-time/CFD — 0 coverage); **WIP-limit client rollback** (server returns 409 but the board ignores it and stays moved — functional gap, untested); Roadmap Gantt; Settings sub-panels (goals/custom-fields/recurrences/webhooks).
**Strengths:** server-side WIP enforcement returns structured 409; 3-wave parallel SSR prefetch (7+ round-trips→3); My-Tasks dedups promoted Brain tasks + URL-persisted filters; full sprint analytics in dependency-free inline SVG.
**Top improvements:** (1) **Fix WIP-limit client rollback** — `onDragEnd` must await the move, check `code==='wip_limit'`, and revert (server already returns it). (2) User-friendly CFD empty-state (currently leaks "schedule /api/cron/..."). (3) Wire `SavedViewsPicker` into the board. (4) `@critical`-tag sprints + labels specs.
**Recommended E2E:** WIP enforcement + client rollback; reports-tab smoke (5 chart sections render or empty-state, not error); sprint retro create→promote-to-card; project clone (columns/labels copied, cards not).

## Hosting — UX 4 · Completeness 4 · E2E strong (API) / thin (UI)
**Intent:** Delivers directly — clients see their Railway env (status, DNS, URLs); admins provision/manage. Read-only client side is appropriately scoped.
**E2E:** 3 specs incl. a thorough lifecycle (admin CRUD, provision-domain DNS, verify-dns envelope, auth across 7 endpoints, validation). Gaps: no browser E2E (client detail page, empty state, admin slide-out, form validation in-browser).
**Strengths:** complete admin CRUD panel (stats/search/DNS builder/slide-out/delete); end-to-end DNS workflow (real CNAME instructions + real DNS resolution + auto-promote to active); client detail covers all states (provisioning/suspended/active banners).
**Top improvements:** (1) **Fix service-gate hole**: `/api/portal/hosting/[id]` lacks the `requireService:'hosting'` check the list route has (unsubscribed client can read a site by ID). (2) Add copy-to-clipboard on DNS value cells. (3) Fix `verify-dns` domain backfill (`!cw.domain` skips updates on domain change). (4) Enforce or rename the meaningless starter/pro/enterprise tier badges.
**Recommended E2E:** browser empty-state→"Request Hosting"; client detail DNS table + Visit link (active vs provisioning); **API: GET `/hosting/[id]` returns 403 without subscription** (currently 200 — the gate hole).

## Pitch Decks — UX 4 · Completeness 4 · E2E strong (API) / none (browser)
**Intent:** Delivers — AI-generated, brand-aware, publishable decks with post-gen editing, executed completely on the primary path (real AI pipeline, not a stub).
**E2E:** 5 specs (API CRUD, version checkpoint/restore). Gaps: no browser E2E for deck creation (AI/blank/HTML-upload), single-slide AI edit, batch edit, or decision-slide branching.
**Strengths:** AI edit classifier sends 75–85% smaller payloads (real token optimization); auto-version-snapshot before every AI gen/edit (prevents silent overwrites); rich brand-context pipeline (profile→client→URL-extract w/ SSRF guard→defaults); clean draft/publish-per-slide staging.
**Top improvements:** (1) Add debounced autosave (manual Save is the top data-loss risk on long sessions). (2) Wire `surveyFieldBlocks` editing end-to-end (remove the `void` suppressions). (3) Replace `confirm()` in path-group flows with inline modals. (4) Add a streaming/skeleton indicator for AI generation.
**Recommended E2E:** create deck via AI prompt→editor with slides; per-slide AI edit→preview updates; batch edit 2 slides; publish single-slide draft→amber badge clears.
