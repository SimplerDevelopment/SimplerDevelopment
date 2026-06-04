# Product Designer Integration — Spec

Branch: `feat/product-designer` (off `staging`)
Source: `/Users/dancoyle/productDesigner` (Next.js 14 + Fabric.js v6.7.1)
Also porting from: `~/monorepo/packages/philaprints` (philaprints product-customization designer)
Target: `simplerdevelopment2026` portal + storefront ecommerce

## Goal

Let merchants (portal admins) mark a product as **designable** and configure print surfaces (front/back/sleeve/etc) with mockup images + print-area bounds. Let storefront customers open a canvas designer for a designable product, place text/icons/images, save, attach to cart line, and check out. Pay → webhook triggers high-res render → file lands in merchant fulfillment queue.

## Stack mapping

| Concern | productDesigner | sd2026 (target) |
|---|---|---|
| Framework | Next.js 14, React 18 | Next.js 16.1, React 19.2 |
| Canvas | Fabric.js 6.7.1 | Fabric.js 6.7+ (port as-is) |
| State | Zustand + immer | Zustand (new) + immer (already on 11.x) |
| DB | Supabase (Postgres) | Drizzle + Railway Postgres |
| Storage | Supabase Storage | AWS S3 (`lib/s3/upload.ts`) |
| Auth | Supabase Auth | NextAuth (portal) + sessionId cookies (storefront) |

**Drop unused**: konva, react-konva, pixi-filters (in productDesigner package.json but unused).

## New deps to add to sd2026 root `simplerdevelopment2026/package.json`

- `fabric@^6.7.1` — canvas core
- `zustand@^5` — store
- `uuid@^11` — layer ids
- `use-debounce@^10` — debounced inputs
- `react-draggable` — layer dragging
- (`immer`, `react-icons`, `html2canvas`, `@aws-sdk/client-s3` already installed)

## Schema additions (`lib/db/schema/store.ts`)

### New columns

