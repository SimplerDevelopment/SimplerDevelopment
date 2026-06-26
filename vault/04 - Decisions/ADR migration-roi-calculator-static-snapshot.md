---
type: adr
domain: sites-hosting
status: proposed
date: 2026-06-12
sources:
  - scripts/migrations/<client>/WORKER-BRIEF.md
  - scripts/migrations/<client>/import-home.ts
---

# ADR: Client-specific interactive widgets are captured as static snapshots pending a universal block decision

## Status

Proposed — flagged during a client site migration, 2026-06-12. Awaiting human decision on universal block strategy.

## Context

A client's home page included an interactive ROI calculator — a dynamic widget that takes user inputs (e.g. number of clinicians, visit volume) and computes savings. The platform's block model requires all block types to be universal (see [[ADR blocks-are-universal]]); a hand-coded client-specific widget in the site renderer would violate this invariant.

During migration, the calculator was captured as a static stats snapshot: the representative output values are hardcoded into a content block rather than computed at runtime. This unblocks the migration without violating the blocks invariant, but it loses the interactive dimension of the original.

## Decision

**Render interactive client-specific widgets as static stat snapshots for the initial migration. Flag explicitly for a human decision before go-live.**

The three options requiring a decision:

1. **Scaffold a universal `ROICalculator` block type** via `simplerdev-block-type` — available to all tenants, configurable with metric names and multipliers. Highest leverage; the right call if multiple clients will need interactive calculators.
2. **Hand-code a client-specific embed** — a one-off React component scoped to the client's site. Violates [[ADR blocks-are-universal]] and sets a precedent for per-client renderer branches.
3. **Keep the static snapshot** — simplest; loses interactivity. Acceptable if the client does not prioritize the calculator on the migrated site.

This ADR documents the deferral. A follow-up ADR (or an update to this one) should record the decision once made.

## Consequences

- The migration is unblocked and the site is visually complete for QA without touching the block registry.
- The static snapshot is a placeholder; the migrated page clearly differs from the source in this section.
- Option 1 (universal block) is the only path consistent with platform invariants. If the human decision is option 2, [[ADR blocks-are-universal]] must be updated with a documented exception and the exception must be scoped carefully (e.g. feature-flagged per siteId at the renderer level, not at the registry level).

## Alternatives considered

- **Embed via iframe** — could host a third-party or custom calculator; keeps the block model clean but adds external dependency and reduces design control.
- **Skip the section entirely** — rejected: the ROI calculator is a key conversion element on the source site.

## Related

- [[ADR blocks-are-universal]]
- [[CMS & Blocks]]
- [[Sites, Hosting & Publishing]]
