---
title: "Migrate CRM Contacts and Content: A Step-by-Step Guide"
slug: migrate-crm-contacts-content-guide
description: "How to bring your CRM contacts, companies, deals, and website content into the portal — using the UI, MCP tools, or REST API. Includes a pre-migration checklist."
date: 2026-06-27
tags:
  - migration
  - crm
  - cms
  - mcp
  - agency-workflow
author: "SimplerDevelopment Team"
draft: true
canonical: "https://example.com/blog/migrate-crm-contacts-content-guide"
seo:
  title: "Migrate CRM Contacts and Content: A Step-by-Step Guide"
  description: "How to bring your CRM contacts, companies, deals, and website content into the portal — using the UI, MCP tools, or REST API. Includes a pre-migration checklist."
  keywords:
    - migrate CRM contacts to agency platform
    - CRM data migration guide
    - import CRM contacts
    - migrate website content to block CMS
    - agency platform migration
    - import website content blocks
---

Consolidating onto a single platform is a big step. The tooling decision is made, onboarding is underway — but the question that usually surfaces next is practical: how do you move years of CRM contacts, companies, deals, and website content without data loss, manual re-entry, or disrupting active client work?

This guide walks through each migration path available: CRM records (contacts, companies, deals, and associated artifacts), website content (posts and pages as block trees, media assets, taxonomies, and custom post types), and the verification steps that tell you the migration is complete before you decommission anything.

**What this guide does not cover:** email subscriber list migration (handled in the email campaigns documentation), storefront product catalog migration (separate guide), and bookings or appointment history.

The platform does not impose a proprietary lock-in format. CRM records are addressable through both the portal UI and the MCP tool surface. Content is stored as JSON block trees that can be imported directly via MCP or rebuilt in the visual editor. You own the shape of the data.

---

## Before You Migrate — Preparation Checklist

### Audit what you have

Before touching the destination environment, inventory the source:

- **CRM records:** Export or list your current contacts (fields in use), companies, deals (pipeline stages, custom fields, attached documents), and any active proposals.
- **Website content:** List every page, blog post, and landing page — note which are live, which are drafts, and which have complex layouts that may require closer attention during rebuild.
- **Email subscribers:** Identify which contacts also appear on email lists. Handle those separately through the email list import flow, not through CRM migration — they live in a different data model.

### Map your data to the platform schema

Review the field mapping before writing a single import script. The core fields for each entity are:

- **Contacts:** `email`, `firstName`, `lastName`, `phone`, `company`, `notes` — and any custom fields you want to define.
- **Companies:** `name`, `domain`, `industry`, `notes`.
- **Deals:** `title`, `value`, `stage` (must reference a valid pipeline stage ID), associated `contactId` and `companyId`.
- **Content:** Identify which pages map to standard post types and which require custom post types — for example, team member bios, case studies, or FAQs typically benefit from their own post type with purpose-built fields.

### Set up the destination tenant first

Importing into a configured tenant is significantly cleaner than reconfiguring after the fact:

1. Create the tenant in the admin panel and run the onboarding wizard to configure branding and navigation.
2. Create your CRM pipelines and stages in **CRM Settings** before importing any deals — deal records must reference a valid `stageId`, and that stage must already exist.
3. Define any custom CRM fields you plan to use before importing records.

---

## Importing CRM Contacts and Companies

Three paths are available depending on your volume and preference.

### Path A — Portal UI (small volumes)

Create contacts from **CRM → Contacts → New Contact**. Fill in the core fields, save, and then attach custom field values from the contact detail page.

This path is best for under 50 contacts or for high-value contacts you want to review manually during entry. For anything larger, use Path B.

[screenshot: Contacts list with multiple records and custom field columns visible]

### Path B — MCP tools (bulk, programmable)

The MCP tool surface is the recommended path for bulk migration. Authentication uses a portal API key with the `crm:write` scope (`sd_mcp_` prefix), sent as `Authorization: Bearer <credential>` to `POST /api/mcp`.

