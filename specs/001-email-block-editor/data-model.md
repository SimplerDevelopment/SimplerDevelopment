# Data Model: Email Block Editor

## Schema Changes

### email_campaigns -- add `block_content` column

```sql
ALTER TABLE email_campaigns 
  ADD COLUMN block_content jsonb;
```

- `block_content` (jsonb, nullable) -- BlockEditorData JSON when created via block editor
- `html_content` (text, existing) -- Continues to hold rendered email HTML for sending
- When `block_content` is null, campaign was created with raw HTML (backward compat)
- When `block_content` is set, `html_content` is auto-generated from blocks on save

### email_templates -- add `block_content` column

```sql
ALTER TABLE email_templates
  ADD COLUMN block_content jsonb;
```

Same pattern: nullable `block_content` for block-based templates, `html_content` for rendered output.

## Type Definitions

### EmailBlockEditorData (extends BlockEditorData)

```typescript
// Reuses existing BlockEditorData from types/blocks.ts
// No new top-level type needed -- just a constrained subset of Block types
```

### Email-Only Block Types (new)

```typescript
interface SocialLinksBlock extends BaseBlock {
  type: 'social-links';
  links: Array<{
    platform: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok';
    url: string;
  }>;
  iconSize: number; // 24, 32, 40
  alignment: 'left' | 'center' | 'right';
}

interface EmailHeaderBlock extends BaseBlock {
  type: 'email-header';
  logoUrl?: string;
  logoWidth?: number;
  tagline?: string;
  alignment: 'left' | 'center' | 'right';
}

interface EmailFooterBlock extends BaseBlock {
  type: 'email-footer';
  companyName?: string;
  address?: string;
  showUnsubscribe: boolean; // always true by default
  showViewInBrowser: boolean;
  socialLinks?: Array<{ platform: string; url: string }>;
}
```

### Email Block Type Union

```typescript
type EmailBlockType = 
  | 'text' | 'heading' | 'image' | 'button' 
  | 'spacer' | 'divider' | 'columns' | 'quote' | 'section'
  | 'social-links' | 'email-header' | 'email-footer';
```

## Entity Relationships

```
email_campaigns
  ├── block_content (jsonb) → BlockEditorData with EmailBlockType blocks
  ├── html_content (text) → Rendered email HTML (from blocks or raw)
  └── list_id → email_lists

email_templates  
  ├── block_content (jsonb) → BlockEditorData with EmailBlockType blocks
  └── html_content (text) → Rendered email HTML
```

## Migration File

`drizzle/0037_email_block_content.sql`
