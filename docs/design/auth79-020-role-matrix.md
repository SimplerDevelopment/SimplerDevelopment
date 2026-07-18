# AUTH79-020 — Role Permission Matrix (sweep annotation reference)

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
| `projects/**`, `cards/**`, `sprints/**` | read / create / update / move / delete | `read` / `write` | Board content |
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
| `automations/**` | read / create / toggle | `read` / `write` | |
| `media/**` | list / upload / delete | `read` / `write` | |
| `approvals/**` | read | `read` | |
| `approvals/** approve|reject|bulk` | approve/reject changes | `admin` | Mirrors `approvals:manage` scope |
| `team/**`, `settings/team/**` | list / invite / change role / remove | `read` / `admin` | Managing other members = admin |
| `settings/team` transfer ownership, delete member-owner | transfer / delete owner | `owner` | |
| `integrations/**`, `*/connect` | list / connect / disconnect | `read` / `admin` | External connections = admin (callbacks excluded) |
| `billing/**` | read invoices/entitlements | `read` | |
| `billing/** checkout|cancel|modules|add-item|customer-portal` | change subscription | `admin` | Money |
| `settings/api-keys/**` | list / create / revoke keys | `read` / `admin` | Credential mgmt |
| `settings/webhooks/**`, `*/webhooks/**` | list / create / rotate-secret / delete | `read` / `admin` | Rotating a signing secret = admin |
| `settings/**` (general profile-of-client, prefs) | read / update | `read` / `write` | Non-sensitive client settings |
| `hosting/**` | read status | `read` | Only `hosting:read` exists |
| `agency/branding|white-label|custom-domain(/verify)` | read / manage | `read` / `admin` | Already hand-roll owner/admin — consolidate onto `authorizePortal({action:'admin'})` |
| delete-client, transfer-ownership (wherever they live) | destructive | `owner` | |

## Excluded from the sweep (not a role gap)
See `auth79-020-role-enforcement.md` §7 — public/pre-session routes, identity-level routes (own user / switch-client / mfa / impersonate), OAuth `*/callback/*` (signed-state), and `publishing/**` (own permission system). The `*/connect` initiation routes ARE in scope (gate `admin`).

## How to apply during the sweep
1. For a **client-scoped** route: replace `auth()` + `getPortalClient` with `authorizePortal({ action: <from table>, observeRole: true })` (add `requireService` where the area needs a subscription — see the existing service gates).
2. For a **site-scoped** `[siteId]` route: replace `auth()` + `resolvePortalSite`/`resolveClientSite` with `authorizePortalSite({ siteId, action: <from table> })` (observeRole defaults true).
3. Keep every downstream use of the returned `client`/`site`/`userId`.
4. Typecheck; the `check-portal-authz.ts` count drops as routes are converted.
5. Leave enforcement OFF (`AUTH_ROLE_ENFORCE` unset) until the whole sweep lands and the `portal.role.insufficient` logs are clean of false-denials.
