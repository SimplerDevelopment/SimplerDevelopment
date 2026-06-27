---
phase: 8
feature: Sites & Visual Editor
slug: /features/websites-cms-visual-editor
status: spec-draft
date: 2026-06-27
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domains 1, 2, 3)
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
---

# Sites, CMS & Visual Editor — Marketing Spec

## Hero

**Headline:** Build and publish client websites with 47 content blocks and a live-preview visual editor.

**Subhead:** Each client tenant gets a full website — custom domain, branding, navigation, and a block-based page editor — managed from one portal without touching a separate CMS.

---

## Problem

Agencies typically stitch together a domain manager, a CMS, and a page builder — three tools, three logins, three places where things can fall out of sync. Clients who want to update a headline or swap an image have to open a support ticket instead of editing the page themselves.

Content publishing compounds the problem: scheduling posts, managing a content calendar, and coordinating email campaigns each live in separate workflows, making it hard to keep anything aligned.

---

## Solution

SimplerDevelopment puts website management, content editing, and publishing under each tenant's portal. Clients open the visual block editor, make changes against a live iframe preview of their actual site, and save — without a developer in the loop.

Every site ships with custom domain support, a branding profile (colors, typography, logos), a navigation editor, per-site CSS/JS injection, and a media library. A content calendar and publishing kanban board give teams a shared view of what's scheduled and what's live.

The entire surface is also available to AI agents: 42 MCP tools cover sites, posts, navigation, taxonomies, block templates, media, domains, and environment variables.

---

## Key Benefits

- **47 built-in block types** cover text, hero sections, image grids, CTAs, embeds, forms, and more — with per-tenant custom post types and custom field schemas for content beyond standard pages.
- **Live-preview visual editor** loads your actual public-site renderer in a sandboxed iframe — drag to reorder blocks, edit inline, preview at mobile/tablet/desktop breakpoints, and undo/redo without leaving the editor.
- **Multi-user real-time collaboration** via Yjs CRDT — two editors see each other's presence in the editor simultaneously.
- **Contextual AI restyle** is available within the editor for copy and style suggestions grounded in the open block.
- **Reusable block templates** let teams save and share common layouts across pages and sites; a global media library keeps assets organized per site or across the tenant.

---

## How It Works

1. **Provision a site:** Add a domain, set a branding profile (colors, typography, logo), and build the navigation tree — all from the portal settings or via MCP.
2. **Create content:** Open any page in the visual block editor. Pick from 47 block types in the left panel, drag to reorder, and edit text and media inline. Switch the preview breakpoint to check mobile and tablet layouts.
3. **Save and organize:** Save block configurations as reusable templates. Manage taxonomies (categories, tags) and custom post types for structured content beyond standard pages.
4. **Publish and schedule:** Use the content calendar and publishing kanban board to track drafts, schedule releases, and send content to subscribers via email campaigns.

---

## FAQs

**Q: What is a block?**
A block is a structured JSON content unit — a hero section, a text column, an image gallery, a CTA button, an embed, and so on. 47 types are registered platform-wide and available to all tenants. All page content is stored as a JSON block tree, not freeform HTML.

**Q: Can clients edit their own site without developer help?**
Yes. Portal users with the `editor` role can open the visual editor, make and preview changes, and publish — no code access required.

**Q: Does the editor show what the live site actually looks like?**
Yes. The visual editor loads your real public-site renderer in a sandboxed iframe. What you see in the editor is what visitors see, including your site's CSS and fonts.

**Q: Can I use my own domain?**
Yes. Domains are added through the portal and removed at any time. SSL termination is handled by the hosting layer; no manual certificate provisioning is needed.

**Q: What publishing channels are available?**
Email campaigns are the built publishing channel. Social media and webhook publishing are not yet available.

---

## SEO Block

| Field | Value |
|---|---|
| **Page title** | Website Builder & CMS for Agencies \| SimplerDevelopment |
| **Meta description** | Manage client websites with 47 content blocks, a live-preview visual editor, real-time collaboration, and email publishing — all in one tenant portal. |
| **URL slug** | /features/websites-cms-visual-editor |
| **Primary keyword** | visual website editor for agencies |
| **Secondary keywords** | agency CMS platform, block-based page builder, white-label website management, multi-tenant CMS, agency client website portal |

---

## Structured Data

Apply both types to this page:

**SoftwareApplication**
- `name`: "SimplerDevelopment – Sites, CMS & Visual Editor"
- `applicationCategory`: "WebApplication"
- `featureList`: ["47 built-in block types", "Live-preview visual block editor", "Multi-user real-time collaboration", "Custom domains and branding profiles", "Content calendar and publishing board", "42 MCP tools for AI agents"]
- `operatingSystem`: "Web"

**FAQPage**
- Wrap each FAQ Q&A pair in `mainEntity` → `Question` / `acceptedAnswer` → `Answer`.

---

## Internal Links

- [AI overview — CMS & MCP surface](../../docs/agents/ai-overview.md)
- [Glossary: Block](../../docs/agents/glossary.md#block)
- [Glossary: Visual Editor](../../docs/agents/glossary.md#visual-editor)
- [Glossary: Post](../../docs/agents/glossary.md#post)
- Sibling feature pages: [CRM](./crm.md) · [Company Brain](./company-brain.md) · [Storefront & Commerce](./storefront-commerce.md)

---

## Media Requirements

Capture these assets in Phase 5/6 (screen recording / screenshot pass):

| Asset | Screen / Workflow | Notes |
|---|---|---|
| Screenshot | Visual editor with block picker open (left panel), a page being edited, iframe preview of live site visible | Show at least 3 block types in the picker |
| Screenshot | Breakpoint preview switcher active (mobile view) | Illustrate responsive preview |
| Screenshot | Multi-user presence bar with two user avatars shown simultaneously | Requires two browser sessions open on same post |
| Screenshot | Block template picker modal | Show a saved template being selected |
| Screenshot | Content calendar — month view with scheduled posts | Show at least 3 items placed |
| GIF | Drag-and-drop block reorder in the editor | ~5 seconds; drag one block above another, release |
| GIF | Publishing kanban board — moving a card from "Draft" to "Published" | ~4 seconds |

---

## CTA

**Primary:** "Start building client websites" → `[portal URL]/onboarding`

**Secondary:** "Explore the block library" → `[docs URL]/guides/BLOCK_EDITOR_GUIDE.md`
