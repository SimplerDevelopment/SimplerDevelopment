---
type: blog-outline
phase: 10
post-type: tutorial
slug: launch-client-website-end-to-end
status: outline
date: 2026-06-27
sources:
  - marketing/feature-pages/websites-cms-visual-editor.md
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domains 1, 2, 3)
  - marketing/seo/seo-plan.md
---

# Outline: Launch a Client Website End-to-End

## SEO Metadata

| Field | Value |
|---|---|
| **Title (≤60 chars)** | How to Launch a Client Website in One Portal |
| **Meta description (≤155 chars)** | Step-by-step guide: create a site, set a custom domain, configure branding, build pages with 47 content blocks, and publish — all inside the client portal. |
| **URL slug** | `/blog/launch-client-website-end-to-end` |
| **Canonical** | `https://example.com/blog/launch-client-website-end-to-end` |
| **Target audience** | Agency admins and account managers onboarding a new client website |
| **Primary keyword** | how to launch a client website |
| **Secondary keywords** | agency website setup tutorial, block-based website builder guide, visual block editor walkthrough, publish website from portal, custom domain setup agency |

---

## H2 / H3 Outline

### Intro (no heading — editorial lead)

- Hook: the manual pain of coordinating domain registrar, CMS, and design tool for each new client
- Premise: this guide walks through the entire flow — site creation to first published page — using one portal
- What is covered and what is not (scope: websites/CMS/visual editor; out of scope: storefront, bookings, email campaigns)

---

### H2: Step 1 — Create the Site and Assign a Domain

- **H3: Create a new site record in the portal**
  - Navigate to Websites in the portal and create a new site
  - Set the site name and internal label (used as an identifier in the portal and MCP tools)
- **H3: Add a custom domain**
  - Domain management is handled inside the portal; no separate DNS dashboard needed
  - Adding and removing domains; SSL is terminated by the hosting layer
  - Note: the full DB-lookup middleware gate for host-header validation is planned for a future release; custom domains work via the current DNS routing approach
- **H3: Configure per-site environment variables (optional)**
  - Use `website_env_vars_set` if you need per-site secrets injected at the site level

**Screenshot requirement:** Site creation form + domain add dialog

---

### H2: Step 2 — Set Up Branding

- **H3: Create or assign a branding profile**
  - Branding profiles define colors, typography, and logos
  - A profile can be reused across sites or created per site
  - The `branding_create_profile` MCP tool can provision profiles programmatically during bulk onboarding
- **H3: Apply custom CSS and JavaScript**
  - Per-site code injection is available for one-off style overrides; keep it minimal — branding profiles cover most needs
- **H3: Build the navigation tree**
  - Navigation is edited in the navigation editor: add top-level items, nest sub-items, set labels and URLs
  - Publish the navigation separately from page content; `nav_publish_all` publishes all pending nav changes at once

**Screenshot requirement:** Branding profile editor (colors + logo visible) and navigation editor

---

### H2: Step 3 — Create Content with Blocks

- **H3: Understanding blocks**
  - Every page is a JSON block tree — there is no freeform HTML; content is structured data
  - 47 built-in block types: text, hero, image gallery, CTA, embed, forms, and more
  - Blocks are universal — all 47 types are available to every tenant; no per-tenant installation needed
- **H3: Create a new post (page)**
  - Use the post list to create a new post; set its URL slug, type (page, blog post, or a custom post type), and SEO fields
  - A new post starts with an empty block tree
- **H3: Pick content types and custom fields**
  - If the client needs structured content beyond standard pages (e.g., team members, case studies), create a custom post type with the fields that match the data
  - Custom field schemas are defined per tenant

**Screenshot requirement:** Post list with new post button and block type picker (left panel of editor)

---

### H2: Step 4 — Build the Page in the Visual Editor

