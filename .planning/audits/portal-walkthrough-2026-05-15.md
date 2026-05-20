# Portal Walkthrough — 2026-05-15

**Method:** 6 parallel walkthrough agents, each scoped to one portal area, signed in as the seeded `testing@simplerdevelopment.com` user on `localhost:3001` pointed at the live shared Railway Postgres (`metro`).

**Result:** **54 findings** — 3 blockers, 25 major, 8 UX, 18 minor. Two of the blockers and several majors are one-shot code fixes; the rest decompose into ~5 themes that need design decisions.

**Raw findings:** `/tmp/walkthrough-findings/*.json`  
**Screenshots:** `/tmp/walkthrough-screenshots/*.png` (180 total)

---

## Cross-cutting themes (read this first)

### 1. Tenancy bootstrap is broken for any "owned" client without a `client_members` row

User 178 (`testing@simplerdevelopment.com`) had `default_client_id=NULL` and zero rows in `client_members`. Every tenant-scoped `/api/portal/*` returned 401 → branding, media, team, billing, approvals, api-keys all showed indefinite spinners. **Fix applied during the run** — inserted `client_members(client_id=94, user_id=178, role='owner')` and set `users.default_client_id=94`.

The broader issue: 3 of 12 production clients on metro have zero `client_members` rows (clients 84 Palizzi Social Club, 94 SimplerDevelopment Testing, 95 unnamed). They're owned via the legacy `clients.user_id` 1:1 column but invisible to the new multi-tenant API path. Any client that signs into the portal with `client_members` empty hits the same dead end the agent did.

**Recommendation:** add a backfill script that promotes the legacy `clients.user_id` owner into `client_members(role='owner')` for every client that has no membership rows. Run once against metro, then add a migration that enforces "at least one owner per active client" going forward.

### 2. Service subscription is a hidden tax — booking, email, pitch-decks all needed manual grant

Three of the six walkthrough scopes (bookings, email, pitch-decks) failed until the agent manually inserted a `client_services` row to grant the test tenant access. The pattern across these surfaces:

- Paywall fires **post-submit**, not pre-form. User fills the whole form, clicks Create, gets a 403. Bad first impression.
- The 403 response surfaces inconsistently — sometimes a red banner, sometimes an empty state, sometimes (email/automations) the wrong upsell card.
- The 403 response often includes an `upsellUrl` but the UI doesn't link to it.

**Recommendation:** standardize the pattern. Either (a) gate the **form itself** behind the subscription check so the user sees the upsell before they invest time, or (b) keep the form but render a single consistent "this requires <service> — [Upgrade]" banner above it. Pick one and apply everywhere.

### 3. Approval-URL contract between MCP and portal-UI is inconsistent

The MCP `sd-create-*` skills mint approval URLs for posts, decks, emails, surveys, **and** booking pages. The portal UI does NOT. Walkthrough findings:

- **Booking pages**: created via portal UI are born `active=true` directly. No approval URL minted, no review surface, contradicts the documented `sd-create-booking-page` Flow B contract.
- **Surveys**: portal UI uses a direct Draft↔Active toggle (`PUT { status:'active' }`). No `mcp_approval_links` row created.
- **Posts / decks / emails**: same — portal-UI mutations don't go through the approval-link path.

Either the portal UI needs to start minting approval URLs (matches MCP semantics; reviewers get a shareable link), or the docs/skills need to clarify "MCP creates draft + approval URL; portal creates published-on-save."

### 4. Realtime collaboration is universally broken in dev

`/api/realtime/token` returns HTTP 500 on every load of the post editor and the deck editor (4–6× per session) because `REALTIME_JWT_SECRET` is unset. Should be a soft 503 / 200-disabled with a "collaboration off" indicator, not a 500 that pollutes logs and fails the page.

### 5. NEXT_PUBLIC_SITE_URL default is `localhost:3000` — wrong for any non-default port

The post editor iframe in `/portal/websites/<siteId>/posts/<id>/edit` frames `http://localhost:3000/...` regardless of which port the dev server is actually running on. Since the dev server can shift to 3001 (this session) when 3000 is held by another worktree, the iframe loads nothing. The visual editor is unusable for any developer running multi-worktree sessions.

