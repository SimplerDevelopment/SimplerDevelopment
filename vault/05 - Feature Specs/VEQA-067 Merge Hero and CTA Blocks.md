---
type: spec
domain: blocks
status: planned
date: 2026-07-08
sku: VEQA-067
sources:
  - lib/blocks/registry.ts
  - components/blocks/render/HeroBlockRender.tsx
  - components/blocks/render/CtaBlockRender.tsx
  - components/portal/visual-editor/_components/block-panels/HeroPanel.tsx
  - types/blocks/components.ts
---

# VEQA-067 — Merge Hero + CTA into a single "hero cta" block

> **Survey decision:** full merge. **This spec is the plan, not the change** —
> agreed to plan first because a full merge is a **cross-tenant content
> migration** that rewrites existing block JSON on every site. Do not implement
> ad hoc.

## Why this is risky (read before coding)

`hero` and `cta` are two registered block types (`lib/blocks/registry.ts:47,50`),
each with its own render component (`HeroBlockRender.tsx`, `CtaBlockRender.tsx`),
overlapping-but-different field sets (Hero: title/subtitle/description/ctaText/
ctaLink/2nd CTA/bgImage/bgVideo; CTA: title/description/primaryButton*/
secondaryButton*), and a shared editor panel (`HeroPanel.tsx` branches on
`block.type`). **Every existing `hero` and `cta` block lives as JSON inside
`posts.content` across every tenant site.** Merging the types means those stored
blocks must be migrated or kept renderable forever, or tenant pages break.

## Two viable strategies

### A. Lazy / back-compat (recommended, lower risk)
Introduce the unified `hero-cta` type for **new** blocks; keep `hero` and `cta`
as **render-only aliases** that map onto the unified renderer. No content
rewrite — old blocks keep their `type` and render through a compatibility shim.
- Pros: zero migration risk, reversible, ship incrementally.
- Cons: three type strings linger in data; registry keeps aliases.

### B. Big-bang migration (what "full merge" literally implies)
Add `hero-cta`, write a migration that rewrites every `hero`/`cta` block in
`posts.content` to the new type + unified field names, across all sites.
- Pros: clean single type going forward.
- Cons: **irreversible content rewrite**; must be idempotent, backed up, and
  tenancy-verified; a bug corrupts live tenant pages.

**Recommendation:** do **A first** (unified type + aliases, no data rewrite),
then optionally a **B migration later** once the unified renderer is proven in
production. This gets the "one block" UX without betting tenant content on a
one-shot migration.

## Field unification

Define the `hero-cta` field set as the superset, with a canonical naming:
`title`, `subtitle?`, `description`, `primaryButtonText/Url`,
`secondaryButtonText/Url`, `backgroundImage?`, `backgroundVideo?`, plus a
`layout` variant (`hero` vs `banner`) to preserve both looks. Map old fields:
`ctaText/ctaLink → primaryButton*`, `primaryButtonText/Url → same`.

## Work breakdown

1. **Type** — add `HeroCtaBlock` to `types/blocks/components.ts` (superset fields + `layout` variant); keep `HeroBlock`/`CtaBlock` for back-compat.
2. **Registry** — add `hero-cta` in `lib/blocks/registry.ts`; mark `hero`/`cta` legacy (strategy A: keep for render; hide from the picker).
3. **Render** — one `HeroCtaBlockRender`; `HeroBlockRender`/`CtaBlockRender` become thin adapters that normalize old fields → unified props and delegate.
4. **Editor** — unified panel in `HeroPanel.tsx` (single field set + a `layout` toggle); route `hero`/`cta`/`hero-cta` to it.
5. **(Strategy B only)** migration script under `scripts/` + a Drizzle data migration: idempotent rewrite of `posts.content` blocks; dry-run + row-count report; **`bun test:tenancy` mandatory**; back up affected posts first.
6. **Production renderer** (`app/sites/...`) case + `/api/blocks` metadata move in lockstep (per the "blocks are universal" invariant) — use `simplerdev-block-type` conventions.

## Risks / gotchas

- **Content in `posts.content` is the crown-jewel risk.** Prefer strategy A; if B, make the script idempotent + reversible + tenancy-tested, and run only via the migration process (never hand-`psql` prod).
- Keep old type strings renderable regardless of strategy — some tenants may have `hero`/`cta` blocks for a long time.
- Registry + render + editor + production renderer + `/api/blocks` move **together** (blocks-are-universal invariant).

## Effort

Large (multi-day). Strategy A is the safe MVP; strategy B adds a migration
sub-project. Recommend shipping A, then deciding on B with real usage data.

## Verification

`tsc` + eslint; render both legacy `hero`/`cta` and new `hero-cta` blocks and
confirm identical output; `bun test:tenancy` (mandatory if B); visual QA of the
unified editor panel + both layout variants.
