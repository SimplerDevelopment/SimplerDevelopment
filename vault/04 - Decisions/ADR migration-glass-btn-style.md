---
type: adr
domain: sites-hosting
status: accepted
date: 2026-06-12
sources:
  - scripts/migrations/goscribble/_brand.ts
  - scripts/migrations/goscribble/COLOR-MAP.md
---

# ADR: Dark-section secondary buttons require an explicit glass style when branding primaryText equals the section background

## Status

Accepted — established during Scribble (goscribble.ai) migration, 2026-06-12.

## Context

The Scribble brand uses navy (`#0C1F3F`) as both the primary brand color and `secondaryText`. Several page sections use a navy background. The platform's branding system derives button text from `secondaryText`, which caused secondary buttons on navy sections to render with navy text on a navy background — invisible to users.

This is a class of bug that will recur whenever a client's `secondaryText` matches their dominant background color.

## Decision

**When a migration's `secondaryText` matches the dominant dark-section background, define an explicit `GLASS_BTN_STYLE` constant in the migration's `_brand.ts` helper and apply it to all secondary buttons that appear on dark sections.**

The glass style uses white text on a semi-transparent frosted background (e.g. `rgba(255,255,255,0.15)` bg + `#FFFFFF` text + `1px solid rgba(255,255,255,0.3)` border), producing readable contrast against any dark background regardless of branding token values.

For the Scribble migration, `GLASS_BTN_STYLE` is defined in `scripts/migrations/goscribble/_brand.ts` and referenced by all dark-section import scripts.

## Consequences

- Secondary buttons on dark sections are always legible, even when the branding system's `secondaryText` is a dark color.
- The constant lives in `_brand.ts` (migration-scoped) — it is not a platform-level change. If this pattern becomes frequent enough, the platform's branding system should be extended to support a `darkSectionSecondaryButtonStyle` token natively.
- Future migrations using a dark primary color with `secondaryText` derived from it should check for this condition early (the `COLOR-MAP.md` audit step is the right place).

## Alternatives considered

- **Override `secondaryText` in the branding profile** — rejected: would affect all contexts, not just dark sections, and would misrepresent the client's brand.
- **Use `primaryText` (white) as the button text color** — rejected: conflates primary and secondary button semantics; glass style preserves visual distinction while solving the contrast problem.

## Related

- [[Agency, Onboarding & Branding]]
- [[Sites, Hosting & Publishing]]
- [[Scribble Site Migration]]
