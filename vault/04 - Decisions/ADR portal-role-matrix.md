---
type: adr
domain: auth
status: accepted
date: 2026-09-30
sources:
  - lib/portal-auth.ts
  - lib/mcp/client-scope.ts
  - app/api/portal/
---

# ADR: Portal routes gate on a four-level role matrix, rolled out log-only first

## Status
Accepted — 2026-09-30 by the owner. Tracked on the master board as AUTH79-020; the human decision was the blocker recorded on PUX-138.

## Context
Tenancy (which company you belong to) is enforced on every portal route. **Role** (what you may do inside that company) mostly is not. On 2026-09-30, 449 of 585 `app/api/portal/**` route files authenticated with raw `auth()` + `getPortalClient(userId)` and never asked for a role. A team member invited as `viewer` could therefore call write- and admin-level routes across Brain, CRM, CMS, projects, cards and websites. A further 5 routes did call `authorizePortal` but exported a POST/PUT/PATCH/DELETE while asking for nothing above the default `read`.

The other 135 routes already hard-enforce roles via `authorizePortal` (its default). The machinery for the rest existed too — `ROLE_LEVELS`, `ACTION_REQUIRED_LEVEL`, and a log-only mode (`observeRole` / `AUTH_ROLE_ENFORCE`) — but nobody had decided which action each area requires. Without that matrix, any sweep would guess, over- or under-permissioning hundreds of routes at once.

## Decision
Keep the existing ladder — `viewer (0) < member (1) < admin (2) < owner (3)` — and the existing actions — `read` viewer+, `write` member+, `admin` admin+, `owner` owner-only. Map routes onto them as follows.

| Action | Who passes | Applies to |
|---|---|---|
| `read` | viewer+ | Every GET, **except** billing/invoices and API-key or OAuth-client listings (those are `admin`). |
| `write` | member+ | Creating, editing and deleting content: Brain, CRM, CMS pages/posts/media, projects/cards/sprints/retros, surveys, email campaign **drafts** and test sends, tickets, chat replies, the publishing board, and **publishing website changes live**. |
| `admin` | admin+ | Team and roles; settings; integrations, OAuth clients, API keys; agency white-label; outbound project webhooks; automations, workflows and trigger links (they act *as* the company); site domains, redirects, env vars and custom code; **sending or scheduling an email campaign to a real list**; viewing billing, invoices and payment methods. |
| `owner` | owner only | Changing or cancelling the plan, buying AI credits, deleting a website or the account, transferring ownership. |
| — (exempt) | any signed-in user | Routes about the caller's own account, not the company's: sign-out, switch-client, reset-password, my-tasks, the caller's own notifications, onboarding, saved views, realtime. |

The three calls that were genuinely open, as decided:

- **Email send is `admin`.** Members draft and send tests; sending or scheduling to a subscriber list reaches the company's customers and cannot be taken back.
- **Publishing a website is `write`.** Members are editors. What stays `admin` is the site's plumbing — domains, redirects, env vars, custom code — because those can take a site down or inject script into it.
- **Billing is `admin` even to read.** Viewers and members don't see invoices, payment methods or the plan; owners alone change or cancel it.

## Rollout
1. Guard each ungated route with **`gatePortalRole(userId, client, action)`** (`lib/portal-auth.ts`) right after its existing `getPortalClient` resolution. It is log-only by default: an insufficient role is logged as `portal.role.insufficient` and still allowed.
   - ❌ **Not** `authorizePortal({ action, observeRole: true })` — the first draft of this ADR said that. `authorizePortal` also accepts bearer tokens, so swapping ~450 session-only routes onto it would open them to API keys as a side effect of a role sweep.
   - ✅ `gatePortalRole` adds the role check and nothing else. (`authorizePortalSite` remains right for `websites/[siteId]/**`, which already resolve through it.)
2. Fix the 5 read-level write routes in the same pass.
3. CI ratchet `scripts/check-portal-role-gates.ts` (`bun run check:role-gates`): every `app/api/portal/**/route.ts` calls a gate or sits on its exempt list, or is in a baseline that may only shrink. The gap grew from 437 to 449 routes between 2026-08-13 and 2026-09-30 precisely because nothing enforced this.
4. Watch the `portal.role.insufficient` warnings against real multi-member traffic, then set `AUTH_ROLE_ENFORCE=1` — **only after every item on PUX-231 is closed** (OAuth state purpose-binding, ratchet hardening, publishing-board moves, AI-tool action map, and the rest).

The MCP surface already enforces the same ladder (`lib/mcp/client-scope.ts#roleDenial` imports `ROLE_LEVELS`), so a tool and its REST route must land on the same action; where they disagree, the REST matrix above wins and the tool is corrected.

## Refinements (owner, 2026-09-30 — after the pilot review of #219)
- **Automations stay `admin`** even though members can create rules today. Otherwise the "email send = admin" rule is bypassable: a member could build an automation that sends campaigns. Previews that only compute (schedule preview, email render) are `read`.
- **Personal mailbox connections** (`integrations/{google,microsoft,linkedin}/connect`) are **`write`**, not admin. They link the caller's own account but feed its mail into the company's shared CRM/Brain, so viewers shouldn't. **Disconnect and status are exempt**: revoking your own grant is never role-gated. Company-level credentials (API keys, OAuth clients) stay `admin`.
- **A project Editor grant wins for that project's board.** A company Viewer whom an admin makes an Editor on one project can edit that board; card routes skip the company-role gate where the project grants edit.
- **Invites move to the membership** (token hash, expiry, `accepted_at` on the membership, not the user). Existing users accept by logging in, and seats count accepted memberships. Tracked on PUX-227/PUX-228.
- The July `docs/design/auth79-020-role-matrix.md` had automations at `write`, billing reads at `read`, and API-key listing at `read`. **This ADR supersedes it**; that doc is reconciled to match.

## Rejected alternatives
- **Custom roles or per-resource ACLs.** More expressive, but a new permissions model on top of 585 routes, when the missing piece was only a decision over the model we have.
- **Gate by HTTP method alone** (GET = read, everything else = write). Cheap, but it cannot express the areas that must be `admin` — domains, webhooks, API keys, email send — and would quietly hand them to every member.
- **Enforce immediately, skipping log-only.** Would break real multi-member tenants on the day of the sweep with no warning. The observe mode exists so the first evidence of a wrong mapping is a log line, not a locked-out customer.

## Consequences
- A `viewer` becomes genuinely read-only; `member` stops being able to change the company's integrations, keys, domains or billing.
- Every new portal route now needs an explicit action — the CI check makes forgetting it a red build rather than a silent privilege gap.
- Where a real customer relies on a member doing an admin-level task, the log-only phase surfaces it before enforcement; the remedy is promoting that person, not loosening the matrix.
