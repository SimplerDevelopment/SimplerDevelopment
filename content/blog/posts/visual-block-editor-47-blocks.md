---
title: "Visual Block Editor: 47 Blocks, Live Preview, Collaboration"
slug: visual-block-editor-47-blocks
description: "The visual block editor ships with 47 content blocks, a live iframe preview of your real site, breakpoint switcher, real-time collaboration, and contextual AI restyle."
date: 2026-06-27
tags:
  - feature-release
  - websites
  - cms
  - visual-editor
  - collaboration
  - agency-workflow
author: "SimplerDevelopment Team"
draft: true
canonical: "https://example.com/blog/visual-block-editor-47-blocks"
---

Most page builders sit somewhere on a spectrum between "developer-only" and "point-and-click with shallow options." Developer-only tools require a deployment for every copy change; shallow point-and-click builders hit their ceiling the moment a design calls for anything non-standard. The visual block editor in the client portal is built to serve both audiences without compromising for either.

This post covers what the editor ships with: 47 built-in block types, a live iframe preview that loads your actual production renderer, breakpoint switching, Yjs-powered real-time collaboration, contextual AI restyle, and reusable block templates. It also covers what the editor deliberately does not do, so you can route those use cases to the right surface.

The editor is part of the CMS domain. It works on any post type — standard pages, blog posts, and any custom post type you have configured.

---

## What Is a Block?

Every page in the CMS is a JSON block tree: a structured array of typed content units. Each block has a `type` — `hero`, `text-column`, `image-gallery`, `cta-button`, `embed`, and so on — and a typed settings object whose shape is defined per block type.

Storing content as structured JSON rather than freeform HTML has practical consequences beyond aesthetics. Block content is portable across renderers, diff-able in version history, and directly readable by AI agents via the `blocks://schema` MCP resource, which exposes the full block JSON schema to any connected MCP client.

### The block registry

47 block types are registered platform-wide. They cover text, hero sections, multi-column layouts, image grids, video embeds, call-to-action buttons, forms, interactive elements, and more. All 47 types are available to every tenant without any installation or activation step — universality is an architectural property of the registry, not a per-tenant configuration.

One exception worth noting: the `roi-calculator` block is registered and renders, but a portion of its settings inputs are not yet fully wired. Only the title and description fields are connected to the settings panel at this stage. The remaining calculator inputs are tracked as a known backlog item; avoid relying on `roi-calculator` for production content until that work ships.

---

## The Editor — A Tour

The editor is a split-panel interface wrapped around a live iframe. The left panel manages block structure; the right panel manages per-block settings; the iframe is the page itself.

### Live iframe preview

When you open a post in the editor, the iframe loads your site's actual public renderer — the same Next.js routes, the same Tailwind CSS, the same branding profile that serve your site to visitors. There is no separate "preview mode" toggle. The iframe is always the real thing. Changes made in the settings panel apply to the iframe in real time, without a save step, so you see the full design consequence of each setting before committing.

[screenshot: Full editor view — block picker open in the left panel, an active page visible in the iframe, right-panel settings sidebar populated for the selected block]

### Left panel — block picker and layers

The left panel has two tabs. The block picker lists all 47 block types organized by category (text, media, layout, interactive, and so on) with a search field for fast access by name. Selecting a type inserts a new block instance at the current position in the page.

The layers panel shows a hierarchical list of every block on the current page. Clicking a block in the layers panel selects it and scrolls the iframe to it. Dragging within the layers panel reorders blocks on the page.

### Right panel — settings sidebar

Each block type has its own settings schema. When a block is selected, the right panel renders that block's input form. Settings include text fields, color pickers, media selectors, toggle switches, and structured repeater fields depending on the block type. Every change updates the iframe preview live — no save required to see the result.

### Inline editing

Text blocks support click-to-edit directly in the iframe. Clicking a text element activates an inline editor at that position; no need to open the settings panel for routine copy changes. Media blocks open the per-site media library picker when their placeholder is clicked.

### Drag to reorder

In addition to the layers panel drag handle, blocks can be dragged within the iframe to change page order. Undo and redo track all reorder and edit operations within the current session.

[GIF: Block drag-and-drop reorder — one block dragged above another and released (~5 sec)]

---

## Breakpoint Preview

