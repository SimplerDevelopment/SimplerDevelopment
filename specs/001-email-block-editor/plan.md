# Implementation Plan: Email Block Editor

**Branch**: `001-email-block-editor` | **Date**: 2026-04-02 | **Spec**: [research.md](research.md)
**Input**: Incorporate the CMS block editor into the Email Marketing service

## Summary

Add visual email composition to the Email Marketing service by reusing the existing block editor infrastructure with an email-safe HTML rendering pipeline. Users compose emails with drag-and-drop blocks; the system renders table-based, inline-styled HTML compatible with all major email clients. Backward compatible with existing raw HTML campaigns.

## Technical Context

**Language/Version**: TypeScript / Next.js 15 (App Router)
**Primary Dependencies**: React 19, Drizzle ORM, dnd-kit, Resend
**Storage**: PostgreSQL -- new `block_content` jsonb column on campaigns and templates
**Testing**: Playwright E2E, Jest unit tests for renderer
**Target Platform**: Web (portal)
**Project Type**: Web application (existing monolith)
**Constraints**: Email HTML must work in Outlook 2016+, Gmail, Apple Mail, Yahoo Mail -- table layout, inline styles only, 600px max width

## Constitution Check

*No project-specific constitution defined. Proceeding with standard practices.*

## Project Structure

### Documentation (this feature)

```text
specs/001-email-block-editor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/
    └── api-changes.md   # Phase 1 output
```

### Source Code

```text
# New files
lib/email/
├── render-blocks-to-email.ts   # Core: Block[] → email HTML string
└── email-block-types.ts        # EMAIL_BLOCK_TYPES constant + type guards

components/email/
├── EmailBlockEditor.tsx         # Editor wrapper with email constraints
└── EmailPreviewPane.tsx         # Iframe-based live HTML preview

components/blocks/visual/
├── SocialLinksBlockPreview.tsx   # Editor preview for social links
├── EmailHeaderBlockPreview.tsx   # Editor preview for email header
└── EmailFooterBlockPreview.tsx   # Editor preview for email footer

components/blocks/render/
├── SocialLinksBlockRender.tsx    # Web render (used in previews)
├── EmailHeaderBlockRender.tsx
└── EmailFooterBlockRender.tsx

app/api/portal/email/render-preview/
└── route.ts                     # Live preview API

drizzle/
└── 0037_email_block_content.sql  # Migration

# Modified files
lib/db/schema.ts                  # Add blockContent columns
types/blocks.ts                   # Add 3 email block types
lib/visual-editor/registry.ts     # Register email blocks
lib/ai/block-schemas.ts           # Email block schemas
lib/email/index.ts                # Export renderBlocksToEmailHtml
app/portal/email/campaigns/new/page.tsx       # Block editor integration
app/portal/email/campaigns/[id]/page.tsx      # Block editor for editing
app/portal/email/templates/page.tsx           # Block editor for templates
app/api/portal/email/campaigns/route.ts       # Accept blockContent
app/api/portal/email/campaigns/[id]/route.ts  # Accept blockContent
app/api/portal/email/templates/route.ts       # Accept blockContent
app/api/portal/email/templates/[id]/route.ts  # Accept blockContent
```

---

## Phase 1: Foundation -- Data Model + Email Renderer

**Goal**: Block[] in, email-safe HTML out. Database ready to store block content.

### Tasks

#### 1.1 Database Migration
- Add `block_content jsonb` to `email_campaigns` and `email_templates`
- Create `drizzle/0037_email_block_content.sql`
- Update `lib/db/schema.ts` with `blockContent: jsonb('block_content')` on both tables

#### 1.2 Email Block Type Definitions
- Add `SocialLinksBlock`, `EmailHeaderBlock`, `EmailFooterBlock` to `types/blocks.ts`
- Add these to the `Block` union type
- Add `EmailBlockType` type listing the 12 supported email block types
- Create `lib/email/email-block-types.ts` with `EMAIL_BLOCK_TYPES` array and `isEmailBlockType()` guard

#### 1.3 Email HTML Renderer
- Create `lib/email/render-blocks-to-email.ts`
- Core function: `renderBlocksToEmailHtml(blocks: Block[]): string`
- Each block type maps to a renderer function returning email-safe HTML
- **text** → `<p style="...">content</p>`
- **heading** → `<h1-h6 style="...">content</h1-h6>`
- **image** → `<img src="..." width="N" style="..." alt="..." />`
- **button** → Table-based button: `<table><tr><td style="background:...;border-radius:..."><a style="...">text</a></td></tr></table>`
- **spacer** → `<div style="height:Npx;line-height:Npx;">&nbsp;</div>`
- **divider** → `<hr style="border:0;border-top:1px solid #ccc;margin:16px 0;" />`
- **columns** → Nested tables with `width="50%"` cells, wrapped in `<!--[if mso]><table><tr><td width="300"><![endif]-->` for Outlook
- **quote** → Left-bordered table cell
- **section** → Background-colored table wrapper
- **social-links** → Inline `<img>` icons linked to profiles
- **email-header** → Logo image + tagline in centered table
- **email-footer** → Company info + unsubscribe placeholder `{{UNSUBSCRIBE_URL}}`
- Apply inline styles from `block.style` (color, fontSize, fontWeight, textAlign, backgroundColor, padding, margin)
- Ignore unsupported CSS (flex, grid, position, transform, etc.)
- Export from `lib/email/index.ts`

