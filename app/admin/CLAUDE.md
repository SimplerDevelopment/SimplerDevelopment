# app/admin — Agent Notes

Global internal panel — our staff UI for managing all tenants, CRM, billing, AI, and platform health. **One of three audiences** — see root `CLAUDE.md`.

> Token budget: keep this file <80 lines. Body lives in pointed-to guides.

## What lives here

- Routes under `app/admin/**` are **global** (not scoped to a tenant). They operate across all clients.
- The `portal-*` prefixed routes (`portal-tickets`, `portal-invoices`, `portal-projects`, etc.) are admin views *over* portal data — same data the client portal sees, but visible to all tenants at once.
- `app/admin/crm/**` — contacts, deals, companies, proposals, contracts (CRM pipeline, no tenant scope).
- `app/admin/email/**` — campaigns, lists, domains (email marketing).
- `app/admin/agentic-os/**` — Claude Code / AI agent orchestration panel.
- Login: `app/admin/login/page.tsx` — credentials via NextAuth `signIn('credentials', ...)`, redirects to `/admin` on success.

## Auth guard

- The shared layout (`layout.tsx`) is a **client component** — it renders chrome (sidebar) but does **not** perform server-side auth checks.
- **Individual RSC pages** must call `requireStaffSession()` (local helper: calls `auth()`, checks `role === 'admin' || role === 'employee'`) and `redirect('/portal/login')` on null. Copy the pattern from `app/admin/clients/page.tsx`.
- Most pages are `'use client'` and fetch on mount via `/api/admin/**` — those routes must enforce auth server-side.
- **No centralized middleware guard for this subtree.** If you add a new RSC page, add `requireStaffSession()` yourself.

## Layout behavior

- Sidebar is suppressed on post edit/new screens (`pathname.includes('/posts/new|edit')`).
- Full-width mode (no max-width container) for `/admin`, `/admin/crm/**`, `/admin/portal-ecommerce`.
- Sidebar collapse state lives in `localStorage('adminSidebarCollapsed')` + a `CustomEvent('sidebarToggle')`.
- Chrome component: `components/admin/AdminSidebar`.

## API routes

All admin API routes live under `/api/admin/**`. Two sub-namespaces:
- `/api/admin/portal/**` — cross-tenant views of portal data (clients, tickets, invoices, etc.)
- `/api/admin/<feature>` — platform-level (dashboard, agentic-os, email, oauth-clients, system-health)

## God-file warning

Do **not** Read these into the main thread — spawn an `Explore` subagent first:

| File | Lines |
|---|---|
| `app/admin/clients/[id]/page.tsx` | 1322 |
| `app/admin/agentic-os/page.tsx` | 888 |
| `app/admin/portal-hosting/page.tsx` | 705 |
| `app/admin/post-types/[id]/fields/page.tsx` | 557 |
| `app/admin/subscriptions/page.tsx` | 554 |
| `app/admin/templates/page.tsx` | 510 |

## Common patterns

- **RSC + client split:** prefer RSC page that calls a lib function directly, passes serialized data to a `*View.tsx` client component. See `clients/page.tsx` + `clients/AdminClientsView.tsx`.
- **`formatCents` / status color helpers** from `lib/portal-utils` are used throughout — don't inline equivalent logic.
- **Material Icons only** in rendered UI (`<span className="material-icons">icon_name</span>`).
- Dashboard fetches `/api/admin/dashboard` — add new metrics there, not as a separate fetch.

## When in doubt

- Auth / roles → `lib/auth.ts`, `USER_MANAGEMENT.md`
- DB queries → `lib/admin/` helpers (e.g. `lib/admin/clients-list.ts`)
- New admin CRUD resource → `simplerdev-feature-scaffold`, then `simplerdev-ui-scaffold`
- Tenancy regressions → `bun test:tenancy` after any data-access change

## Pointers

- `@USER_MANAGEMENT.md` — roles (`admin`, `employee`, `client`), NextAuth config
- `@DATABASE.md` — schema overview
- `@app/portal/CLAUDE.md` — the tenant-scoped counterpart to this tree
- `@tests/CI-GATES.md` — coverage floors