The editor toolbar includes a breakpoint switcher: desktop, tablet, and mobile. Switching breakpoints resizes the sandboxed iframe to that viewport width — responsive behavior is exercised against the real renderer, not approximated by a scaled screenshot. Block types that shift from multi-column layouts on desktop to single-column on mobile will do so in the editor exactly as they do on the published site.

Checking mobile breakpoint before publishing any new page is recommended practice, particularly for hero sections and image-grid blocks, which are the most likely to shift layout at narrow viewports.

[screenshot: Editor with mobile breakpoint active — single-column layout visible in the iframe]

---

## Real-Time Collaboration

Multiple portal users can edit the same page simultaneously. Collaboration is powered by [Yjs](https://yjs.dev/), a conflict-free replicated data type (CRDT) library. When two editors make overlapping changes, Yjs merges them without conflict; there is no "last save wins" race condition.

A presence bar at the top of the editor shows an avatar for each connected user. The block that each collaborator has selected is highlighted in the iframe, so both parties can see where the other is working. This makes the editor usable for real-time review sessions — a designer and a client reviewer can iterate on the same page during a shared call, with each seeing the other's selections as they happen.

[screenshot: Presence bar showing two user avatars; two distinct blocks highlighted in the iframe simultaneously]

---

## Contextual AI Restyle

With a block selected, an AI restyle panel is available in the settings sidebar for compatible block types (currently text blocks and hero blocks). The panel proposes copy and style adjustments grounded in the selected block's content and the tenant's active branding profile.

AI restyle does not overwrite block content automatically. Every suggestion is presented as a proposal; the editor either accepts or discards each one. This keeps the AI surface additive rather than disruptive — it extends the editor without removing the editor's control.

---

## Block Templates — Save and Reuse Layouts

Any configured block, or a set of blocks, can be saved as a named block template. Templates are per-tenant and available to all portal users in that tenant's account. Opening the block template picker shows all saved templates; selecting one inserts a pre-configured block instance at the current position.

A common use: configure a hero section with a specific headline structure, button style, and background setting, save it as a template, and apply it to every new campaign landing page in a single step instead of rebuilding from defaults each time.

[screenshot: Block template picker modal with two or three saved templates visible]

---

## What the Editor Does Not Do

A few scope limits are worth stating explicitly.

**No freeform HTML block.** Page content is always structured JSON. If you need to inject custom HTML or CSS at the site level, use the per-site custom code injection available under site settings — that is the correct surface for raw code. There is no freeform HTML block type in the page editor.

**Email campaigns use a separate editor.** The visual block editor described here is the surface for website pages and posts. Email campaigns have their own block editor flow under the Email Campaigns module. The two editors share concepts but are separate interfaces.

**Publishing channels.** The editor saves and publishes to the site. Email is the built-in channel for distributing published content to subscribers. Social media publishing and webhook publishing channels are not currently available.

---

## Accessing the Editor

The editor is available at **Websites → [Site] → Posts** in the portal. Any post's "Edit" button opens the full visual editor. Portal users with the `editor` role or above can access it.

For programmatic access, block content is read and written through the CMS MCP tools: `posts_create` and `posts_update`. AI agents interact with the block JSON directly — there are no dedicated MCP tools for the visual canvas itself. The `blocks://schema` MCP resource provides the full registry schema so agents can construct and validate block trees against the same type definitions the editor uses.

---

## Conclusion

The visual block editor ships as a complete page-building surface: 47 universal block types, a live iframe preview that loads your production renderer, breakpoint checking, Yjs real-time collaboration, contextual AI restyle, and reusable block templates — all in a single interface.

The underlying data model is JSON. A page built in the visual editor is the same JSON block tree readable and writable by MCP tools, which means the same content is as programmable via automation as it is editable by hand.

---

## Related reading

- [Website Builder & CMS feature overview](/solutions/websites)
- [AI Agent Platform — blocks://schema MCP resource](/solutions/ai-connect)
- [Block Editor Guide](/docs/guides/BLOCK_EDITOR_GUIDE.md)
- [How to launch a client website end-to-end](/blog/launch-client-website-end-to-end)
- [Automations & Workflows — trigger on content publish](/solutions/automations)

---

*Ready to build?* Open the editor at **Websites → [Site] → Posts → Edit** in your portal, or [read the block library guide](/docs/guides/BLOCK_EDITOR_GUIDE.md) for the full block type reference.