The recommended import sequence is:

1. **Companies first:** call `crm_companies_create` for each company record. Capture the returned company ID.
2. **Contacts second:** call `crm_contacts_create` with the `companyId` from step 1 set as the company association.
3. **Custom field values:** if you defined custom fields in the preparation step, call `crm_custom_field_values_set` per record to populate them. (If a field does not exist yet, create it first with `crm_custom_fields_create`.)
4. **Deals last:** call `crm_deals_create` with the `pipelineId`, `stageId`, and associated `contactId` and `companyId` values from the prior steps. Set `title`, `value`, and `dueDate` from your source data.

Each tool call creates one record. Script sequential calls from a loop over your export CSV or JSON. The MCP surface makes no guarantees about rate limits in published documentation — build in conservative pacing if your volume is large.

> **Note on REST v1:** The REST v1 API (`/api/v1/`) is a read-only surface covering published content. It does not support CRM record creation. Use the MCP surface (Path B) for all write operations.

### Verifying the import

After a bulk run:

- Spot-check 5–10% of contacts in the portal Contacts list.
- Open a contact detail page and confirm custom field values are populated.
- Call `crm_contacts_search` with no filter to get the full record count and compare it against your source total.

[screenshot: Contact detail with custom fields populated]

---

## Importing Deals and Proposals

### Import deals via MCP

With contacts and companies in place, import deals using `crm_deals_create`. The `pipelineId` and `stageId` parameters must match stages you configured in the preparation step — look them up via `crm_pipelines_list` if you do not already have the IDs.

[screenshot: Deals kanban with multiple stages and deal cards visible]

### Reattach historical proposals and contracts

New proposals should be created in the portal proposal builder. Historical signed contracts and proposal PDFs are best handled as file artifacts rather than re-created through the e-sign flow: link them to the relevant deal record using `crm_deal_artifact_link`. That keeps them surfaced in context without generating a new signing workflow.

### Log significant past activity

The `crm_activities_create` tool lets you log milestone events — calls, key meetings, significant decisions — as activity entries on a contact or deal. Importing the complete history of every email thread is not recommended; focus on milestone events that give a future team member meaningful context at a glance.

---

## Migrating Website Content

Content migration is more involved than CRM migration because the target format is a typed JSON block tree. Choose an approach that matches your source.

### Option 1 — Recreate pages in the visual editor

Open the post or page in the visual editor and rebuild it using the 47+ built-in block types: hero sections, rich text, images, galleries, CTAs, embeds, forms, and more. Block pickers, drag-and-drop, inline text editing, and responsive breakpoint previews are all available during rebuild.

This is the best path for sites with under about 20 pages, or for pages where the visual design is the primary consideration — cases where you want to walk the content intentionally as you move it rather than convert it programmatically.

### Option 2 — Import HTML via `posts_upload_html`

The `posts_upload_html` MCP tool accepts raw HTML and converts it to a block tree, creating a post record with the result. This is efficient for content-heavy pages — blog posts, long-form documentation, articles — where the layout is straightforward and the value is in the text.

The HTML-to-block converter works best with clean, semantic HTML. Pages that rely heavily on custom CSS classes, inline styles, or JavaScript-driven rendering will require manual cleanup in the visual editor after import.

[screenshot: Post created from HTML upload — rendered in the visual editor with block tree visible]

### Option 3 — Construct block JSON directly

For structured source data — for example, a headless CMS with a documented export format — you can construct the block tree JSON directly and pass it to `posts_create` or `posts_update`. The `blocks://schema` MCP resource exposes the full input schema for each block type, giving an AI agent or a hand-written script the information it needs to build valid content.

This is the most precise path but requires the most up-front work to map your source structure to the block schema.

### Choosing your approach

| Source type | Recommended path |
|---|---|
| Content-heavy blog posts, documentation | `posts_upload_html` |
| Marketing pages with specific visual layouts | Visual editor rebuild |
| Structured content from another headless CMS | Block JSON construction |

