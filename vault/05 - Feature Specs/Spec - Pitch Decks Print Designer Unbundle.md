---
type: spec
domain: pitch-decks
status: planned
date: 2026-06-25
sources:
  - vault/03 - Domains/Pitch Decks & Product Designer.md
  - lib/db/schema/tools.ts
  - lib/db/schema/productDesigner.ts
  - lib/decks/publish-slide.ts
  - lib/designer/types.ts
  - lib/designer/canvasStore.ts
  - lib/mcp/tools/pitch-decks.ts
  - lib/mcp/tools/storefront.ts
  - lib/portal-nav.ts
  - lib/dashboard/widgets.ts
  - lib/ai/portal-tools/index.ts
  - lib/storefront/designer-auth.ts
  - app/portal/tools/pitch-decks/
  - app/portal/websites/[siteId]/store/products/[productId]/designer/
  - app/sites/[domain]/designer/[productSlug]/
  - app/sites/[domain]/design/[productSlug]/
  - app/api/portal/tools/pitch-decks/
  - app/api/storefront/[siteId]/designs/
  - components/product-designer/
  - components/storefront/designer/
---

# Feature: Pitch Decks / Print Designer Unbundle

## Overview

Split the single vault domain map "Pitch Decks & Product Designer" into two
separate domain maps — one for **AI Pitch Decks** (strategic showcase of the
agent story) and one for **Print/Product Designer** (Fabric.js canvas for
storefront embellishment). In code, **no refactoring is needed**: the tools are
already fully separated across schema, library code, components, routes, MCP
tools, and navigation. The "unbundle" is almost entirely a documentation and
product-positioning exercise, with the side effect of making it trivially easy
to independently invest in, defer, or cut the designer going forward.

Competitive context:
- **AI Pitch Decks** competes with **Gamma, Tome, Pitch.app** — all AI-first
  deck tools. This is a differentiated product for the agent story.
- **Print/Product Designer** competes with **Canva, Adobe Express, Printful's
  built-in designer** — commodity storefront embellishment. Less differentiated;
  fate (invest / defer / cut) should be a standalone call once it's a separate
  product.

## Why Unbundle

The two tools were grouped together in the vault domain map because they were
originally shipped from the same monorepo (the designer was ported from
`~/monorepo/packages/philaprints`) and share the label "creative tools." That
framing creates three problems:

1. **Independent fate decisions are blocked.** Deciding to invest heavily in AI
   Pitch Decks — or to cut the Print Designer — requires understanding which
   work touches which product. A shared domain map obscures the boundary.
2. **On-call surface area is inflated.** An agent reading the domain map to
   work on pitch deck slides gets handed Fabric.js, canvas stores, print-area
   bounds, and design assets — none of which are relevant. Context costs money.
3. **Product positioning is muddied.** Pitch Decks is the strategic story
   (agents generate investor-grade decks via MCP); the Print Designer is a
   B2C storefront widget. They should not share a product identity.

## Current Coupling Map

### Already Separate (the good news — no code changes needed)

| Axis | Pitch Decks | Print/Product Designer |
|---|---|---|
| **Schema** | `lib/db/schema/tools.ts` — `pitch_decks`, `pitch_deck_versions`, `pitch_deck_views` | `lib/db/schema/productDesigner.ts` — `product_styles`, `product_sides`, `design_library_assets`, `product_designs` |
| **Lib** | `lib/decks/publish-slide.ts`, `lib/pitch-deck-migration.ts`, `lib/pitch-deck-versions.ts` | `lib/designer/` (all files: `canvasStore.ts`, `types.ts`, `layerFactory.ts`, `fillResolver.ts`, `fontVirtualizer.ts`, `printAreaCheck.ts`, `printQuality.ts`, `contrastInk.ts`, `aiPromptBuilder.ts`, `aiRateLimit.ts`, `hooks/`) |
| **Components** | `components/pitch-deck/` | `components/product-designer/`, `components/storefront/designer/` |
| **Portal routes** | `app/portal/tools/pitch-decks/` | `app/portal/websites/[siteId]/store/products/[productId]/designer/` |
| **Public routes** | `app/slides/[slug]/`, `app/pitch-deck/[slug]/`, `app/sites/[domain]/slides/` | `app/sites/[domain]/designer/[productSlug]/`, `app/sites/[domain]/design/[productSlug]/` |
| **REST API** | `app/api/portal/tools/pitch-decks/` (11 routes) | `app/api/storefront/[siteId]/designs/` (11 routes), `app/api/portal/websites/[siteId]/store/design-assets/` |
| **MCP tools** | `lib/mcp/tools/pitch-decks.ts` — 12 tools gated on `decks:read`/`decks:write` scope + `pitch-decks` service entitlement | No dedicated MCP tools; designer is driven by REST from the storefront client |
| **Service entitlement** | `pitch-decks` service slug, checked via `requireService(clientId, 'pitch-decks')` in all write tools | No service gate; designer is a feature of `store`/`websites` (always on when `products.designable = true`) |
| **Portal nav** | Under "Tools" → "Pitches & Proposals" with `requiredDomain: 'pitch-decks'` (`lib/portal-nav.ts` line 178) | Embedded under "Websites" → store product management; not a top-level nav entry |
| **Auth** | NextAuth portal session + site-resolver | Storefront customer session or anonymous `sd_design_session` cookie (`lib/storefront/designer-auth.ts`) |
| **Cross-imports** | **Zero** — confirmed by grep. No `lib/designer/` or `components/product-designer/` imports in any deck file | **Zero** — confirmed by grep. No `lib/decks/` or `pitch-deck` imports in any designer file |

