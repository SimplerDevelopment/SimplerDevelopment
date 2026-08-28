---
type: adr
domain: portal
status: accepted
date: 2026-08-28
sources:
  - lib/feature-flags.ts
  - components/portal/FeatureFlagsProvider.tsx
  - components/portal/portal-ui.ts
  - components/portal/EmptyState.tsx
  - components/portal/StudioTable.tsx
  - .file-budget.baseline.json
---

# ADR: The portal redesign ships as flag-gated branches that leave flag-off DOM byte-identical

## Status

Accepted — implemented across PUX-144…PUX-215 (design doc PUX-134, "Simpler Portal Redesign", 79 screens), 2026-08-27/28.

## Context

The redesign touches ~70 portal pages, several of which are pinned god files (`.file-budget.baseline.json`: they may shrink, never grow) with large legacy unit suites. Every tenant except the flagged ones must keep the UI they have today, and the sweep had to land as one reviewable stack rather than a rewrite.

## Decision

1. **One per-client flag, `portal-redesign`, gates everything.** Server pages read `hasFlag(client, 'portal-redesign')` on the client row `getPortalClient` / `resolvePortalSite` already loads; client components read `useFeatureFlag('portal-redesign')`, which fails closed outside the portal provider (so the admin tree never sees studio markup).
2. **Flag-off DOM is byte-identical, not merely equivalent.** Legacy JSX is never restyled in place: it becomes the `else` branch, a `legacy=` prop on `EmptyState`/`GhostCard`, a `const` the two branches share (`renderCard`, `renderRow`, `gridAndPaging`), or a fragment-returning wrapper (`StudioCard`). Class strings are switched with `studio ? sBtn : pBtnPrimary`, never rewritten.
3. **Pinned files are extracted before they are touched.** A Sonnet worker moves a region verbatim into `_components/` (props sized to what the region reads), the legacy suite must stay green with no test edits, then the flag layer is added. Growth past a pin is a gate failure, not a re-baseline.
4. **One teal per page** (`sBtn`); everything else is `sBtnGhost`. Gold (`--studio-gold-*`) is reserved for the Brain. Lists use `StudioTable`; empty surfaces are previews with a button (`EmptyState`, `GhostCard`, `Ghost`).
5. **Honest omissions beat invented data.** When the design doc assumes a column, route or behaviour that does not exist (per-deal scores, SSL fields, agency-staff links, chat→ticket provenance, post previews for staged payloads, run counts…), the card records the gap and the UI draws a ghost or a note. Nothing is fabricated to match the mock.
6. **Every card leaves one runnable check** — a pure helper with a unit test plus a studio render test — and every new scoped read is flagged for the CI tenancy job before it can move to Shipped (`bun test:tenancy` is CI-only locally).

## Alternatives rejected

- **A second route tree (`/portal2`)** — would have doubled data access and drifted; the flag keeps one code path per read.
- **Restyling legacy markup in place behind the flag** — cheaper to write, impossible to prove byte-identical, and every legacy suite would have needed edits.
- **Re-baselining god files** — hides growth; extraction shrinks them and pays down the debt the pin exists to expose.

## Consequences

- ~45 stacked branches `feat/pux-144-empty-state` → `feat/pux-215-chat`, each one card, each gated green (eslint, file budget, vitest, tsc) before push.
- Flag-on QA happens per client (client 104 first) with no risk to unflagged tenants; removing the flag later means deleting `else` branches, not rewriting pages.
- The card trail (findings, omissions, gates) is on the master board (project 153), not in prose.