---

## Blockers (3)

| # | Area | Where | What | Fix |
|---|---|---|---|---|
| B1 | brand-settings | `client_members` table | Test user has no membership row → every `/api/portal/*` 401s | **Fixed during run** (also surfaces as a broader 3-tenant orphan problem — see theme 1) |
| B2 | decks | `app/portal/tools/pitch-decks/[id]/page.tsx:935` `getSlideView` | Editor crashes with `TypeError` on freshly-created decks where `slides=[]`. Every first-time user dead-ends on the "Oops" error boundary. | Either seed an empty cover slide on create OR guard `currentSlide == null` with an empty-state in the editor |
| B3 | posts-blocks | `/portal/websites/[siteId]/posts/[id]/edit` iframe | Canvas frames `http://localhost:3000/` (hard-coded NEXT_PUBLIC_SITE_URL default) instead of the actual dev-server origin → blank canvas in any non-default-port session | Use `window.location.origin` or read from a config-aware site URL helper |

---

## Major issues (25)

### Auth / tenancy / service gates

| Area | Where | What |
|---|---|---|
| brand-settings | `lib/auth.ts:69` `signIn: '/admin/login'` | Portal login failures redirect to `/admin/login` (wrong audience) |
| brand-settings | `/portal/login` (intermittent) | NextAuth credentials callback non-deterministically rejected — `authorize()` may be swallowing an exception. Five fresh-context attempts in a minute rejected with `CredentialsSignin` despite valid hash. |
| emails | `lib/portal-auth.ts requireService('email')` | Service-gate surfaced inconsistently across `/portal/email/{lists,campaigns,templates,segments,automations}` |
| emails | `/portal/email/automations` | Renders a **Company Brain** $49/mo upsell card instead of the Email upsell — hard-coded or mis-keyed service slug |
| emails | `/portal/email/lists` create form | Submit silently 403s — no toast or error microcopy |
| bookings | `/portal/tools/booking/new` | Paywall fires only **after** the user fills the form |
| decks | `/portal/tools/pitch-decks/new` | Same — full form rendered for non-subscribed tenants; 403 response includes `upsellUrl` but UI doesn't link to it |

### Editor / rendering

