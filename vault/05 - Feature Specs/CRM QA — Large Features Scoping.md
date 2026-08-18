---
type: spec
domain: crm
status: proposed
date: 2026-07-09
tags: [crm, scoping, qa, project-174, dashboard, artifacts, import-export]
sources:
  - app/portal/crm/page.tsx
  - app/api/portal/crm/deals/[id]/artifacts/route.ts
  - app/api/portal/crm/deals/[id]/artifacts/available/route.ts
  - lib/db/schema/crm.ts
  - app/api/portal/crm/contacts/route.ts
  - app/api/portal/crm/companies/route.ts
---

# CRM QA — Large-Features Scoping (Project 174)

Scoping-before-build for the three large cards from the CRM QA session that were **not** auto-implemented (per decision 2026-07-09: "scope first, then build"). The bug fixes and small features from the same board shipped to Validating; these three each need a build-vs-priority decision because they're multi-day and unverifiable headless.

Effort key: **S** ≈ <½ day, **M** ≈ 1–2 days, **L** ≈ 3+ days.

---

## CRM79-002 — Drag-and-drop dashboard widget arrangement

**Goal:** let a user rearrange the CRM dashboard's widgets and have the order persist.

**Current state:** `app/portal/crm/page.tsx` (351 lines) renders a **fixed** widget layout — top metric cards, a Revenue line chart + Win/Loss donut, a pipeline funnel, a recent-deals table — all hardcoded in a static grid with per-widget `lg:col-span-*`. No ordering state, no persistence. The repo already ships `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, so no new dependency is needed.

**Proposed approach:**
1. Refactor the hardcoded sections into a `WIDGETS` array (`{ id, span, render }`), driven by an `order: string[]` state.
2. Wrap in `<DndContext><SortableContext>`; each widget becomes a `useSortable` item with a drag handle.
3. Persist the order (see decision below).

**Persistence — DECISION NEEDED:**
- **A. localStorage** (per-device, zero backend) — S effort, ships in hours, but order doesn't follow the user across devices.
- **B. server-side user preference** (a `crm_dashboard_layout` JSON on a per-user prefs table, or a new tiny table keyed by `userId`+`clientId`) — M effort, cross-device, needs a GET/PUT endpoint + migration.

**Risks:** widgets have heterogeneous grid spans; free reordering needs a normalized span model or a fixed set of "slots." Charts are SVG sized by their container — reflow on reorder is mostly fine but wants a visual check. Responsive (mobile) reorder UX is fiddly.

**Effort:** **M** (localStorage variant closer to **S**). **Recommendation:** ship the localStorage variant first (fast, satisfies the QA ask), add server-side persistence only if cross-device is requested.

---

## CRM79-016 — Artifacts on companies/contacts + seen/opened tracking

**Goal:** attach SD assets (sites, emails, decks, proposals, bookings, surveys, projects) to **companies and contacts** (not just deals), and show a "seen/opened" indicator per linked artifact.

**Current state:** artifacts exist **only for deals** — `crmDealArtifacts` table + `/api/portal/crm/deals/[id]/artifacts` (+ `/available`) + the deal drawer's Artifacts tab. The whole picker/type-aggregation machinery (`fetchType` over 8 asset tables, `ARTIFACT_LABELS/ICONS`) is deal-scoped and reusable in shape.

**Proposed approach:**
1. **Schema:** two new tables mirroring `crmDealArtifacts` — `crmCompanyArtifacts` (`companyId`) and `crmContactArtifacts` (`contactId`) — OR one polymorphic `crmArtifacts (entityType, entityId, clientId, artifactType, artifactId, …)`. Recommend the **polymorphic** table to avoid triplicating routes/UI (deal, company, contact). Migration required (`bun run db:generate` + hand-apply per the drift convention).
2. **Endpoints:** generalize the deal artifacts route to `/api/portal/crm/{entity}/[id]/artifacts` (+ `/available`), tenant-scoped by `clientId`, entitlement-gated like the deal route.
3. **UI:** reuse the deal drawer's Artifacts panel as a shared component on the company + contact detail pages.
4. **Seen/opened tracking (the harder half):** add `lastViewedAt` / a `crm_artifact_views` log; requires the public artifact routes (or a redirect endpoint) to record a view when the linked asset is opened. This is a genuinely separate sub-feature — recommend splitting it out.

**Risks:** the polymorphic-vs-per-entity table call is load-bearing (affects every downstream query). View-tracking touches the public-facing asset routes (sites/decks/etc.) which are outside CRM — cross-cutting. Tenancy: every new query must filter `clientId` (run `bun test:tenancy`).

**Effort:** **L** (artifacts-on-entities alone ≈ M; +view-tracking pushes to L). **Recommendation:** phase it — Phase 1 polymorphic artifacts on companies/contacts (reuses deal UI); Phase 2 seen/opened tracking as its own card.

---

## CRM79-017 — Companies/contacts bulk CSV import + export

**Goal:** bulk-import companies and contacts from CSV, and export them to CSV.

**Current state:** none. Contacts/companies are created one-at-a-time via the detail-page forms + `POST /api/portal/crm/{contacts,companies}`. No import/export anywhere in CRM.

**Proposed approach:**
1. **Export (easy first):** `GET /api/portal/crm/{contacts,companies}/export` → streams a CSV of the client's rows (tenant-scoped), respecting current filters. UI: an "Export CSV" button on the list pages. **S–M.**
2. **Import:** `POST …/import` accepting an uploaded CSV; parse (a CSV lib or a small hand-rolled parser), **column-mapping UI** (map CSV headers → fields), per-row validation, and a batched, `clientId`-scoped insert with a result summary (created / skipped / errored rows). Handle dedupe (by email/domain) and custom-field columns. **M–L.**
3. Reuse the existing create-validation from the POST routes so import and manual create stay consistent.

**Risks:** import is the classic "80% is edge cases" feature — encoding, malformed rows, partial-failure reporting, dedupe policy, custom-field mapping, and **tenancy on every inserted row**. Large files need streaming/batching, not a single transaction. Column-mapping UI is real front-end work.

**Effort:** **L** overall (export alone is **S–M** and independently shippable). **Recommendation:** ship **export first** (quick win, low risk), then scope import as its own card with an explicit dedupe + error-reporting policy.

---

## Cross-cutting notes

- All three add tenant-scoped data access → each needs `bun test:tenancy` before merge, and 016/017 add write paths that must clear the CRM entitlement gate (`hasServiceAccess(clientId, 'crm')`), matching the existing deal/activity routes.
- 016 + 017 both need migrations; follow the `drizzle/900x_*_manual.sql` hand-written convention (the tracker is drifted — see `lib/db/CLAUDE.md`) and hand-apply to staging/prod at deploy.
- Suggested build order if greenlit: **CRM79-017 export** (S) → **CRM79-002 localStorage** (S) → **CRM79-016 Phase 1** (M) → **CRM79-017 import** (M–L) → **CRM79-016 view-tracking** (M) → **CRM79-002 server persistence** (S, optional).
