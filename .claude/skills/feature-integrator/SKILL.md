---
name: feature-integrator
description: "Analyze external application source code, compare it against SimplerDevelopment2026, identify feature gaps, and integrate missing capabilities. Use this skill whenever the user wants to bring features from another app into SimplerDevelopment, compare two codebases for feature parity, find gaps between an external component directory and the existing platform, or port functionality from a reference implementation. Trigger on phrases like 'find gaps between', 'integrate features from', 'port this to SimplerDevelopment', 'compare and implement', 'what features are missing', 'bring over from', 'adopt features from', 'merge capabilities from', or when given a path to external source code alongside a request to implement or integrate it. Also trigger when the user provides a booking-app, chat system, or any component directory and asks to close the gap with what SimplerDevelopment already has."
---

# Feature Integrator

Analyze external application source code, identify feature gaps against SimplerDevelopment2026, and implement missing capabilities following existing project patterns.

## How This Skill Works

This is a structured comparison-and-integration workflow. The goal is NOT to blindly copy code from the external app. Instead, we analyze what the external app does well, identify what SimplerDevelopment is missing, and implement those features using SimplerDevelopment's own patterns (block system, branding context, visual editor, Drizzle ORM, etc.).

## Phase 1: Source Analysis

Understand the external application before comparing anything.

### 1.1 Catalog the External Source

Read the external source code provided by the user. Build a feature inventory:

- **UI Components** - What screens/views/components exist? What do they render?
- **Data Models** - What entities and relationships does it track?
- **API Endpoints** - What server-side operations does it support?
- **Business Logic** - What workflows, validations, calculations, or state machines exist?
- **User Interactions** - What can users do? (CRUD, filtering, sorting, scheduling, payments, etc.)
- **Integrations** - Does it connect to external services? (email, calendar, payments, maps, etc.)

For each feature found, note:
- What it does (one sentence)
- Where the implementation lives (file paths)
- How complex it is (simple / moderate / complex)
- What dependencies it has (other features, external services)

Present this inventory to the user before proceeding.

### 1.2 Understand the Architecture

Note the external app's tech stack and patterns. This matters because we need to translate concepts, not copy code. For example:
- A Django model becomes a Drizzle schema table
- A Vue component becomes a React component with branding context
- An Express route becomes a Next.js API route
- A REST endpoint might map to an existing SimplerDevelopment API

## Phase 2: SimplerDevelopment Inventory

Map what SimplerDevelopment already has in the same domain.

### 2.1 Find the Corresponding Feature Area

Search the SimplerDevelopment codebase for the equivalent domain. Key locations:

| Domain | Where to Look |
|--------|--------------|
| Block types | `/types/blocks.ts`, `/lib/visual-editor/registry.ts` |
| Render components | `/components/blocks/render/` |
| Visual editor previews | `/components/blocks/visual/` |
| Block settings | `/components/blocks/visual/BlockSettings.tsx` |
| Block icons/metadata | `/lib/utils/blockIcons.tsx` |
| Database schema | `/lib/db/schema/` (per-domain modules; barrel: `lib/db/schema/index.ts`) |
| API routes | `/app/api/` |
| Standalone features | `/components/` (top-level feature dirs) |
| Hooks | `/hooks/` |
| Utilities | `/lib/utils/` |
| Contexts | `/contexts/` |

### 2.2 Build the SimplerDevelopment Feature Map

For the same domain, catalog what SimplerDevelopment already supports:
- Existing block types and their capabilities
- Database tables and fields
- API endpoints
- UI components and settings
- Business logic and validations

## Phase 3: Gap Analysis

This is the core value of the skill. Compare the two inventories systematically.

### 3.1 Create the Gap Report

For each feature in the external app, classify it:

**Already Exists** - SimplerDevelopment has equivalent or better functionality. Note the mapping.

**Partial Gap** - SimplerDevelopment has the feature but is missing specific capabilities. For example:
- External app has a booking system with recurring appointments; SimplerDevelopment has booking but only one-time
- External app has rich email templates; SimplerDevelopment has basic email blocks

**Full Gap** - SimplerDevelopment has nothing equivalent. The feature would need to be built from scratch.

**Not Applicable** - The external feature doesn't make sense for SimplerDevelopment (e.g., a feature tied to a specific third-party service that SimplerDevelopment doesn't use).

### 3.2 Present the Gap Report

Format the report as a clear table:

```
| Feature | External App | SimplerDevelopment | Status | Effort |
|---------|-------------|-------------------|--------|--------|
| Basic booking | BookingForm.tsx | BookingBlock | Exists | - |
| Recurring appointments | RecurringScheduler.tsx | - | Full Gap | Complex |
| Email confirmations | sendConfirmation() | - | Partial Gap | Moderate |
```

Include a summary:
- Total features analyzed
- Already covered
- Partial gaps (with specifics)
- Full gaps (with specifics)
- Recommended integration order (based on value and dependencies)

**Wait for user confirmation before implementing.** The user may want to skip some features or reprioritize.

### 3.3 Identify Cross-System Integration Points

Before implementation, map how the new features connect to existing SimplerDevelopment systems. This is critical because SimplerDevelopment has multiple subsystems that use different ID schemes:

- **Booking system** uses `clientId` (references `clients` table)
- **eCommerce/Store** uses `websiteId` (references `clientWebsites` table)  
- **Content/Blocks** uses `websiteId`
- **Discount codes** are per-website (`websiteId`)
- **Products** are per-website (`websiteId`)

When features need to span systems (e.g., booking using store discount codes), identify the bridge:
- Does the source table need a new FK to connect?
- Can we resolve the relationship at query time?
- Should we add a nullable `websiteId` for optional linking?

Present integration points to the user — these are architectural decisions that affect how "separate but integrated" the systems are.

## Phase 4: Implementation Planning

For each gap the user wants to close, plan the implementation using SimplerDevelopment patterns.

### 4.1 Determine Integration Type

Each gap falls into one of these integration patterns:

**New Block Type** - If the feature is a visual component that belongs in the page builder:
1. Define interface in `/types/blocks.ts` extending `BaseBlock`
2. Add to `Block` union type and `BlockType` literal
3. Create render component in `/components/blocks/render/`
4. Create visual preview in `/components/blocks/visual/`
5. Register in `/lib/visual-editor/registry.ts`
6. Add icon/metadata in `/lib/utils/blockIcons.tsx`
7. Add settings UI in `BlockSettings.tsx` if the block has unique props

**Database Extension** - If the feature needs new data storage:
1. Add table(s) to the matching domain module under `lib/db/schema/` (e.g. `lib/db/schema/crm.ts`). If no module fits, create a new one and re-export it from `lib/db/schema/index.ts`. Consumers import from `@/lib/db/schema`.
2. Create migration with `npx drizzle-kit generate`
3. Add API routes in `/app/api/`
4. Follow multi-tenant pattern (`websiteId` column)

**API Extension** - If the feature needs new server-side operations:
1. Create route handler in `/app/api/[domain]/route.ts`
2. Use existing auth patterns (NextAuth session)
3. Use Drizzle for database access
4. Return consistent JSON response format

**Enhancement to Existing Block** - If the feature adds capability to an existing block:
1. Extend the block interface in `/types/blocks.ts`
2. Update the render component
3. Update the visual preview
4. Add settings controls in `BlockSettings.tsx`
5. Handle backward compatibility (existing blocks without new props)

**Standalone Feature** - If the feature is a standalone page or tool:
1. Create component directory in `/components/[feature-name]/`
2. Create page route in `/app/[route]/`
3. Wire up to navigation if needed

### 4.2 Create the Implementation Plan

For each gap being implemented, specify:
- Which integration pattern to use
- Which files to create/modify
- What to translate from external code vs. build fresh
- Dependencies between features (implement in order)
- What to adapt for branding context, responsive system, multi-tenant

Present the plan and get user approval before coding.

## Phase 5: Implementation

Execute the plan following SimplerDevelopment conventions.

### 5.1 Implementation Rules

- **Use branding context**: All visual components must use `useBranding()` and CSS variables (`--brand-primary`, etc.)
- **Support responsive**: Add responsive props where appropriate using the breakpoint system
- **Support elementStyles**: Allow per-element style overrides for customization
- **Follow naming conventions**: `{Name}BlockRender.tsx`, `{Name}BlockPreview.tsx`, camelCase for block type strings
- **Use Material Icons**: Never use emoji in UI. Use Material Icons or Lucide React icons.
- **Multi-tenant aware**: Database queries filter by `websiteId`
- **TypeScript throughout**: Full type safety, no `any` types
- **Translate, don't copy**: Adapt the external app's logic to SimplerDevelopment patterns. Don't paste foreign code and patch it to work.

### 5.2 Implementation Order

1. Types and interfaces first
2. Database schema (if needed)
3. API routes (if needed)
4. Render components
5. Visual editor previews
6. Registry and metadata registration
7. Settings UI
8. Test the integration

### 5.3 After Each Feature

After implementing each feature from the gap list:
- Verify it compiles (`npx tsc --noEmit` on changed files)
- Confirm it follows the patterns (branding, responsive, multi-tenant)
- Mark it complete in the gap report
- Move to the next feature

## Phase 6: Verification

After all gaps are implemented:

1. Run type checking to catch interface mismatches
2. Verify all new block types appear in the registry
3. Verify database migrations are generated if schema changed
4. Summarize what was implemented, what was skipped, and any remaining gaps

## Quick Reference: SimplerDevelopment Patterns

### Block Type Template
```typescript
// types/blocks.ts
export interface MyNewBlock extends BaseBlock {
  type: "my-new";
  title?: string;
  // ... block-specific props
}

// Add to Block union:
// | MyNewBlock

// Add to BlockType:
// | "my-new"
```

### Render Component Template
```typescript
// components/blocks/render/MyNewBlockRender.tsx
"use client";
import { useBranding } from "@/contexts/BrandingContext";
import { combineResponsiveClasses } from "@/lib/utils/responsiveClasses";
import type { MyNewBlock } from "@/types/blocks";

export default function MyNewBlockRender({ block }: { block: MyNewBlock }) {
  const branding = useBranding();
  const responsiveClasses = combineResponsiveClasses(block);
  // ... render logic using branding and responsive classes
}
```

### Registry Entry
```typescript
// lib/visual-editor/registry.ts
import MyNewBlockRender from "@/components/blocks/render/MyNewBlockRender";
// Add to BUILT_IN:
"my-new": MyNewBlockRender,
```