- **H3: Open the visual block editor**
  - The editor is at `/websites/[siteId]/posts/[postId]/edit/` in the portal
  - It loads the actual public-site renderer in a sandboxed iframe — what you see is what visitors will see
- **H3: Add, reorder, and configure blocks**
  - Pick a block from the left panel; it is added to the page
  - Drag blocks to reorder; click a block to open its settings in the right-side settings panel
  - Edit text inline; media blocks open the media library picker
- **H3: Preview at different breakpoints**
  - Toggle between desktop, tablet, and mobile breakpoints in the toolbar
  - The iframe re-renders the real renderer at that viewport
- **H3: Use block templates to speed up layout**
  - Save any block configuration as a named template; reuse across pages and sites
  - Block templates are per-tenant and available to all editors in that tenant
- **H3: Collaborate in real time**
  - Multiple editors can be in the same page at the same time
  - User presence avatars appear in the collaboration bar; each user's active block is highlighted
- **H3: Undo, redo, and save**
  - Undo/redo works across the current session
  - Save manually or rely on autosave; the block tree is stored as JSON in the post record

**GIF requirement:** Drag-and-drop reorder of two blocks (~5 sec); breakpoint preview toggle

---

### H2: Step 5 — Publish and Organize

- **H3: Publish the page**
  - Change the post status from draft to published; the page is immediately live at its URL slug on the tenant's domain
- **H3: Schedule content with the publishing calendar**
  - Use the per-site content calendar (month view) to schedule pages and posts
  - The publishing kanban board tracks the content lifecycle from draft to live
- **H3: Organize with taxonomies**
  - Categories and tags are managed per site; apply them to posts for navigational grouping and filtering on the public site
- **H3: Email channel: push published content to subscribers**
  - The built publishing channel is email; social and webhook channels are not yet available
  - Email campaigns can be linked to published content from the campaigns surface in the portal

**Screenshot requirement:** Content calendar month view with 3+ scheduled items; publishing kanban board

---

### H2: Troubleshooting Tips

- Domain not resolving: confirm DNS A/CNAME records point to the hosting layer; SSL provisioning can take a few minutes after DNS propagation
- Block changes not visible on live site: check that the post is published (not still in draft); check the site's cache/CDN if applicable
- Collaboration presence not appearing: ensure both users are on the same post in the editor; the Yjs WebSocket server must be reachable

---

### Conclusion

- Recap the five steps: site + domain → branding + nav → post + block content → visual editor → publish
- Reinforce that the same workflow is available to AI agents via 42 MCP CMS tools for bulk or programmatic publishing

---

## Internal Links

- [Website Builder & CMS feature page](/solutions/websites)
- [AI Agent Platform — CMS tools](/solutions/ai-connect)
- [Block Editor Guide](/docs/guides/BLOCK_EDITOR_GUIDE.md)
- [AI overview — MCP surface](/docs/agents/ai-overview.md)
- Related tutorial candidates: "Build an automation rule" (blog), "Migrate your content in" (blog)

---

## CTA

**Primary:** "Start building client websites" → `[portal URL]/onboarding`

**Secondary:** "Explore the block library" → `/docs/guides/BLOCK_EDITOR_GUIDE.md`

---

## Screenshot / GIF Requirements Summary

| Asset | Description | Notes |
|---|---|---|
| Screenshot | Site creation form + domain add dialog | Show domain field populated |
| Screenshot | Branding profile editor — colors, typography, logo visible | Use placeholder brand |
| Screenshot | Navigation editor — two-level nav tree | |
| Screenshot | Block type picker (left panel) with 3+ block types visible | |
| Screenshot | Visual editor — iframe preview of live site with block selected and settings panel open | |
| Screenshot | Breakpoint switcher in editor toolbar — mobile view active | |
| Screenshot | Content calendar — month view with scheduled posts | |
| GIF | Drag-and-drop block reorder | ~5 sec |
| GIF | Breakpoint toggle (desktop → tablet → mobile) | ~4 sec |
