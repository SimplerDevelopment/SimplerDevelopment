# Quickstart: Email Block Editor

## Prerequisites
- Existing block editor system (types, contexts, visual editor components)
- Email marketing service with campaigns and templates
- PostgreSQL with Drizzle ORM

## Implementation Order

### Phase 1: Foundation (data + renderer)
1. **DB migration** -- Add `block_content` jsonb column to `email_campaigns` and `email_templates`
2. **Schema update** -- Add `blockContent` field to Drizzle schema tables
3. **Email block types** -- Add `SocialLinksBlock`, `EmailHeaderBlock`, `EmailFooterBlock` to `types/blocks.ts`
4. **Email HTML renderer** -- Create `lib/email/render-blocks-to-email.ts` that converts Block[] to table-based email HTML

### Phase 2: Editor integration
5. **Email block registry** -- Define `EMAIL_BLOCK_TYPES` constant listing the 12 supported types
6. **EmailBlockEditor component** -- Wrapper around `VisualBlockEditorEnhanced` with email constraints (filtered blocks, 600px width, email preview pane)
7. **Email-specific block previews** -- `SocialLinksBlockPreview`, `EmailHeaderBlockPreview`, `EmailFooterBlockPreview`
8. **Email-specific block renders** -- Corresponding render components for new block types

### Phase 3: Page integration
9. **Campaign new page** -- Replace raw HTML textarea with `EmailBlockEditor` + toggle for raw HTML mode
10. **Campaign edit page** -- Load `blockContent` into editor, fall back to raw HTML view for legacy campaigns
11. **Template management** -- Add block editor to template create/edit flows
12. **API updates** -- Modify campaign and template endpoints to accept/return `blockContent`, auto-render HTML on save

### Phase 4: Polish
13. **Preview endpoint** -- `POST /api/portal/email/render-preview` for live preview
14. **Email preview pane** -- Iframe-based preview with desktop/mobile width toggle
15. **Template starter library** -- Create 3-5 pre-built email templates using blocks
16. **Test send** -- Button to send preview email to yourself before campaign send

## Key Files to Create/Modify

### New Files
- `lib/email/render-blocks-to-email.ts` -- Core email HTML renderer
- `lib/email/email-block-types.ts` -- Email block type definitions and registry
- `components/email/EmailBlockEditor.tsx` -- Editor wrapper for email context
- `components/email/EmailPreviewPane.tsx` -- Live HTML preview iframe
- `components/blocks/visual/SocialLinksBlockPreview.tsx`
- `components/blocks/visual/EmailHeaderBlockPreview.tsx`
- `components/blocks/visual/EmailFooterBlockPreview.tsx`
- `components/blocks/render/SocialLinksBlockRender.tsx`
- `components/blocks/render/EmailHeaderBlockRender.tsx`
- `components/blocks/render/EmailFooterBlockRender.tsx`
- `drizzle/0037_email_block_content.sql`
- `app/api/portal/email/render-preview/route.ts`

### Modified Files
- `lib/db/schema.ts` -- Add `blockContent` to `emailCampaigns` and `emailTemplates`
- `types/blocks.ts` -- Add 3 new email block types to Block union
- `lib/visual-editor/registry.ts` -- Register email block render components
- `lib/ai/block-schemas.ts` -- Add schemas for email-only blocks
- `app/portal/email/campaigns/new/page.tsx` -- Integrate block editor
- `app/portal/email/campaigns/[id]/page.tsx` -- Integrate block editor for editing
- `app/portal/email/templates/page.tsx` -- Add block editor to template creation
- `app/api/portal/email/campaigns/route.ts` -- Accept blockContent, render HTML
- `app/api/portal/email/campaigns/[id]/route.ts` -- Same
- `app/api/portal/email/templates/route.ts` -- Same
- `app/api/portal/email/templates/[id]/route.ts` -- Same
- `lib/email/index.ts` -- Add `renderBlocksToEmailHtml()` export