### The Actual Coupling (all cosmetic — vault + docs only)

| What | Where | Nature |
|---|---|---|
| Combined vault domain map | `vault/03 - Domains/Pitch Decks & Product Designer.md` | Documentation only — split into two files, done |
| `domain: decks-designer` in domain-map frontmatter | Same file | Rename to `pitch-decks` and `print-designer` respectively |
| Both schemas exported from `lib/db/schema/index.ts` | lines 12 and 16 | Not coupling — all schemas are re-exported here; no change needed |

**Verdict: cosmetically coupled only.** The code is already 100% separated. No
imports to cut, no shared tables to re-key, no shared MCP tool file to split.

## Target Separation

### Product 1: AI Pitch Decks

**New domain map:** `vault/03 - Domains/Pitch Decks.md`

Owns:
- `lib/db/schema/tools.ts` (`pitch_decks`, `pitch_deck_versions`, `pitch_deck_views`)
- `lib/decks/`, `lib/pitch-deck-migration.ts`, `lib/pitch-deck-versions.ts`
- `lib/mcp/tools/pitch-decks.ts` (12 MCP tools)
- `app/portal/tools/pitch-decks/` + all portal editor components
- `app/slides/`, `app/pitch-deck/`, `app/sites/[domain]/slides/`
- `app/api/portal/tools/pitch-decks/`
- `components/pitch-deck/`
- Service entitlement: `pitch-decks`
- Portal nav: "Pitches & Proposals" under Tools

Cross-domain dependencies (keep as-is, already listed in the current domain map):
- CMS & Blocks (shared `Block[]` type, html-embed utilities)
- Branding (theme auto-resolution via `brandingProfiles`)
- Surveys (surveySlide / decisionSlide types embedded in V2 slides)
- Realtime (publishSlidesUpdate for multi-user sync)

### Product 2: Print / Product Designer

**New domain map:** `vault/03 - Domains/Print Designer.md`

Owns:
- `lib/db/schema/productDesigner.ts` (`product_styles`, `product_sides`, `design_library_assets`, `product_designs`)
- `lib/designer/` (all Fabric.js canvas modules)
- `lib/storefront/designer-auth.ts`
- `app/portal/websites/[siteId]/store/products/[productId]/designer/`
- `app/sites/[domain]/designer/[productSlug]/`, `app/sites/[domain]/design/[productSlug]/`
- `app/api/storefront/[siteId]/designs/` (all 11 routes)
- `app/api/portal/websites/[siteId]/store/design-assets/`
- `components/product-designer/`, `components/storefront/designer/`
- Service gate: none (embedded in store; gated by `products.designable`)
- Portal nav: embedded in Websites → Store → Products (not top-level)

Cross-domain dependencies:
- Storefront & Commerce (`products.designable`, `cartItems.designId`, `orderItems.designId` — the FK chain is the primary integration point)
- Auth (storefront customer session / anonymous session)

### No Shared Utility Module Needed

The tools share no common code. There is nothing to extract into a neutral
`lib/creative-tools/` shared module.

## Phased Plan

These are ordered smallest-to-largest. The first two phases ship the full
unbundle benefit. Phases 3–4 are optional follow-on polish.

### Phase 1 — Split the Vault Domain Map (< 1 hour, zero code risk)

1. Create `vault/03 - Domains/Pitch Decks.md` — contains everything currently
   in the "Pitch Decks" section of the combined domain map. Update frontmatter:
   `domain: pitch-decks`, `status: active`, date today.
2. Create `vault/03 - Domains/Print Designer.md` — contains everything
   currently in the "Product Designer" section. Update frontmatter:
   `domain: print-designer`, `status: active`, date today.
3. Archive (or delete) `vault/03 - Domains/Pitch Decks & Product Designer.md`.
4. Update any `[[Pitch Decks & Product Designer]]` wikilinks in other vault
   files to point to the correct new file.

**Verification:** No code changes; no typecheck needed. Confirm wikilinks
resolve in Obsidian.

### Phase 2 — Separate the Domain Keys in Dependent Configs (< 30 min)

The combined domain map used `domain: decks-designer`. Audit for any places
outside the vault that reference this string and replace:

```bash
grep -rn "decks-designer" /path/to/repo --include="*.ts" --include="*.tsx" --include="*.md"
```

Expected: zero hits in the codebase (the string appears only in the vault
frontmatter). If any hits appear in code, update them to `pitch-decks` or
`print-designer` as appropriate.

**Verification:** `tsc --noEmit` (confirm no broken references).

### Phase 3 — Promote Designer to a Named Service Entitlement (optional, M effort)

