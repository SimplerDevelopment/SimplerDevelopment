---
type: spec
domain: portal-websites
status: planned
date: 2026-07-08
sku: VEQA-005
sources:
  - app/portal/websites/[siteId]/page.tsx
  - components/portal/dashboard/WidgetBoard.tsx
  - components/portal/dashboard/WidgetShell.tsx
  - components/portal/dashboard/widgets/index.tsx
  - app/portal/dashboard/page.tsx
---

# VEQA-005 — Website Dashboard Widgetization

**Goal:** bring the per-site dashboard (`/portal/websites/[siteId]`) to parity with
the main portal dashboard — drag-drop, hide/show, collapsible widgets — reusing
the widget infrastructure shipped for VEQA-002, rather than a second bespoke system.

## Current state

`app/portal/websites/[siteId]/page.tsx` is a **static server component**: 4 fixed
stat cards, 4 static `DashboardLinkGroup` grids, a static Recent-Entries list, an
API-keys panel, and a static content-type breakdown table. It shares nothing with
the main dashboard's widget system.

The main dashboard already has the reusable pieces (VEQA-002, commit `9283fe66`):
- `components/portal/dashboard/WidgetBoard.tsx` — dnd-kit board: drag/reorder,
  hide/show, collapse, "Screen Options" search + group-by panel. Persists layout.
- `components/portal/dashboard/WidgetShell.tsx` — per-widget chrome (header, body).
- `components/portal/dashboard/widgets/index.tsx` — registry of 26 widgets.
- `app/portal/dashboard/page.tsx:132-156` — wiring reference.

## Approach (reuse, don't rebuild)

1. **Extract a site-scoped widget registry.** The existing widgets are client-wide.
   Add a `siteWidgets` registry (same shape as `widgets/index.tsx`) for site-scoped
   cards: Site Stats, Recent Entries, Content-Type Breakdown, API Keys, Quick Links,
   Publishing shortcuts. Reuse `WidgetShell` verbatim.
2. **Parameterize `WidgetBoard`** to accept a registry + a layout-persistence key.
   Today it implicitly targets the main dashboard; make the registry and the
   prefs key (`layoutScope: 'dashboard' | 'website:<siteId>'`) props so one board
   component drives both surfaces. This is the load-bearing refactor.
3. **Layout persistence.** The main board persists per-user layout; extend the
   store key to include `siteId` so each site remembers its own arrangement.
   (Confirm where the main board persists — user prefs row vs localStorage — and
   mirror it. If server-persisted, this is a data-access change → `bun test:tenancy`.)
4. **Convert the page** `app/portal/websites/[siteId]/page.tsx` to render
   `<WidgetBoard registry={siteWidgets} layoutScope={`website:${siteId}`} />`,
   moving each static block into a widget. Keep server-side data fetching; pass
   fetched data into widgets as props (or fetch inside client widgets via existing
   `/api/portal/...` endpoints — match how the main dashboard widgets get data).

## Files to touch

- `components/portal/dashboard/WidgetBoard.tsx` — accept `registry` + `layoutScope` props (refactor; keep main dashboard call working).
- `components/portal/dashboard/widgets/` — add site-scoped widgets (new `site-*.tsx` + register).
- `app/portal/websites/[siteId]/page.tsx` — swap static layout for `WidgetBoard`.
- (maybe) the layout-prefs persistence path — extend key with `siteId`.

## Risks / gotchas

- **Layout persistence scope** is the main correctness risk — a shared key would
  make every site show the same layout. Must key by `siteId` (+ userId).
- If persistence is server-side, it's a data-access change → run `bun test:tenancy`.
- Don't fork `WidgetBoard`; a second copy re-introduces the drift VEQA-002 removed.
- Some site widgets need server data (Recent Entries) — decide props-in vs
  client-fetch per the main dashboard's existing pattern; don't invent a third.

## Effort

Medium–large (multi-day). The `WidgetBoard` parameterization + site widget
registry is the bulk; the page swap is mechanical once those exist.

## Verification

`tsc` + eslint; `bun test:tenancy` if layout persistence is server-side; visual QA
that drag/hide/collapse works per-site and layouts are independent across sites.
