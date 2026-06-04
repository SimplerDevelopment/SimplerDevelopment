# SimplerDevelopment2026 Architecture Reference

This file contains detailed architectural context for feature integration. Read this when you need specifics about how SimplerDevelopment patterns work.

## Table of Contents
1. Block System Deep Dive
2. Database Patterns
3. Visual Editor Communication
4. Branding System
5. Responsive System
6. Multi-Tenant Architecture
7. File Locations Quick Reference

## 1. Block System Deep Dive

Every page in SimplerDevelopment is composed of blocks. The block system has 58+ block types organized into categories.

### Block Categories
- **Basic**: text, heading, image, button, spacer, divider
- **Layout**: columns, tabs, accordion, section (these contain nested blocks)
- **Media**: quote, code, video, youtube, gallery
- **Components**: hero, hero-slideshow, marquee, services-grid, cta, stats, testimonial, card-grid, featured-content, timeline, team-showcase, bento-grid, site-footer
- **eCommerce**: product-grid, featured-products, product-categories, shopping-cart, store-banner, product-detail
- **Interactive**: booking, survey, survey-results
- **Email**: social-links, email-header, email-footer
- **Pitch Deck**: deck-next-slide, deck-jump-to, survey-input

### Nested Block Containers
Some blocks contain other blocks:
- `ColumnsBlock` has `columns: Column[]`, each column has `blocks: Block[]`
- `TabsBlock` has `tabs: Tab[]`, each tab has `blocks: Block[]`
- `SectionBlock` has `blocks: Block[]` directly
- Use helpers from `/lib/utils/blockHelpers.ts` for recursive operations

### BaseBlock Properties
Every block extends BaseBlock:
- `id`, `type`, `order`, `label`
- `style` - CSS properties object (100+ properties)
- `responsive` - breakpoint-specific settings
- `elementStyles` - per-element style overrides (keyed by element name)

## 2. Database Patterns

Database uses Drizzle ORM with PostgreSQL.

### Key Tables
- `posts` - Primary content storage (blocks stored as JSON)
- `blockTemplates` - Reusable block configurations
- `clientWebsites` - Multi-tenant site definitions
- `pitchDecks` - Presentation-format content

### Schema Location
`lib/db/schema/` — split into per-domain modules (e.g. `lib/db/schema/crm.ts`, `lib/db/schema/cms.ts`). The barrel `lib/db/schema/index.ts` re-exports everything. Consumers import from `@/lib/db/schema`.

### Multi-Tenant Pattern
All content tables have `websiteId` column:
```typescript
websiteId: integer('website_id')
// null = agency/admin content
// number = specific client website
```

## 3. Visual Editor Communication

The visual editor uses an iframe with postMessage:
- Parent sends: `EDITOR_INIT`, `BLOCKS_UPDATE`, `SELECT_BLOCK`, `HOVER_BLOCK`
- Iframe sends: `IFRAME_READY`, `BLOCK_CLICKED`, `BLOCKS_REORDERED`, `BLOCK_STYLE_UPDATED`

Protocol defined in `/types/visual-editor.ts`.

## 4. Branding System

All visual blocks should use the branding context:
```typescript
const branding = useBranding();
```

CSS variables available:
- `--brand-primary`, `--brand-secondary`, `--brand-accent`
- `--brand-bg`, `--brand-text`
- `--brand-heading-font`, `--brand-body-font`
- `--brand-border-radius`
- `--brand-btn-primary-bg`, `--brand-btn-primary-text` (and 5+ button variants)

## 5. Responsive System

Blocks support breakpoint-specific settings:
```typescript
responsive?: {
  paddingTop?: { mobile?: string, tablet?: string, desktop?: string }
  fontSize?: { mobile?: string, tablet?: string, desktop?: string }
  visibility?: { mobile?: boolean, tablet?: boolean, desktop?: boolean }
  // ... more properties
}
```
Applied via `combineResponsiveClasses()` from `/lib/utils/responsiveClasses`.

## 6. Multi-Tenant Architecture

SimplerDevelopment hosts multiple client websites. Key concepts:
- Each client has a `clientWebsites` record with domain, subdomain, branding
- Content is filtered by `websiteId` in all queries
- Branding profiles are per-client
- The visual editor works within a client context

## 7. File Locations Quick Reference

| What | Where |
|------|-------|
| Block type definitions | `/types/blocks.ts` |
| Block component registry | `/lib/visual-editor/registry.ts` |
| Render components | `/components/blocks/render/{Name}BlockRender.tsx` |
| Visual previews | `/components/blocks/visual/{Name}BlockPreview.tsx` |
| Block settings UI | `/components/blocks/visual/BlockSettings.tsx` |
| Block icons/metadata | `/lib/utils/blockIcons.tsx` |
| Database schema | `lib/db/schema/` (per-domain modules; barrel: `lib/db/schema/index.ts`) |
| API routes | `/app/api/` |
| Block helpers | `/lib/utils/blockHelpers.ts` |
| Responsive utilities | `/lib/utils/responsiveClasses.ts` |
| Branding context | `/contexts/BrandingContext.tsx` |
| Editor message types | `/types/visual-editor.ts` |
| Responsive types | `/types/responsive.ts` |