| Area | Where | What |
|---|---|---|
| posts-blocks | `/api/realtime/token` | Returns 500 every editor load — `REALTIME_JWT_SECRET` not set. Should be a soft 503. |
| decks | `/api/realtime/token` | Same — 500 instead of 503, called 4–6× per session |
| posts-blocks | Post editor `Publish` button | Flips dropdown to "Published" but post still shows Draft on the site dashboard a few seconds later |
| posts-blocks | Add Block "Text" | Inserts a `marquee` block instead of a generic text block |
| posts-blocks | `/posts/new` | Shows fully-styled Preview + Publish buttons before any post exists — clicking does nothing silently |
| emails | Campaign editor "Add Block" tab | Doesn't open the block picker — Layers tab stays active |
| emails | Campaign editor `Save Campaign` button | Disabled forever after all required fields filled, no reason surfaced (probably needs a list selected but list can't be created due to gate) |
| surveys | `lib/survey-logic.ts evaluateRule` | TypeError crashes the entire public form when a `showIf` rule is missing `values` array |
| surveys | `components/blocks/render/SurveyFormInline.tsx` | Missing `case 'nps':` renderer — survey with NPS field renders label but no input |
| brand-settings | `/portal/branding`, `/portal/media`, `/portal/approvals`, `/portal/settings/team`, `/portal/settings/billing` | All five panels stuck on "Loading…" — caused by the 401 cascade (theme 1) and confirmed resolved by the in-run fix. Worth re-running these screens after deploy to confirm. |
| brand-settings | `/portal/settings/support` | First-load `net::ERR_ABORTED` |

### Approval / branding contract

| Area | Where | What |
|---|---|---|
| bookings | `/portal/tools/booking/<id>` (post-create) | No approval URL minted — booking pages are born `active=true` from the portal UI |
| bookings | `/api/public/booking/<slug>/book` | Reservation accepted with `assignedMembers=[]` + `assignmentMode='fixed'` — host-notification email silently no-ops |
| bookings | Public `/book/<slug>` | Brand profile not applied — page renders default blue `#2563eb`. `booking_pages.brandingProfileId` is NULL on portal create even when the tenant has a default brand profile. |
| decks | Public viewer | `/pitch-deck/<slug>` 308s to `/slides/<slug>` which 404s for drafts. Either the redirect target is wrong or the public route should accept drafts under an approval-token query param. |

---

## UX & minor (26 total — see raw JSON for the full list)

Common patterns:
- Every data list defaults to indefinite "Loading…" with no empty/error state.
- 7–9s cold-load times on `/portal/dashboard`, `/portal/websites`, `/portal/tools/pitch-decks/new` with no skeleton.
- Hydration mismatch warnings on `/portal/settings/api-keys` and others (two issue badges in dev).
- `ClientFetchError: Failed to fetch` from NextAuth `getSession` on first paint of nearly every `/portal/*` page.
- Multiple "No <thing> yet — [Create]" empty states whose Create button does nothing because of a service gate or auth gate underneath.

---

## What's fixable in this session vs needs a decision

### Single-shot code fixes (recommended for this session)

1. **B2** — Guard `getSlideView` against empty `slides[]` (decks editor crash)
2. **B3** — Editor iframe URL: switch from hardcoded `localhost:3000` to `window.location.origin`
3. `/api/realtime/token` — return 503 instead of 500 when secret is missing
4. `lib/auth.ts:69` — switch `signIn: '/admin/login'` → audience-aware redirect
5. `lib/survey-logic.ts evaluateRule` — default `rule.values ??= []` + null-safe operator dispatch
6. `components/blocks/render/SurveyFormInline.tsx` — add `case 'nps':` renderer
7. `/portal/email/automations` — fix the upsell slug from `brain` → `email`
8. Booking page create — populate `brandingProfileId` from the client's default brand profile on insert
9. Posts editor Add-Block "Text" → actually insert a text block, not a marquee
10. Backfill script: insert `client_members` rows for the 3 orphan clients (84, 94, 95)

### Needs a design decision (not fixed in this session)

- **Theme 2 (service-gate UX):** which pattern wins — pre-form gate vs single banner above form?
- **Theme 3 (approval-URL contract):** does the portal UI start minting approval URLs, or do the docs clarify "MCP-only"?
- Auth credentials flakiness — needs deeper instrumentation to find what `authorize()` is swallowing.
- Page-level branching for surveys (Page 1..4 → Page X) — true feature gap, runbook claims it exists.

---

## Inventory of created test artifacts (to clean up)

- post 698 — `[QA-2026-05-15-claude] Walkthrough …` on site 106 (Draft)
- deck 353 — `[QA-2026-05-15-claude] decks walkthrough` (slides=[])
- survey 152 — `[QA-2026-05-15-claude] Walkthrough Survey` + 1 response (id 52)
- booking_page 2 — `[QA-2026-05-15-claude] Discovery Call` + 1 reservation (id 1, status confirmed)
- email list — `[QA-2026-05-15-claude] Walkthrough List` + 1–2 subscribers
- email campaign — `[QA-2026-05-15-claude] Welcome test`
- client_services rows inserted by agents: booking + pitch-decks + email — **likely should stay** (it makes sd-testing usable)

## Notes on the walkthrough protocol itself (for next time)

1. **One shared test user is a hazard.** Multiple agents racing to set `users.password` for user 178 caused intermittent login flakes. Use per-agent fresh team invites instead.
2. **The brief I gave had the wrong password.** I set the test user's password to `walkthrough-2026-05-15` but the canonical seed (`scripts/seed-sd-testing.ts:13`) uses `SDtesting2026!`. Several agents had to rediscover this. Use the seeded password.
3. **Localhost port collisions are real.** Default to `:3001` if the user has any other dev sessions running.
4. **Service subscriptions need to be in the test fixture.** The seed script should grant client 94 every service so testers don't have to insert `client_services` rows manually.
