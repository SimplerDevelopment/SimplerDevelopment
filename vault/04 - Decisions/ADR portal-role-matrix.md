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
Already built into `lib/portal-auth.ts`; the sweep only has to use it:

1. Guard each ungated route with `authorizePortal({ action, observeRole: true })` (or `authorizePortalSite` for `websites/[siteId]/**`, which defaults to log-only). An insufficient role is logged as `portal.role.insufficient` and still allowed.
2. Fix the 5 read-level write routes in the same pass.
3. Add a CI check: every `app/api/portal/**/route.ts` calls `authorizePortal` / `authorizePortalSite` or sits on the exempt list above, so new routes cannot ship ungated. The gap grew from 437 to 449 routes between 2026-08-13 and 2026-09-30 precisely because nothing enforced this.
4. Watch the `portal.role.insufficient` warnings against real multi-member traffic, then set `AUTH_ROLE_ENFORCE=1`.

The MCP surface already enforces the same ladder (`lib/mcp/client-scope.ts#roleDenial` imports `ROLE_LEVELS`), so a tool and its REST route must land on the same action; where they disagree, the REST matrix above wins and the tool is corrected.

## Rejected alternatives
- **Custom roles or per-resource ACLs.** More expressive, but a new permissions model on top of 585 routes, when the missing piece was only a decision over the model we have.
- **Gate by HTTP method alone** (GET = read, everything else = write). Cheap, but it cannot express the areas that must be `admin` — domains, webhooks, API keys, email send — and would quietly hand them to every member.
- **Enforce immediately, skipping log-only.** Would break real multi-member tenants on the day of the sweep with no warning. The observe mode exists so the first evidence of a wrong mapping is a log line, not a locked-out customer.

## Consequences
- A `viewer` becomes genuinely read-only; `member` stops being able to change the company's integrations, keys, domains or billing.
- Every new portal route now needs an explicit action — the CI check makes forgetting it a red build rather than a silent privilege gap.
- Where a real customer relies on a member doing an admin-level task, the log-only phase surfaces it before enforcement; the remedy is promoting that person, not loosening the matrix.
