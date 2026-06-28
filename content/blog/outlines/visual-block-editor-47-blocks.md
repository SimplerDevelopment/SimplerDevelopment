---
type: blog-outline
phase: 10
post-type: feature-release
slug: visual-block-editor-47-blocks
status: outline
date: 2026-06-27
sources:
  - marketing/feature-pages/websites-cms-visual-editor.md
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domains 2, 3)
  - docs/agents/ai-overview.md
  - marketing/seo/seo-plan.md
---

# Outline: Feature Release — The Visual Block Editor

## SEO Metadata

| Field | Value |
|---|---|
| **Title (≤60 chars)** | Visual Block Editor: 47 Blocks, Live Preview, Collab |
| **Meta description (≤155 chars)** | The visual block editor ships with 47 content blocks, a live iframe preview of your real site, breakpoint switcher, real-time collaboration, and contextual AI restyle. |
| **URL slug** | `/blog/visual-block-editor-47-blocks` |
| **Canonical** | `https://example.com/blog/visual-block-editor-47-blocks` |
| **Target audience** | Agency admins, content managers, and developers evaluating a block-based page builder |
| **Primary keyword** | visual block editor for agencies |
| **Secondary keywords** | drag-and-drop block editor, live preview page builder, real-time collaboration CMS, 47 content blocks, block-based page builder |

---

## H2 / H3 Outline

### Intro (no heading)

- What this post announces: the visual block editor is the primary page-editing surface in the client portal
- Why it matters: most agencies either use a developer-only CMS or a point-and-click builder with shallow block options — this editor is built to serve both editors and developers without compromise
- Scope note: the editor is part of the CMS domain; it works on posts, pages, and any custom post type

---

### H2: What Is a Block?

- Every page is a JSON block tree — a structured list of typed content units, not freeform HTML
- A block has a type (e.g., `hero`, `text-column`, `image-gallery`, `cta-button`, `embed`) and a typed settings object
- Why JSON matters: content is portable, diff-able, and AI-readable via the `blocks://schema` MCP resource
- **H3: The block registry**
  - 47 block types are registered platform-wide and available to all tenants; no per-tenant installation steps
  - Block types are universal: any content modeled as a block renders consistently across every tenant's site renderer
  - Note on `roi-calculator` block: some settings inputs are partially wired — this is a known item in the product backlog

---

### H2: The Editor — A Tour

- **H3: Live iframe preview**
  - The editor loads the actual public-site renderer in a sandboxed iframe — the same code that serves your site to visitors
  - Fonts, colors, branding profile, and CSS are all rendered as-is; what you see is what your visitors see
  - No "preview mode" toggle; the preview is always live
- **H3: Left panel — block picker and layers**
  - Block picker: organized by category (text, media, layout, interactive, etc.); search by name
  - Layers panel: hierarchical view of all blocks in the current page; click to select, drag to reorder
- **H3: Right panel — settings sidebar**
  - Each block type has its own settings schema; the right panel renders the input form for the selected block
  - Changes apply to the iframe preview in real time — no save required to see the result
- **H3: Inline editing**
  - Text blocks support click-to-edit inline; no need to open the settings panel for copy changes
  - Media blocks open the per-site media library picker when their placeholder is clicked
- **H3: Drag to reorder**
  - Blocks can be dragged within the layers panel or directly in the iframe to change page order
  - Undo/redo tracks all reorder operations in the current session

**GIF requirement:** Drag-and-drop block reorder (~5 sec); inline text edit (~4 sec)

---

### H2: Breakpoint Preview

- Toggle between desktop, tablet, and mobile breakpoints in the editor toolbar
- The sandboxed iframe re-renders at that viewport width — responsive behavior is exercised in the editor, not approximated
- Recommended use: check mobile breakpoints before publishing any new page; many block types shift from multi-column to single-column layouts at mobile widths

**Screenshot requirement:** Editor with mobile breakpoint active, showing different layout from desktop

---

### H2: Real-Time Collaboration

- Multiple editors can work on the same page simultaneously
- Powered by Yjs CRDT — each user's changes are merged without conflicts; no "who saved last wins" overwrite
- A presence bar at the top of the editor shows collaborator avatars; the active block for each user is highlighted in the iframe
- Use case: agency designer and client reviewer iterate together in a live call; both see each other's block selections in real time

**Screenshot requirement:** Collaboration presence bar with two user avatars; two blocks highlighted in the iframe

---

### H2: Contextual AI Restyle

- With a block selected, the AI restyle panel proposes copy and style adjustments grounded in the open block's content and the tenant's branding profile
- AI restyle does not overwrite content automatically; it proposes changes that the editor accepts or discards
- Works with text and hero blocks; the panel surfaces in the settings sidebar

---

### H2: Block Templates — Save and Reuse Layouts

- Any configured block or set of blocks can be saved as a named block template
- Templates are per-tenant and available to all portal users in that tenant
- Opening the block template picker shows all saved templates; selecting one inserts a pre-configured block instance
- Common use: save a "hero section with CTA" layout once; apply it to every new campaign landing page with one click

**Screenshot requirement:** Block template picker modal with 2–3 templates visible

---

### H2: What the Editor Does Not Do (Scope Limits)

- No freeform HTML block: page content is always structured JSON — for raw HTML injection, use the per-site custom code (CSS/JS) injection, not a block
- No email block editor in this surface: email campaigns use a separate block editor flow in the Email Campaigns module
- Publishing channels: the editor saves and publishes to the site; email is the built channel for distributing published content; social and webhook publishing channels are not yet available
- Voice assistant: the voice assistant widget is built but is not currently mounted in the portal — do not reference it as an available feature

---

### H2: Accessing the Editor

- Navigate to any post in the portal under Websites → [Site] → Posts, then click "Edit"
- The editor is available to portal users with the `editor` role or above
- MCP access: content is read and written via `posts_create` / `posts_update` tools; the editor itself has no dedicated MCP tools — AI agents interact with the block JSON, not the visual canvas

---

### Conclusion

- Summary: 47 block types, live iframe preview, breakpoint checks, real-time collaboration, AI restyle, and reusable templates — all in a single editing surface
- Reinforce: the block tree is JSON, so it is as programmable via MCP as it is editable via the visual canvas

---

## Internal Links

- [Website Builder & CMS feature page](/solutions/websites)
- [AI Agent Platform — blocks://schema resource](/solutions/ai-connect)
- [Block Editor Guide](/docs/guides/BLOCK_EDITOR_GUIDE.md)
- [Launch a client website end-to-end (tutorial blog post)](/blog/launch-client-website-end-to-end)
- [Automations & Workflows — trigger on content publish](/solutions/automations)

---

## CTA

**Primary:** "Try the visual editor" → `[portal URL]/websites`

**Secondary:** "Read the block library guide" → `/docs/guides/BLOCK_EDITOR_GUIDE.md`

---

## Screenshot / GIF Requirements Summary

| Asset | Description | Notes |
|---|---|---|
| Screenshot | Editor full view — block picker open, iframe preview of live site visible, right panel with settings | Show 3+ block types in picker |
| Screenshot | Mobile breakpoint view active in editor | Side-by-side with desktop view if layout allows |
| Screenshot | Collaboration presence bar with two avatars, two highlighted blocks | Requires two browser sessions open on same post |
| Screenshot | Block template picker modal with 2–3 saved templates | |
| GIF | Drag-and-drop block reorder | ~5 sec |
| GIF | Inline text edit in iframe | ~4 sec |
