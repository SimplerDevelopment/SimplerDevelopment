---
type: domain-map
domain: print-designer
status: active
date: 2026-06-25
sources:
  - lib/db/schema/productDesigner.ts
  - lib/designer/canvasStore.ts
  - lib/designer/types.ts
  - lib/designer/layerFactory.ts
  - lib/designer/fillResolver.ts
  - lib/designer/aiPromptBuilder.ts
  - lib/designer/fontVirtualizer.ts
  - lib/designer/printAreaCheck.ts
  - lib/designer/printQuality.ts
  - lib/designer/contrastInk.ts
  - lib/designer/aiRateLimit.ts
  - lib/designer/hooks/useAutoSave.ts
  - lib/designer/hooks/useAddImageLayer.ts
  - lib/designer/hooks/useMobileGestures.ts
  - lib/designer/hooks/useKeyboardShortcuts.ts
  - lib/storefront/designer-auth.ts
  - app/sites/[domain]/designer/[productSlug]/page.tsx
  - app/sites/[domain]/design/[productSlug]/page.tsx
  - app/portal/websites/[siteId]/store/products/[productId]/designer/page.tsx
  - app/api/storefront/[siteId]/designs/route.ts
  - app/api/storefront/[siteId]/designs/[designId]/route.ts
  - app/api/storefront/[siteId]/designs/[designId]/finalize/route.ts
  - app/api/storefront/[siteId]/designs/[designId]/share/route.ts
  - app/api/storefront/[siteId]/designs/[designId]/ai-image/route.ts
  - app/api/storefront/[siteId]/designs/[designId]/ai-text/route.ts
  - app/api/storefront/[siteId]/designs/[designId]/clone/route.ts
  - app/api/storefront/[siteId]/designs/[designId]/save-as-template/route.ts
  - app/api/storefront/[siteId]/designs/upload-image/route.ts
  - app/api/storefront/[siteId]/designs/generate-thumbnail/route.ts
  - app/api/storefront/[siteId]/designs/claim/route.ts
  - app/api/portal/websites/[siteId]/store/design-assets/route.ts
  - tests/unit/designer-canvas-store.test.ts
  - tests/unit/designer-canvas-store-coverage.test.ts
  - tests/unit/lib-designer-print-area-check.test.ts
  - tests/unit/lib-designer-font-virtualizer.test.ts
  - tests/unit/designer-use-mobile-gestures.test.tsx
---

# Domain: Print Designer

## Purpose

Canvas-based storefront embellishment tool ported from an earlier print-designer monorepo. Store customers design custom graphics (text, icons, images) on product mockups (T-shirts, mugs, etc.) per-style, per-side. Uses Fabric.js for canvas rendering. Saved designs are keyed to `productDesigns`; the `products.designable` flag enables the designer per product.

Competitors: Canva, Adobe Express, Printful's built-in designer — commodity storefront embellishment. **Fate (invest / defer / cut) is an open decision** following the unbundle from [[Pitch Decks]]; see [[Spec - Pitch Decks Print Designer Unbundle]] for the decision framework and cut checklist.

Service gate: none — the designer is a feature of `store`/`websites`, always on when `products.designable = true`. No top-level portal nav entry; reached via Websites → Store → Products.

---

## Key entry points

| Path | Role |
|---|---|
| `lib/db/schema/productDesigner.ts` | `productStyles`, `productSides`, `designAssets`, `productDesigns` tables |
| `lib/designer/canvasStore.ts` | Zustand store for the designer canvas (layers, surfaces, selection, zoom, undo) |
| `lib/designer/types.ts` | Core types: `LayerData`, `LayerType`, `DesignDoc`, `CanvasSize`, `DesignerSurface` |
| `lib/designer/layerFactory.ts` | Fabric.js object constructors: `createFabricText`, `createFabricIcon`, `fabricObjectToLayer` |
| `lib/designer/fillResolver.ts` | Tint/fill resolution: `resolveLayerFill`, `tintKey` |
| `lib/designer/printAreaCheck.ts` | Print-area bounds validation |
| `lib/designer/aiPromptBuilder.ts` | AI prompt construction for image/text generation |
| `lib/storefront/designer-auth.ts` | Storefront customer session or anonymous `sd_design_session` cookie auth |
| `app/sites/[domain]/designer/[productSlug]/page.tsx` | Public-facing canvas (storefront customers) |
| `app/sites/[domain]/design/[productSlug]/page.tsx` | Alternate public URL for the same canvas |
| `app/portal/websites/[siteId]/store/products/[productId]/designer/page.tsx` | Portal admin preview/configuration of product designer |

---

## Data model

All tables in `lib/db/schema/productDesigner.ts`:

- `product_styles` → `products` (cascade); colorway variants with optional price override.
- `product_sides` → `product_styles`; per-style mockup images with pixel-level printable-area bounds.
- `design_assets` → `client_websites`; per-website icon/clip-art library (`icon` type uses react-icons refs; `art` type hosts SVG/PNG). **Tenancy key: `websiteId`.**
- `product_designs` → `products`, `product_styles`, `store_customers`; `layers` JSON holds the canonical layer array; `uuid` is the public share-link key; soft-deleted via `deletedAt`. **Tenancy key: `websiteId` + `customerId` / `sessionId`.**