- `products.isDesignable boolean NOT NULL DEFAULT false` — surface-based designer (Fabric.js canvas)
- `products.designable boolean NOT NULL DEFAULT false` — philaprints-style designer (styles + sides)
- `cartItems.designId uuid` (FK → designs.id, ON DELETE SET NULL)
- `orderItems.designId uuid` (FK → designs.id, ON DELETE SET NULL)
- `orderItems.designSnapshot jsonb` (frozen layers payload at checkout time, so deleting a design doesn't break orders)
- `orderItems.printReadyUrl varchar(500)` (S3 url after webhook render)

### New tables (in `lib/db/schema/store.ts`)

```ts
productDesignSurfaces      // per-product canvas surface config (Fabric.js approach)
  id serial pk
  productId int notnull → products.id (cascade)
  name varchar(80) notnull             // "Front", "Back", "Left sleeve"
  slug varchar(80) notnull             // "front", "back", "left-sleeve"
  displayOrder int default 0
  mockupImage varchar(500) notnull     // S3 url
  canvasWidth int notnull default 800  // px
  canvasHeight int notnull default 600
  // print area bounds in px relative to mockup
  printAreaX int notnull default 100
  printAreaY int notnull default 100
  printAreaWidth int notnull default 600
  printAreaHeight int notnull default 400
  printDpi int notnull default 300
  active boolean default true
  createdAt, updatedAt
  unique(productId, slug)

designs                    // saved customer designs
  id uuid pk default gen_random_uuid()
  websiteId int notnull → clientWebsites.id (cascade)
  productId int notnull → products.id (cascade)
  customerId int                       // null for guest
  sessionId varchar(255)               // null for logged-in
  name varchar(255) notnull
  // layers stored per surface slug: { front: LayerData[], back: LayerData[] }
  layersBySurface jsonb notnull default '{}'
  canvasSize jsonb notnull default '{"width":800,"height":600,"dpi":72}'
  thumbnailUrl varchar(500)
  renderedUrl varchar(500)             // hi-res print file, post-webhook
  status varchar(20) default 'draft'   // draft, finalized, rendered
  isTemplate boolean default false     // site-wide reusable template
  createdAt, updatedAt
  index(websiteId), index(customerId), index(sessionId)

designAssets               // user-uploaded images for designs (not the rendered output)
  id serial pk
  designId uuid notnull → designs.id (cascade)
  url varchar(500) notnull
  originalFilename varchar(255)
  mimeType varchar(80)
  width int, height int
  createdAt
```

### New tables (in `lib/db/schema/productDesigner.ts` — philaprints integration)

```ts
productStyles      // designable product variants with mockup imagery
productSides       // front/back/sleeve images per style + printable bounds
designAssets       // shared icon/art library entries (per website)
productDesigns     // saved customer designs (anonymous via sessionId or user)
```

## API routes

### Portal admin (auth required, tenant-scoped)
- `GET    /api/portal/websites/[siteId]/store/products/[productId]/design-surfaces` — list surfaces
- `POST   /api/portal/websites/[siteId]/store/products/[productId]/design-surfaces` — create
- `PATCH  /api/portal/websites/[siteId]/store/products/[productId]/design-surfaces/[surfaceId]` — update
- `DELETE /api/portal/websites/[siteId]/store/products/[productId]/design-surfaces/[surfaceId]` — delete
- `GET/POST/PUT/DELETE /products/[productId]/styles`
- `GET/POST/PUT/DELETE /products/[productId]/styles/[styleId]/sides`
- `GET/POST/PUT/DELETE /design-assets` (per-website art/icon library)

(`isDesignable`/`designable` toggles reuse existing `PATCH /api/portal/websites/[siteId]/store/products/[productId]`.)

### Storefront (public, scoped by siteId)
- `POST   /api/storefront/[siteId]/designs` — create design (returns `{id}`)
- `GET    /api/storefront/[siteId]/designs/[designId]` — fetch design (must match sessionId or customerId)
- `PUT    /api/storefront/[siteId]/designs/[designId]` — autosave update
- `POST   /api/storefront/[siteId]/designs/[designId]/assets` — upload image (multipart → S3)
- `POST   /api/storefront/[siteId]/designs/[designId]/finalize` — mark finalized + generate thumbnail
- `GET    /products/[productId]/styles` — styles+sides for a product

Cart attach: extend `POST /api/storefront/[siteId]/cart` to accept `designId` in body, store on `cartItems.designId`.

## Components

- `components/storefront/designer/` — Fabric.js canvas designer components
- `components/product-designer/` — philaprints-ported designer components

## Portal admin UI

Extend `app/portal/websites/[siteId]/store/products/[productId]/page.tsx`:
1. New section: **Customization** (collapsible) with design mode selector (standard/store/customer)
   - If mode !== standard → embedded `DesignSurfacesEditor` for surface config
2. `app/portal/websites/[siteId]/store/products/[productId]/designer/page.tsx` — redirect to storefront designer in staff mode

## Webhook hook-in

In `app/api/stripe/webhook/ecommerce/route.ts`, on `payment_intent.succeeded` after `paymentStatus='paid'`:
- For each `orderItem` with `designId`, enqueue a server-side render → S3 → update `orderItems.printReadyUrl` and `designs.renderedUrl`, `designs.status='rendered'`.
- For MVP: skip server render and just snapshot the design's data URL thumbnail; surface raw `designs.layersBySurface` + `productDesignSurfaces.mockupImage` to merchant for manual download.

## Constraints from memory

- **Use Material Icons, no emojis** in any UI.
- **DO NOT** apply schema migrations to the shared Railway DB — generate SQL files only; user applies manually.
- **DO NOT** push to main. Push to `feat/product-designer`.
- Drizzle migration tracker is out of sync; `db:migrate` will fail — that's expected.

## Out of scope (for this PR)

- Real server-side composite renderer (node-canvas/Puppeteer). MVP: thumbnail via client html2canvas.
- Print-on-demand vendor integration (Printful, Gelato).
- Multi-product cross-design templates / template library.
- Real-time collaborative editing.
