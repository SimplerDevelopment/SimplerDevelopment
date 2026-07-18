---
title: "How to Launch a Client Website in One Portal"
slug: launch-client-website-end-to-end
description: "Step-by-step guide: create a site, set a custom domain, configure branding, build pages with 47 content blocks, and publish — all inside the client portal."
date: 2026-06-27
tags:
  - tutorial
  - websites
  - cms
  - visual-editor
  - agency-workflow
author: "SimplerDevelopment Team"
draft: true
canonical: "https://example.com/blog/launch-client-website-end-to-end"
---

Setting up a new client website typically means juggling three or four separate tools: a domain registrar, a CMS login, a page builder, and maybe a separate design handoff environment. Getting all of them to agree — on branding, on content, on who publishes what — adds coordination overhead before a single page goes live.

This guide walks through the entire flow inside a single portal: from creating a site record and wiring up a custom domain, through branding and navigation, through building page content with content blocks, and finally to publishing the first live page. It covers the websites, CMS, and visual editor surface. Storefront, bookings, and email campaign setup are separate workflows not covered here.

---

## Step 1 — Create the Site and Assign a Domain

### Create a new site record in the portal

Navigate to **Websites** in the portal sidebar. Click **New site**, give it a name, and save. The site name becomes the internal identifier used throughout the portal — in the site settings, in the content calendar, and in MCP tool calls if you automate any part of this workflow.

[screenshot: Site creation form — name field populated, save button visible]

### Add a custom domain

From the site's settings page, open the **Domains** tab. Enter the domain you want to assign and click **Add domain**. The portal handles domain records per site; there is no separate DNS dashboard to open.

Point your DNS A or CNAME records to the hosting layer's IP or hostname (visible in the Hosting section of the portal). SSL is terminated by the hosting layer — no manual certificate provisioning is needed. After DNS propagation, the site will be reachable at the custom domain within a few minutes.

> **Note:** Host-header validation via a full database lookup in middleware is planned for a future release. Custom domains currently work through DNS routing at the hosting layer.

[screenshot: Domain add dialog — domain field populated, existing domain shown in list]

### Configure per-site environment variables (optional)

If the site needs secrets at the rendering layer — for example, a per-tenant API key for a third-party embed — use the **Environment variables** tab on the site settings page to add them. They are injected at the site level and are not shared across tenants.

---

## Step 2 — Set Up Branding

### Create or assign a branding profile

Before building pages, establish the visual foundation. Go to **Branding** in the portal and create a profile for this client (or select an existing one if this client already has one from a prior engagement). A branding profile defines the color palette, typography settings, and logo assets.

Profiles are reusable: you can apply the same profile to multiple sites for clients who maintain more than one web property. For bulk onboarding, branding profiles can also be provisioned programmatically via the `branding_create_profile` MCP tool.

[screenshot: Branding profile editor — color swatches, font pickers, and logo upload visible]

### Apply custom CSS and JavaScript

For any style overrides that go beyond what the branding profile covers, the site settings include a **Custom code** tab for per-site CSS and JavaScript injection. Use it sparingly — the branding profile handles the common cases and keeps overrides auditable.

### Build the navigation tree

