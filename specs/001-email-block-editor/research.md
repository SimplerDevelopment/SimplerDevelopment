# Research: Email Block Editor

## 1. Email HTML Rendering Constraints

**Decision**: Build a dedicated `renderBlocksToEmailHtml()` function that converts Block[] to table-based, inline-styled HTML.

**Rationale**: Email clients (Outlook, Gmail, Yahoo, Apple Mail) have wildly inconsistent CSS support. Flexbox, grid, CSS variables, and external stylesheets are unreliable. The safe subset is: tables for layout, inline styles for everything, no `<div>` nesting for structure, `max-width: 600px`, VML for Outlook rounded corners.

**Alternatives considered**:
- **MJML**: Popular email framework that compiles to email-safe HTML. Rejected because it adds a build dependency and we already have block definitions -- easier to map blocks directly to email HTML than to MJML then to HTML.
- **react-email**: Already installed (v5.2.3) but designed for transactional templates, not a visual editor pipeline. Could be used for rendering but doesn't solve the block-to-email mapping.
- **CSS inliner (juice)**: Could render blocks normally then inline the CSS. Rejected because the web render uses Tailwind classes + modern CSS that simply don't translate to email (flex, grid, etc.).

## 2. Email-Compatible Block Subset

**Decision**: Support 12 block types in email mode:

| Block Type | Email Support | Notes |
|-----------|--------------|-------|
| text | Full | Inline-styled `<p>` tags |
| heading | Full | `<h1>`-`<h6>` with inline styles |
| image | Full | `<img>` with width/height attributes, alt text |
| button | Full | Table-based button (VML fallback for Outlook) |
| spacer | Full | Empty `<td>` with height |
| divider | Full | `<hr>` or 1px table row |
| columns | 2-col max | Nested tables, stack on mobile via media query |
| quote | Full | Left-border table cell |
| section | Full | Background-colored table wrapper |
| social-links | New (email-only) | Icon row linking to social profiles |
| header | New (email-only) | Logo + optional tagline |
| footer | New (email-only) | Unsubscribe link, address, branding |

**Rejected from email**: video, youtube, code, tabs, accordion, gallery, all palizzi-*, all product-*, booking, survey, blog-posts, card-grid, stats, testimonial, services-grid, featured-content, hero, cta (complex layout).

## 3. Storage Strategy -- Block JSON vs. Rendered HTML

**Decision**: Store block JSON in a new `blockContent` column; render to `htmlContent` on save/send.

**Rationale**: 
- Campaigns need the block JSON to re-edit in the visual editor
- The existing `htmlContent` column continues to hold the final rendered HTML for sending
- `buildCampaignHtml()` wrapper (unsubscribe, preview text, headers) stays unchanged
- Templates also get a `blockContent` column for the same reason

**Alternatives considered**:
- Storing only block JSON and rendering on-the-fly at send time: Risky because if rendering logic changes, old campaigns could render differently. Better to snapshot the HTML.
- Replacing `htmlContent` with block JSON: Breaks backward compatibility with existing raw HTML campaigns.

## 4. Editor Integration Approach

**Decision**: Create an `EmailBlockEditor` wrapper component that configures the existing `VisualBlockEditorEnhanced` with email constraints:
- Filtered block picker (only email-compatible blocks)
- Fixed 600px viewport (no responsive switcher)
- Email-specific block preview styling
- Live email preview pane (rendered HTML in iframe)

**Rationale**: Reusing the existing editor avoids duplicating drag-and-drop, undo/redo, block selection, and all other editor infrastructure. The editor already supports being configured with different block sets.

## 5. Email Preview

**Decision**: Side-by-side editor + preview layout. Preview renders blocks through `renderBlocksToEmailHtml()` displayed in a sandboxed iframe.

**Rationale**: Users need to see exactly what recipients will get. An iframe isolates email styles from the app. Toggle between desktop (600px) and mobile (320px) preview widths.

## 6. Template Integration

**Decision**: Email templates become saveable block configurations. Users can:
- Start from a blank canvas or pick a template
- Save any campaign design as a reusable template
- Templates store block JSON in `blockContent`, rendered HTML in `htmlContent`

This mirrors the existing CMS template library pattern (`SaveAsTemplateModal`, `TemplateLibrary`).
