# AUTH79-020 — Role Permission Matrix (sweep annotation reference)

> Superseded where it differs by ADR portal-role-matrix (2026-09-30): `vault/04 - Decisions/ADR portal-role-matrix.md`. The rows below were reconciled to it on 2026-09-30.

The authoritative `action` level to annotate each portal route with during the AUTH79-020 sweep. Derived from the owner-approved model:

> **viewer** = read-only everywhere · **member** = read + write *content* · **admin** = member + owns *settings/team/billing/integrations/branding/publishing* · **owner** = admin + *destructive/ownership* actions.

Levels map onto `authorizePortal`/`authorizePortalSite`'s existing `ACTION_REQUIRED_LEVEL`: `read` (viewer+), `write` (member+), `admin` (admin+), `owner` (owner only). Annotate GET/read handlers `read`; use the table below for mutations. When a route file mixes methods, gate each method at its own level (split the guard call per handler).

## Default rule (applies unless the table below overrides)

- **GET / list / read** → `read`
- **POST / PUT / PATCH / DELETE on content** → `write`
- **Anything touching account settings, other members, money, external connections, brand identity, or going-live** → `admin`
- **Deleting the client/site or transferring ownership** → `owner`

## Matrix by area

| Area (path prefix) | Operation | Action | Notes |
|---|---|---|---|
| `crm/**` (contacts, companies, deals, activities, notes) | read / create / update / delete records | `read` / `write` | Core content — members manage it |
| `crm/pipelines`, `crm/custom-fields`, `crm/scoring-rules` | configure structure | `admin` | Schema/config, not per-record content |
| `crm/contracts/**` (esign) | read / send / void contracts | `read` / `write` | Also `requireService: 'esign'` |
| `projects/**`, `cards/**`, `sprints/**` | read / create / update / move / delete | `read` / `write` | Board content. A project **Editor grant** (`canUserEditProject`) wins for that project's board content: it is honoured on top of, not instead of, the company role |
| `projects/[id]` delete, project settings | delete / settings | `admin` | |
| `websites/[siteId]/posts|pages|nav|media` | read / create / edit / delete content | `read` / `write` | Site content (use `authorizePortalSite`) |
| `websites/[siteId]/domains/**` | add / verify / remove domain | `admin` | Infra/config |
| `websites/[siteId]/custom-code`, `settings`, publish | edit code / settings / publish live | `admin` | Going-live + code = admin |
| `cms/websites/[siteId]/block-templates|media|code` | read / write content | `read` / `write` | |
| `cms/websites/[siteId]/**` publish / settings | publish / configure | `admin` | |
| `websites/[siteId]/store/products|orders|inventory|categories|discounts` | read / manage | `read` / `write` | Store content — also `requireService: 'store'` |
| `websites/[siteId]/store/settings|stripe|stripe-connect|payment|easypost` | payment / store config | `admin` | Money config |
| `branding/**` | read / update brand identity | `read` / `admin` | **Model: admins own branding** — writes are `admin` |
| `chat/**` | read / reply | `read` / `write` | |
| `chat/**` widget config | configure widget | `admin` | |
| `surveys/**`, `decks/**`, `email/** (campaigns/lists/subscribers)` | read / create / edit | `read` / `write` | Content; also `requireService` where applicable |
| `email/**` send campaign | send | `admin` | Higher-privilege than editing (mirrors `email:send` scope) |
| `bookings/** (tools/booking)` | read / manage pages & bookings | `read` / `write` | `requireService: 'booking'` |
| `automations/**` | read / create / toggle / edit | `read` / `admin` | Automations, workflows and trigger links act *as* the company, so create/edit/toggle = `admin`. A preview that only computes (e.g. `preview-schedule`) stays `read` |
| `media/**` | list / upload / delete | `read` / `write` | |
| `approvals/**` | read | `read` | |
| `approvals/** approve|reject|bulk` | approve/reject changes | `admin` | Mirrors `approvals:manage` scope |
| `team/**`, `settings/team/**` | list / invite / change role / remove | `read` / `admin` | Managing other members = admin |
| `settings/team` transfer ownership, delete member-owner | transfer / delete owner | `owner` | |
| `integrations/**`, `*/connect` | list / connect / disconnect | see notes | `{google,microsoft,linkedin}/connect` = `write` (links the caller's OWN account, but feeds the company's shared CRM/Brain, so not viewers). `*/disconnect` and `*/status` = **exempt** (the caller's own `(clientId,userId)` grant; revoking your own grant is never role-gated). Company credentials (API keys, OAuth clients) = `admin`, listings included. Callbacks excluded |
| `billing/**` | read invoices / entitlements / payment methods | `admin` | Billing is `admin` even to read; viewers and members do not see it |
| `billing/** checkout|modules|add-item|customer-portal` | checkout / manage subscription | `admin` | Money |
| `billing/** plan change|cancel`, AI-credit purchase | change or cancel the plan, buy credits | `owner` | Owner only |
| `settings/api-keys/**` | list / create / revoke keys | `admin` | Credential mgmt; the listing is `admin` too |
| `settings/webhooks/**`, `*/webhooks/**` | list / create / rotate-secret / delete | `read` / `admin` | Rotating a signing secret = admin |
| `settings/**` (general profile-of-client, prefs) | read / update | `read` / `write` | Non-sensitive client settings |
| `hosting/**` | read status | `read` | Only `hosting:read` exists |
| `agency/branding|white-label|custom-domain(/verify)` | read / manage | `read` / `admin` | Already hand-roll owner/admin — consolidate onto `authorizePortal({action:'admin'})` |
| delete-client, transfer-ownership (wherever they live) | destructive | `owner` | |

## Excluded from the sweep (not a role gap)
See `auth79-020-role-enforcement.md` §7 — public/pre-session routes, identity-level routes (own user / switch-client / mfa / impersonate), OAuth `*/callback/*` (signed-state), and `publishing/**` (own permission system). The `*/connect` initiation routes ARE in scope (gate `admin`).

## How to apply during the sweep
1. For a **client-scoped** route that resolves its company with raw `auth()` + `getPortalClient(userId)`: KEEP that resolution and add `const denied = await gatePortalRole(userId, client, <action from table>); if (denied) return denied;` right after the null check (log-only by default). Do **not** swap it for `authorizePortal`: that also accepts bearer tokens, which would quietly open a session-only route to API keys. Use `authorizePortal({ action, observeRole: true, requireService })` only on routes that already call `authorizePortal`.
2. For a **site-scoped** `[siteId]` route: replace `auth()` + `resolvePortalSite`/`resolveClientSite` with `authorizePortalSite({ siteId, action: <from table> })` (observeRole defaults true).
3. Keep every downstream use of the resolved `client`/`site`/`userId`; a gate adds a role check and changes nothing else about the route.
4. Typecheck, then run `bun run check:role-gates` (`scripts/check-portal-role-gates.ts`): a gated route must leave the baseline (`--write-baseline` drops it; the list only shrinks), and a route that needs no role gate goes in its `EXEMPT` map with a verified reason.
5. Leave enforcement OFF (`AUTH_ROLE_ENFORCE` unset) until the whole sweep lands and the `portal.role.insufficient` logs are clean of false-denials.