With branding in place, open the **Navigation** editor (under the site's settings). Add top-level nav items, nest sub-items, and set labels and destination URLs.

Navigation is published independently from page content. When all nav changes are ready, click **Publish navigation** to push the tree live. If you manage navigation programmatically, the `nav_publish_all` MCP tool publishes all pending navigation changes for a site in a single call.

[screenshot: Navigation editor — two-level nav tree with a parent item expanded to show child links]

---

## Step 3 — Create Content with Blocks

### Understanding blocks

All page content in the portal is structured, not freeform. A page is a JSON block tree — an ordered list of typed content units called blocks. There are 47 built-in block types: text columns, hero sections, image galleries, call-to-action rows, embeds, forms, and more. All 47 types are available to every tenant with no per-tenant installation or configuration step.

Because the content model is structured data rather than raw HTML, it is portable: the same block tree can be rendered by the public-site renderer, previewed in the visual editor, and read or written by AI agents via the CMS MCP tools.

### Create a new post (page)

From the site's **Posts** list, click **New post**. Set the URL slug, choose the post type (page, blog post, or a custom post type if one has been configured for this site), and fill in the SEO fields — title, description, and open graph image.

Every new post starts with an empty block tree. The block content is added in the visual editor in the next step.

[screenshot: Post list with New post button visible; block type picker in the editor left panel showing several block types]

### Create custom post types and fields (optional)

If the client needs structured content beyond standard pages — a team member directory, case study archive, or product catalogue — define a custom post type from the site's **Content types** settings. Custom field schemas are defined per tenant, so each client's content model is isolated.

---

## Step 4 — Build the Page in the Visual Editor

### Open the visual block editor

With the post created, click **Edit** to open the visual block editor. The editor is at the route `/websites/[siteId]/posts/[postId]/edit/` in the portal.

The editor loads the actual public-site renderer in a sandboxed iframe. What you see in the editing canvas is exactly what a visitor will see on the live site — including the client's CSS, fonts, and branding. There is no separate preview mode to open.

[screenshot: Visual editor — iframe showing live site preview, left panel with block picker open, right panel with block settings visible]

### Add, reorder, and configure blocks

To add a block, select a type from the **left panel** block picker. The block appears at the bottom of the page; drag it by its handle to reorder it relative to other blocks.

Click any block to open its configuration in the **right-side settings panel**. Text blocks support inline editing directly in the canvas. Media blocks (images, galleries, video embeds) open the site's media library so you can select an existing asset or upload a new one.

[GIF placeholder: drag-and-drop reorder — one block dragged above another and released (~5 sec)]

### Preview at different breakpoints

The editor toolbar includes a breakpoint switcher. Toggle between **Desktop**, **Tablet**, and **Mobile** to re-render the iframe at each viewport width. The public-site renderer handles the layout change; you are seeing the same responsive output the visitor will see.

[GIF placeholder: breakpoint toggle — desktop → tablet → mobile and back (~4 sec)]

[screenshot: Editor toolbar with mobile breakpoint active — narrow iframe showing stacked layout]

### Use block templates to speed up layout

Once you have a block configuration you will reuse — a branded hero section, a standard CTA row — save it as a named **block template** from the block's context menu. Block templates are scoped to the tenant and available to all editors working on any site within that tenant.

On a new page, open the block template picker from the left panel to insert a saved layout in one click.

### Collaborate in real time

Multiple team members can work in the same post simultaneously. The **collaboration bar** at the top of the editor shows a presence avatar for each active editor. Each user's selected block is highlighted in the canvas so editors can see what their colleagues are working on.

Real-time synchronization uses Yjs CRDT. Both the Yjs WebSocket server and the portal must be reachable for presence to appear.

### Undo, redo, and save

The editor maintains a session undo/redo history. Use the toolbar buttons or standard keyboard shortcuts to step backward or forward through changes. The block tree is saved as JSON in the post record — either manually via the **Save** button or automatically by autosave.

---

## Step 5 — Publish and Organize

### Publish the page

When the page is ready, change its status from **Draft** to **Published** in the post settings. The page is immediately live at its URL slug on the site's domain.

### Schedule content with the publishing calendar

For content that should go live on a future date, open the **Content calendar** from the publishing section of the portal. The month view shows all posts and their scheduled dates. Set a publish date on any post to slot it into the calendar; the calendar gives the team a shared view of what is coming up.

The **Publishing board** (kanban view) tracks content through its lifecycle — from Draft, through Review, to Published — so stakeholders can see status at a glance.

[screenshot: Content calendar — month view with three or more items placed on different dates]

### Organize with taxonomies

Categories and tags are managed per site. Apply them to posts from the post's settings panel to group related content. The public site renderer can surface taxonomy archives for navigational browsing and filtering.

### Push published content to subscribers via email

The built-in publishing channel is email. Once a post is published, link it to an email campaign from the **Campaigns** surface in the portal to send it to a subscriber list. Social media and webhook publishing channels are not yet available.

---

## Troubleshooting

**Domain not resolving after adding it:** Confirm that the DNS A or CNAME record points to the hosting layer's address. SSL provisioning starts after DNS propagation and can take a few minutes.

**Block changes not visible on the live site:** Confirm the post status is **Published**, not Draft. If a CDN or caching layer is in front of the site, a cache purge may be required.

**Collaboration presence not appearing:** Both editors must be on the same post in the editor at the same time. Confirm the Yjs WebSocket server is reachable from both sessions.

---

## Wrapping Up

Five steps, one portal: create the site and domain, set branding and navigation, create content posts, build pages in the visual editor, and publish. Each step uses the same portal surface — no context switching to a separate CMS, no manual certificate provisioning, no design handoff export.

The same workflow is available to AI agents: 42 MCP CMS tools cover sites, posts, navigation, taxonomies, block templates, media, domains, and environment variables, making bulk or programmatic content publishing a first-class option alongside the visual editor.

---

## Next Steps

- [Website Builder & CMS — feature overview](/solutions/websites)
- [AI Agent Platform — CMS MCP tools](/solutions/ai-connect)
- [Block Editor Guide](/docs/guides/BLOCK_EDITOR_GUIDE.md)
- Related tutorials: "Build an automation rule" · "Migrate your content in"

---

**Start building client websites →** [Get started in the portal](/onboarding)

**Explore the block library →** [Block Editor Guide](/docs/guides/BLOCK_EDITOR_GUIDE.md)