---

## Migrating Media

### Upload via the portal media library

The portal media library (accessible globally or per-site) accepts images, videos, and documents. Drag-and-drop bulk upload is available from the media library interface — suitable for collections where you have files locally.

[screenshot: Media library with multiple uploaded images]

### Register media from external URLs

If your source media lives on a CDN that remains accessible during the migration window, use `media_upload_from_url` to register each asset by URL. The platform fetches and stores the asset without requiring a local download-then-upload cycle. This is the most efficient path when working from a CDN-backed site.

### Attach media to blocks

After media is in the library, open the relevant pages in the visual editor and swap in the uploaded assets through each block's image or video picker. Alternatively, if you are constructing or updating block JSON directly, include the new `mediaId` values when calling `posts_update`.

---

## Custom Post Types and Taxonomies

### Recreate custom post types

If your current CMS uses custom content types — team members, case studies, FAQs, testimonials — create matching custom post types in the portal before importing content for those types.

Custom post types can be created through **Content Types** in the site settings, or programmatically via `post_types_create`. Define custom field schemas for each type using `post_types_fields_create`; those fields will appear in the post edit form and are accessible through the `post_types_fields_*` MCP tools.

### Import taxonomies (categories and tags)

Create categories with `taxonomies_create_category` and tags with `taxonomies_create_tag`. After your posts are created, apply taxonomies to them via `posts_set_taxonomies`. Setting up taxonomy structure before importing posts avoids a second pass.

---

## After Migration — Verification and Cleanup

### Content verification checklist

- Visit 5–10% of imported pages on the live site and confirm rendering looks correct.
- Check that internal links within content (blog posts linking to other posts, CTAs pointing to landing pages) use the new URL slugs.
- Confirm media assets are loading from the new media library rather than still pointing to the old host.

### CRM verification checklist

- Confirm contact count matches the source count via `crm_contacts_search` with no filter.
- Verify custom field values are attached on a sample of records.
- Confirm deals are in the correct pipeline stage — open the deals kanban and scan each column.
- Run a round-trip sanity check: create a test deal in the portal, verify it appears, then delete it.

### Turn off the old system carefully

Do not disable the old system until verification is complete and at least one full business cycle — typically a week or two — has passed on the new platform. Keep it available in read-only mode for reference during the transition. Cutover is irreversible; the transition window is not.

### Clean up orphaned data

After the transition window closes, delete test records created during verification and remove any placeholder branding or navigation items that remain from the onboarding wizard.

---

## Conclusion

The clearest mental model for this migration:

- **CRM:** MCP tools (`crm_contacts_create`, `crm_companies_create`, `crm_deals_create`) are the most efficient path for bulk import. Sequence companies → contacts → deals. The REST v1 API is read-only; it does not support write operations.
- **Content:** match your approach to your source. HTML upload for content-heavy pages; visual editor rebuild for design-driven pages; block JSON construction when migrating from a structured source.
- **Verify before decommissioning.** Keep the old system in read-only mode during the transition window. Move to cutover only after the verification checklists pass and a real business cycle has run on the new platform.

---

## Internal Links

- [CRM feature overview](/solutions/crm)
- [Website Builder and CMS](/solutions/websites)
- [AI Agent Platform — MCP tool reference](/solutions/ai-connect)
- [Full MCP tool reference](/docs/agents/tool-reference)
- [Block Editor Guide](/docs/guides/BLOCK_EDITOR_GUIDE.md)
- [Launch a client website end-to-end](/blog/launch-client-website-end-to-end)

---

**Ready to start your migration?** [Open the portal onboarding wizard](/onboarding) to create your first tenant and run through the pre-migration checklist with the setup wizard guiding each step.

Not sure which MCP tools to reach for? [Read the full tool reference](/docs/agents/tool-reference) for the complete parameter schemas for `crm_contacts_create`, `crm_deals_create`, `posts_upload_html`, and the rest of the 450-tool surface.