---

## API surface

| Endpoint | Method | Purpose |
|---|---|---|
| `app/api/storefront/[siteId]/designs/route.ts` | GET / POST | List / create designs for a storefront |
| `app/api/storefront/[siteId]/designs/[designId]/route.ts` | GET / PATCH / DELETE | Single design CRUD |
| `app/api/storefront/[siteId]/designs/[designId]/finalize/route.ts` | POST | Finalize a design (lock for order) |
| `app/api/storefront/[siteId]/designs/[designId]/share/route.ts` | POST | Generate public share link |
| `app/api/storefront/[siteId]/designs/[designId]/ai-image/route.ts` | POST | AI-generate an image layer |
| `app/api/storefront/[siteId]/designs/[designId]/ai-text/route.ts` | POST | AI-generate a text layer |
| `app/api/storefront/[siteId]/designs/[designId]/clone/route.ts` | POST | Clone a design |
| `app/api/storefront/[siteId]/designs/[designId]/save-as-template/route.ts` | POST | Save design as reusable template |
| `app/api/storefront/[siteId]/designs/upload-image/route.ts` | POST | Upload an image asset for use in a design |
| `app/api/storefront/[siteId]/designs/generate-thumbnail/route.ts` | POST | Generate a canvas thumbnail |
| `app/api/storefront/[siteId]/designs/claim/route.ts` | POST | Claim an anonymous design to a customer account |
| `app/api/portal/websites/[siteId]/store/design-assets/route.ts` | GET / POST / DELETE | Manage per-website icon / clip-art asset library |

No dedicated MCP tools — the designer is driven entirely by REST from the storefront client.

---

## Tests & gates

| File | Layer | Coverage |
|---|---|---|
| `tests/unit/designer-canvas-store.test.ts` | unit | Canvas store operations |
| `tests/unit/designer-canvas-store-coverage.test.ts` | unit | Canvas store coverage supplement |
| `tests/unit/lib-designer-print-area-check.test.ts` | unit | Print-area bounds validation |
| `tests/unit/lib-designer-font-virtualizer.test.ts` | unit | Font virtualizer |
| `tests/unit/designer-use-mobile-gestures.test.tsx` | unit | Mobile gesture hook |

---

## Cross-domain dependencies

- **[[Storefront & Commerce]]** — `productDesigns` has FKs to `products`, `productStyles`, `storeCustomers`; `products.designable` flag gates the canvas. `cartItems`/`orderItems` carry a `designId` FK back to `productDesigns`. The FK chain is the primary integration point.
- **[[Auth & Security]]** — storefront customer session or anonymous `sd_design_session` cookie (`lib/storefront/designer-auth.ts`). Anonymous designs survive session changes via `sessionId`.

---

## Invariants & gotchas

- **Product Designer is per-website, not per-tenant.** `designAssets` is keyed by `websiteId`; `productDesigns` by `websiteId` + `customerId` or `sessionId`. Anonymous designs survive session changes via `sessionId`.
- **Fabric.js is a client-only dependency.** The `lib/designer/` modules that import Fabric must never be loaded server-side.
- **No service gate.** The designer has no `requireService` guard — it is always enabled when `products.designable = true`. Phase 3 of the unbundle spec would add a `designer` service slug if the fate decision is "invest." See [[Spec - Pitch Decks Print Designer Unbundle]].
- **Zero cross-imports with Pitch Decks.** No file in `lib/designer/`, `components/product-designer/`, or `components/storefront/designer/` imports anything from `lib/decks/` or pitch-deck routes. The two domains are fully code-isolated (confirmed by grep 2026-06-25).
- **`/designer/` and `/design/` are both real public routes.** `app/sites/[domain]/designer/[productSlug]/page.tsx` and `app/sites/[domain]/design/[productSlug]/page.tsx` both exist and serve the same canvas surface.

---

## Planning notes

The designer was ported from `<earlier-monorepo>/print-designer` and is not heavily integrated with the main block-editor pipeline. Split from the combined "Pitch Decks & Product Designer" domain map on 2026-06-25; see [[Pitch Decks]] for the AI deck authoring tool and [[Spec - Pitch Decks Print Designer Unbundle]] for the full unbundle rationale.

Fate options (open decision — make independently now that this is a standalone domain):

| Option | What it means |
|---|---|
| **Invest** | Add service entitlement gate (Phase 3 of spec), build portal nav entry, expand AI features. Comparators: Canva, Adobe Express. Differentiation path: tighter AI + agent integration (`designer_generate_from_prompt`). |
| **Defer** | Leave functional but uninvested; `products.designable` flag as-is. |
| **Cut** | Remove `lib/designer/`, `components/product-designer/`, `components/storefront/designer/`, the storefront design API routes, and `lib/db/schema/productDesigner.ts`; add a migration dropping the designer tables. Block on checking for live `product_designs` rows first. Note: Printful, Printify, and Gelato all provide hosted designer tooling as part of fulfillment — if tenants integrate a print-on-demand partner, the internal designer may be redundant. |

---

## Related

- [[Pitch Decks]]
- [[Storefront & Commerce]]
- [[Auth & Security]]
- [[Spec - Pitch Decks Print Designer Unbundle]]
