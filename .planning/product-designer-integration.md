# Product Designer Integration

Integrate the philaprints product-customization designer from
`~/monorepo/packages/philaprints` into the sd2026 portal ecommerce
(`app/portal/websites/[siteId]/store/...` admin and
`components/storefront/ProductPage.tsx` storefront).

The designer lets a customer build a custom design (text, icons, art,
uploaded images) on top of product mockups (styles + sides), preview
it across style variants, save it (signed-in or anonymous session),
and add it to cart with a thumbnail attached to the cart/order item.

## Source: philaprints package

- `~/monorepo/packages/philaprints/src/` — React 18/19 CRA app
- Entry: `ProductDesigner` exported from `src/index.ts`
- Stack used:
  - react / react-dom 18-19
  - react-draggable (Layer dragging)
  - react-beautiful-dnd (layer-list reordering — needs replacement)
  - framer-motion (animations) — already in sd2026
  - html2canvas (thumbnail capture) — already in sd2026
  - react-icons (icon picker source) — already in sd2026
  - @lottiefiles/dotlottie-react (left-panel nav anim — drop or stub)
  - react-i18next (drop, inline English)
  - socket.io-client (NOT used by designer — only chat — strip)
  - use-sound (UI sound — strip)
  - react-virtualized, react-window (virtual lists)
  - react-select, react-select-async-paginate (replace with native select)
  - @toast-ui/react-image-editor (image cropping — drop in v1, future v2)
  - @supabase/supabase-js (replace with sd2026 db client)

## Target architecture

### Schema (new file `lib/db/schema/productDesigner.ts`)

```ts
productStyles      // designable product variants with mockup imagery
productSides       // front/back/sleeve images per style + printable bounds
designAssets       // shared icon/art library entries (per website)
productDesigns     // saved customer designs (anonymous via sessionId or user)
```

Also: add nullable `designId` column to `cartItems` and `orderItems` so a
custom design can be attached to a line. Add `designable boolean` to
`products` (or derive from presence of styles).

### API surface (under `app/api/storefront/[siteId]/`)

- `GET    /designs` — list current user/session designs
- `POST   /designs` — create a new design
- `GET    /designs/[id]`
- `PUT    /designs/[id]`
- `DELETE /designs/[id]`
- `POST   /designs/[id]/share` — toggle public, returns uuid url
- `GET    /designs/public/[uuid]` — load by share uuid
- `GET    /designs/anonymous/count` — for "save your designs" prompt
- `GET    /products/[productId]/styles` — styles+sides for a product
- `GET    /designs/assets?type=icon|art` — asset library
- `POST   /designs/upload-image` — user uploads to S3 for use as layer
- `POST   /designs/generate-thumbnail` — server-side thumbnail render

Admin (`app/api/portal/websites/[siteId]/`):
- `GET/POST/PUT/DELETE /products/[productId]/styles`
- `GET/POST/PUT/DELETE /products/[productId]/styles/[styleId]/sides`
- `GET/POST/PUT/DELETE /design-assets` (per-website art/icon library)

### Components (new dir `components/product-designer/`)

- Port all `*.tsx` from `~/monorepo/packages/philaprints/src/` with these changes:
  - Add `'use client'` to anything using state/effects
  - Replace `require('react-icons/...')` with static imports of needed packs
  - Replace `react-beautiful-dnd` with `@dnd-kit/sortable` (already in deps)
  - Keep `react-draggable` (small, focused) — add to package.json
  - Strip `react-i18next` calls, inline English copy
  - Replace `useContext(CartContext)` with sd2026 cart context
  - Replace `DesignApi` base url `'/api/designs'` with
    `/api/storefront/[siteId]/designs`
  - Replace localStorage `SessionManager` with cookie-based session
    (works server-side too)
  - Convert global `index.css` to scoped `product-designer.css` and
    import only inside designer root
  - Remove `@lottiefiles/dotlottie-react` usage (replace with react-icons)
  - Remove `react-virtualized`, use `react-window` for icon list
  - Remove `react-select`, use native `<select>`
  - Remove `@toast-ui/react-image-editor` (mark photo-edit modal as TODO)
  - Remove `use-sound`, `socket.io-client`

### Admin pages

- `app/portal/websites/[siteId]/store/products/[productId]/designer/page.tsx`
  - Toggle "designable" flag
  - List styles (with thumbnails)
  - Add/edit style: name, color hex, mockup image upload
  - Each style: list sides (front/back/etc), image + printable bounds
    (x,y,w,h rectangle in image coords)
  - Tab for managing per-website asset library (icons/art categories)

### Storefront

- Update `components/storefront/ProductPage.tsx`:
  - If product has `designable=true` and at least one style, show
    "Customize this product" button which routes to:
    `/design/[productSlug]?siteId=...`
  - Cart line display: if `designId` set, show the design thumbnail
    + name as a sub-line of the cart item

- New route: `app/storefront/[siteHost]/design/[productSlug]/page.tsx`
  (or use the existing storefront convention) — full-screen designer

### Cart/Order integration

- `POST /api/storefront/[siteId]/cart/add` accepts optional `designId`
- `cart_items.design_id` populated; on checkout, copied to
  `order_items.design_id`
- Render thumbnail in admin order detail + customer order detail
- When customer revisits cart, edit-design button reloads designer
  with that design

## Implementation plan — wave 1 (parallel, independent)

**A. Schema + drizzle migration** (block-implementer)
- Create `lib/db/schema/productDesigner.ts` with tables above
- Export from `lib/db/schema/index.ts`
- Add `designId` to `cartItems`, `orderItems` in `lib/db/schema/store.ts`
- Generate raw SQL migration in `lib/db/migrations/` (manually written
  per memory feedback — drizzle-kit migrate is broken)

**B. Port editor components** (block-implementer)
- Copy all `*.tsx`, `*.css`, `*.ts` from
  `~/monorepo/packages/philaprints/src/` into
  `simplerdevelopment2026/components/product-designer/`
- Apply transformations listed above (no API wiring yet)
- Add `react-draggable` to `package.json`
- Export `ProductDesigner` from `components/product-designer/index.ts`

**C. Storefront design API** (block-implementer)
- Implement all `/api/storefront/[siteId]/designs/*` routes against the
  new schema, using cookie-based session for anonymous users +
  `storeCustomers` session token for logged-in
- Implement `/api/storefront/[siteId]/products/[productId]/styles`

**D. Storefront product page wiring** (block-implementer)
- Update `components/storefront/ProductPage.tsx` to surface
  "Customize this product" button when designable
- Add full-page storefront design route that mounts `ProductDesigner`

## Wave 2 (depends on wave 1)

**E. Admin designer pages**
- `app/portal/websites/[siteId]/store/products/[productId]/designer/page.tsx`
- Style/side CRUD UI, asset library CRUD

**F. Cart/order integration**
- Cart-add with `designId`, line thumbnails, edit-design loop

**G. E2E tests**
- `tests/e2e/product-designer.spec.ts` covering golden path

**H. Typecheck + build + cleanup**
- `bun run types` or `npx tsc --noEmit`
- `bun run build` / `npm run build`
- Fix all regressions

## Acceptance

- Admin can mark a product designable, add styles + sides + printable areas
- Customer can open the designer from product page, add text/image/icon/art
  layers, drag/resize/rotate them, preview across style variants
- Save design (anonymous or signed-in)
- Add design to cart; design thumbnail + name appear on cart line
- Checkout → order_item retains the design reference
- All flows have at least smoke E2E coverage
- Typecheck and build pass cleanly