Currently `products.designable` is a boolean column gated at the product level
with no service-layer billing gate. This is fine for now but makes it
impossible to offer the designer as an add-on SKU. If the designer is to be
invested in (not deferred/cut), add a `designer` service slug to the services
table and add `requireService(clientId, 'designer')` guards to
`app/api/storefront/[siteId]/designs/` routes.

Pre-condition: fate decision (invest / defer / cut) must be made first. Skip
this phase if deferring or cutting.

**Verification:** `bun test:tenancy` (data-access scope), `bun test:critical`.

### Phase 4 — Optional Nav Refactor (cosmetic, < 2 hours)

The designer currently has no top-level portal nav entry — it's reached only
by navigating to a specific product. If the designer is invested in as a
standalone product, add a top-level nav entry under "Websites" with a
`requiredDomain: 'designer'` gate (depends on Phase 3). No change required if
designer stays embedded in product management.

**Verification:** `bun test:critical`.

## Decision Hooks

**After Phase 1-2 are shipped, the designer's fate becomes an independent
decision. The choices:**

| Option | What it means |
|---|---|
| **Invest** | Add service entitlement gate (Phase 3), build portal nav entry (Phase 4), expand MCP tools, add AI-powered design generation features |
| **Defer** | Leave as-is; it functions but gets no new investment; keep `products.designable` as-is |
| **Cut** | Remove `lib/designer/`, `components/product-designer/`, `components/storefront/designer/`, the storefront design API routes, and `lib/db/schema/productDesigner.ts`; add a migration dropping the designer tables. Blocked by checking for live `product_designs` rows. |

Competitor check before deciding:
- **Invest case:** Canva and Adobe Express are the comparators. The designer's
  current print-area / multi-side / AI-text-and-image tooling is technically
  capable but UI-rough. Differentiation path: tighter AI + agent integration
  (MCP tool: `designer_generate_from_prompt`).
- **Cut case:** Printful, Printify, and Gelato all provide hosted designer
  tooling as part of their fulfillment service. If tenants integrate a
  print-on-demand partner, the internal designer may be redundant.

**Pitch Decks fate:** No decision hook — the directive is to keep and invest.
The AI agent story (deck generation via MCP tools, `decks_replace_slides`,
`decks_add_slide`, `decks_fork`) is the showcase capability.

## Risks & Non-Goals

### Risks

- **Wikilink rot in the vault.** If other vault notes link to `[[Pitch Decks & Product Designer]]`, those links will break when the file is removed. Audit before deleting the source file (`grep -r "Pitch Decks & Product Designer" vault/`).
- **Domain-map drift check.** `scripts/check-doc-drift.ts` validates cited paths in domain maps. After splitting, ensure all source paths in each new domain map's `sources:` frontmatter are real files. The designer map in particular lists `app/sites/[domain]/designer/` and `app/sites/[domain]/design/` — both exist, but confirm before committing.
- **No cross-import gaps to miss.** The grep confirmed zero cross-imports today. If new code is added before Phase 1 ships and accidentally couples them, re-run the grep before writing the spec as complete.

### Non-Goals

- **No code movement.** Files stay where they are. The unbundle is vault-only.
- **No new shared module.** There is nothing to extract — don't create a `lib/creative-tools/` package for the sake of symmetry.
- **No billing/entitlement changes in Phase 1-2.** The designer service gate (Phase 3) is only worth doing if the fate decision is "invest."
- **No tests to add for Phase 1-2.** Vault edits are not tested by the CI pipeline.

## Effort

- **Phase 1 (vault split):** XS — < 1 hour
- **Phase 2 (domain key audit):** XS — < 30 min (likely a no-op)
- **Phase 3 (service entitlement):** M — ~1 day including schema migration + tests
- **Phase 4 (nav refactor):** S — ~2–4 hours

Total to deliver the core unbundle (Phases 1–2): **< 2 hours.**

---

## Verified against code (2026-06-25)

**Verdict: ALREADY SEPARATE — unbundle is vault-only, no code changes needed.**

Cross-import grep confirmed zero entanglement:
- No file under `lib/decks/`, `app/portal/tools/pitch-decks/`, or `app/api/portal/tools/pitch-decks/` imports anything from `lib/designer/` or `components/product-designer/`.
- No file under `lib/designer/`, `components/product-designer/`, `components/storefront/designer/`, `app/sites/[domain]/designer/`, or `app/api/storefront/` imports anything from `lib/decks/` or pitch-deck routes.

Schema isolation confirmed:
- `lib/db/schema/tools.ts` — pitch-deck tables only (lines 176–230).
- `lib/db/schema/productDesigner.ts` — designer tables only (standalone file, FKs only to `store.ts` and `sites.ts`).

Nav isolation confirmed:
- `lib/portal-nav.ts` line 178: pitch-decks nav entry under "Tools."
- Designer has no top-level nav entry; reached via Websites → Store → Products.

Service entitlement isolation confirmed:
- Pitch decks: `requireService(clientId, 'pitch-decks')` on all 12 MCP write tools.
- Designer: no service gate; gated by `products.designable` column.