#### 1.4 Integration with buildCampaignHtml
- `renderBlocksToEmailHtml()` returns the inner content HTML
- Feed output into existing `buildCampaignHtml(html, unsubscribeUrl, previewText)` for full email document
- Footer block's `{{UNSUBSCRIBE_URL}}` replaced with actual URL at send time

---

## Phase 2: Editor Components

**Goal**: Users can visually compose email content using the block editor.

### Tasks

#### 2.1 Email Block Previews (visual editor)
- `SocialLinksBlockPreview` -- Editable social link list with platform picker
- `EmailHeaderBlockPreview` -- Logo upload + tagline input
- `EmailFooterBlockPreview` -- Company name, address, unsubscribe badge

#### 2.2 Email Block Web Renders
- `SocialLinksBlockRender`, `EmailHeaderBlockRender`, `EmailFooterBlockRender`
- Register in `lib/visual-editor/registry.ts`
- Add schemas in `lib/ai/block-schemas.ts`

#### 2.3 EmailBlockEditor Component
- `components/email/EmailBlockEditor.tsx`
- Wraps `VisualBlockEditorEnhanced` with:
  - `allowedBlockTypes` prop filtering to `EMAIL_BLOCK_TYPES`
  - Fixed 600px canvas width (no responsive viewport switcher)
  - Email-appropriate default page settings (white background, no max-width override)
- Props: `blocks: Block[]`, `onChange: (blocks: Block[]) => void`

#### 2.4 EmailPreviewPane Component
- `components/email/EmailPreviewPane.tsx`
- Calls `POST /api/portal/email/render-preview` with debounced block updates
- Renders returned HTML in sandboxed `<iframe srcDoc={html} sandbox="allow-same-origin" />`
- Toggle: desktop (600px) / mobile (320px) preview width
- Loading skeleton while rendering

#### 2.5 Preview API Endpoint
- `POST /api/portal/email/render-preview`
- Accepts `{ blockContent: BlockEditorData }`
- Returns `{ html: string }` -- rendered email HTML
- Uses `renderBlocksToEmailHtml()` + `buildCampaignHtml()` with placeholder unsubscribe URL

---

## Phase 3: Page Integration

**Goal**: Block editor wired into campaign and template creation/editing flows.

### Tasks

#### 3.1 Campaign Creation Page
- Modify `app/portal/email/campaigns/new/page.tsx`
- Add mode toggle: "Visual Editor" / "HTML" (default: Visual Editor)
- Visual mode: render `EmailBlockEditor` + `EmailPreviewPane` side by side
- HTML mode: keep existing textarea (backward compat)
- On save: if visual mode, include `blockContent` in POST body; server renders `htmlContent`

#### 3.2 Campaign Edit Page
- Modify `app/portal/email/campaigns/[id]/page.tsx`
- If `campaign.blockContent` exists: open in block editor
- If null (legacy raw HTML): open in HTML editor (existing textarea)
- Allow switching from HTML to visual (warning: content won't transfer)

#### 3.3 Template Creation/Editing
- Modify `app/portal/email/templates/page.tsx`
- Add block editor option when creating/editing templates
- Templates with `blockContent` open in visual editor
- "Use Template" in campaign creation loads template's blocks into editor

#### 3.4 API Endpoint Updates
- `POST /api/portal/email/campaigns` -- accept `blockContent`, render to `htmlContent` if present
- `PATCH /api/portal/email/campaigns/[id]` -- same
- `GET /api/portal/email/campaigns/[id]` -- return `blockContent`
- Same for template endpoints
- Shared helper: `processBlockContent(blockContent) → htmlContent`

---

## Phase 4: Polish

**Goal**: Production-ready email editing experience.

### Tasks

#### 4.1 Starter Templates
- Create 3-5 pre-built email block templates:
  - Welcome email (header, text, button, footer)
  - Newsletter (header, image, text, columns, social-links, footer)
  - Promotion (header, image, heading, text, button, divider, footer)
  - Announcement (header, heading, text, footer)
- Store as global templates (`is_global: true`) via seed script

#### 4.2 Test Send
- "Send Test" button in campaign editor
- Opens modal: enter email address
- Sends rendered HTML to that address via Resend
- Helps verify rendering before full send

#### 4.3 Email Client Testing Notes
- Document known rendering quirks per client
- Add inline comments in renderer for Outlook/Gmail workarounds

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Outlook rendering breaks | High | Test with Litmus/Email on Acid; VML conditionals for buttons/rounded corners |
| Block editor too heavy for email use case | Medium | EmailBlockEditor filters to 12 blocks only; minimal UI surface |
| Migration on production data | Low | `block_content` is nullable, no data loss, backward compatible |
| Users expect all CMS blocks in email | Medium | Clear UI labeling; email block picker shows only supported blocks |
