# app/portal — Agent Notes

Per-tenant client UI tree. **One of three audiences** — see root `CLAUDE.md`.

> Token budget: keep this file <80 lines. Body lives in pointed-to guides.

## What lives here

- Routes under `app/portal/**` are authenticated portal pages — each is scoped to the active tenant.
- Tenant resolution: every server component / route handler resolves the active site/client through `lib/active-client.ts` + site-resolver middleware. **Never read `clientId` from a query param** — always derive it from the session + resolver.
- `PortalLayoutClient.tsx` + `PortalShell.tsx` provide chrome. Page-level files compose against them.
- Most CRUD lives at `app/portal/websites/[siteId]/<resource>/`. Top-level (`crm/`, `brain/`, `inbox/`, …) is *cross-site* tenant data.

## Load-bearing invariants

- **Site param vs. resolver:** for `app/portal/websites/[siteId]/**`, the URL's `[siteId]` MUST be cross-checked against the resolver — a portal user can have multiple sites; the URL is just navigation. Routes that trust the URL alone leak data.
- **API envelope:** every route handler under `app/api/portal/**` returns `{ success, data | error }`. Mismatch breaks the portal client wrappers.
- **No client-specific code paths in the tree.** If you're tempted to write `if (clientId === 100)`, stop — that belongs in `lib/branding/` or a feature flag.
- **Material Icons over emojis** in rendered UI.

## Workflows — prefer over hand-rolling

| Task | Use |
|---|---|
| New CRUD resource | `simplerdev-feature-scaffold` (schema + route + e2e), then `simplerdev-ui-scaffold` for pages |
| New portal page only | `simplerdev-ui-scaffold` |
| Audit a portal section | spawn a subagent — these pages average 800–1400 lines |

## God-file warning

Several pages exceed 1000 lines. **Do not Read them into the main thread; spawn an `Explore` subagent first** for a structured summary:

- `app/portal/brain/automations/page.tsx` (1504)
- `app/portal/tools/pitch-decks/[id]/page.tsx` (1457)
- `app/portal/websites/[siteId]/store/products/[productId]/page.tsx` (1410)
- `app/portal/websites/[siteId]/store/settings/page.tsx` (1551)
- `app/portal/brain/tasks/page.tsx` (1221)
- `app/portal/websites/[siteId]/branding/page.tsx` (1125)

## When in doubt

- Routing/scoping → `lib/active-client.ts`, `middleware.ts`
- Tenancy regressions → `bun test:tenancy` after any data-access change
- Page-level UX/style → `components/portal/**`, `components/ui/**`

## Pointers

- `@USER_MANAGEMENT.md` — auth, roles, scopes
- `@DATABASE.md` — schema overview (read when you touch a query)
- `@tests/CI-GATES.md` — coverage floors per area
