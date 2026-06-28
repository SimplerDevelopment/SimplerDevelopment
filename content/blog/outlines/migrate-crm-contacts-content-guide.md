---
type: blog-outline
phase: 10
post-type: migration-guide
slug: migrate-crm-contacts-content-guide
status: outline
date: 2026-06-27
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domains 2, 4)
  - marketing/feature-pages/crm.md
  - marketing/feature-pages/websites-cms-visual-editor.md
  - docs/agents/ai-overview.md
  - marketing/seo/seo-plan.md
authoring-constraints: >
  No fabricated competitor names. Describe what can be brought IN to the platform;
  do not describe other platforms' export formats by name.
  Honest about what is not yet available: no bulk CRM import UI wizard
  (use MCP tools or the portal form); checkout E2E test coverage is
  incomplete for storefront — do not feature storefront migration here.
  Print designer fate is open — do not include it in migration scope.
---

# Outline: Migration Guide — Bring Your CRM Contacts and Content In

## SEO Metadata

| Field | Value |
|---|---|
| **Title (≤60 chars)** | Migrate CRM Contacts and Content: A Step-by-Step Guide |
| **Meta description (≤155 chars)** | How to bring your CRM contacts, companies, deals, and website content into the portal — using the UI, MCP tools, or REST API. Includes a pre-migration checklist. |
| **URL slug** | `/blog/migrate-crm-contacts-content-guide` |
| **Canonical** | `https://example.com/blog/migrate-crm-contacts-content-guide` |
| **Target audience** | Agency admins and operations leads migrating from existing CRM and CMS tools to the client portal |
| **Primary keyword** | migrate CRM contacts to agency platform |
| **Secondary keywords** | CRM data migration guide, import CRM contacts, migrate website content to block CMS, agency platform migration, import website content blocks |

---

## H2 / H3 Outline

### Intro (no heading)

- The migration moment: an agency has decided to consolidate onto the platform; the question is how to move existing CRM contacts, companies, deals, and website content without losing data or disrupting active work
- What this guide covers: CRM (contacts, companies, deals), website content (posts and pages → blocks, media), taxonomies, and custom fields
- What this guide does not cover: email subscriber migration (covered in the email campaigns documentation), storefront product catalog migration (separate guide), bookings and appointment history
- Key principle: the platform does not impose a proprietary lock-in format — CRM records are addressable via MCP tools and the portal UI; content is stored as JSON block trees importable via the REST API or MCP

---

### H2: Before You Migrate — Preparation Checklist

- **H3: Audit what you have**
  - Export or list your current CRM records: contacts (fields in use), companies, deals (stages, custom fields, attachments), active proposals
  - Inventory your website content: pages, blog posts, landing pages — note which are live and which are drafts
  - Identify which contacts have active email subscriptions (handle those separately via email list import, not CRM migration)
- **H3: Map your data to the platform schema**
  - Contacts: `email`, `firstName`, `lastName`, `phone`, `company`, `notes` — and any custom fields you want to create
  - Companies: `name`, `domain`, `industry`, `notes`
  - Deals: `title`, `value`, `stage` (must map to a pipeline stage), `contact`, `company`
  - Content: identify which pages will map to standard post types and which need custom post types (e.g., team members, case studies)
- **H3: Set up the destination tenant first**
  - Create the tenant in the admin panel
  - Run the onboarding wizard to configure branding, navigation, and CRM pipeline stages before importing data — importing into a configured tenant is cleaner than reconfiguring after the fact
  - Create your CRM pipelines and stages in CRM Settings before importing deals

---

### H2: Importing CRM Contacts and Companies

Three paths are available depending on volume and preference.

- **H3: Path A — Portal UI (small volumes)**
  - Create contacts one at a time from Contacts → New Contact
  - Attach custom field values from the contact detail page after creation
  - Best for: fewer than ~50 contacts, or for hand-reviewed high-value contacts
- **H3: Path B — MCP tools (bulk, programmable)**
  - Use `crm_contacts_create` to create contacts programmatically; call it from a script that reads your export CSV or JSON
  - For companies: `crm_companies_create`
  - For custom field values: call `crm_custom_fields_create` first to define the field schema, then `crm_custom_field_values_set` per record
  - MCP auth: use a portal API key with the `crm:write` scope
  - Recommended pattern: create companies first, then contacts with the company association set; then deals
  - Rate: each tool call creates one record; use batched sequential calls from your import script; the MCP endpoint is at `POST /api/mcp`
- **H3: Path C — REST v1 API (read-only heads-up)**
  - The REST v1 API (`/api/v1/`) is currently read-only and does not support CRM record creation; use Path B (MCP) for writes
- **H3: Verifying the import**
  - After bulk import, spot-check 5–10% of contacts in the portal Contacts list
  - Confirm custom field values are attached by opening a contact detail page
  - Export a list via `crm_contacts_search` with no filter to get the full count and verify it matches your source

**Screenshot requirement:** Contacts list with multiple records; contact detail with custom fields visible

---

### H2: Importing Deals and Proposals

- **H3: Import deals via MCP**
  - Use `crm_deals_create` with the `pipelineId` and `stageId` you configured in the pre-migration step
  - Map the deal's associated contact and company by the IDs returned from the contact/company import
  - Set `value`, `title`, and `dueDate` from your source data
- **H3: Reattach proposals and contracts**
  - Historical proposals (PDFs or documents) can be linked to deals as artifact links via `crm_deal_artifact_link`
  - New proposals are created in the portal proposal builder; historical signed contracts should be attached as file artifacts rather than re-created in the e-sign flow
- **H3: Activity log entries**
  - Significant past interactions (calls, meetings, key emails) can be logged as activity entries via `crm_activities_create`
  - Importing the full history of every email thread is not recommended; focus on milestone events

---

### H2: Migrating Website Content

Website content migration is more involved than CRM migration because the block format is structured.

- **H3: Option 1 — Recreate pages using the visual editor**
  - Best for small sites (under 20 pages) or pages with complex visual design
  - Open the visual editor, pick block types that match your current layout, and rebuild the page
  - The 47 built-in block types cover most common page patterns: hero, text, image, gallery, CTA, embed, form
- **H3: Option 2 — Import HTML via posts_upload_html**
  - The `posts_upload_html` MCP tool accepts raw HTML and converts it to a block tree
  - Best for: content-heavy pages (blog posts, documentation) where the visual layout is simple
  - Caveat: the HTML-to-block converter works best with clean, semantic HTML; heavily styled or JavaScript-dependent pages will need manual cleanup after import
- **H3: Option 3 — Construct block JSON directly**
  - Advanced: construct the block tree JSON directly (see `blocks://schema` MCP resource for the full input schema per block type) and call `posts_create` or `posts_update` with the content
  - Best for: programmatic migration from a structured source (e.g., a headless CMS with a documented export format)
- **H3: Which approach to choose**
  - Content-heavy blog or documentation → HTML upload
  - Marketing pages with specific visual designs → visual editor rebuild
  - Structured content from another CMS → block JSON construction

**Screenshot requirement:** `posts_upload_html` flow or block JSON import result in the visual editor

---

### H2: Migrating Media

- **H3: Upload media via the portal**
  - The portal media library (global or per-site) accepts image, video, and document uploads
  - Drag-and-drop bulk upload is available in the media library UI
- **H3: Register media from external URLs**
  - `media_upload_from_url` registers a media item by URL without needing to download and re-upload the file locally
  - Useful when migrating from a CDN that remains accessible during the migration window
- **H3: Attach media to blocks**
  - After media is in the library, open the relevant pages in the visual editor and swap in the uploaded media via the block's image/video picker
  - Alternatively, update block JSON directly via `posts_update` with the new `mediaId` values

---

### H2: Custom Post Types and Taxonomies

- **H3: Recreate custom post types**
  - If your current CMS has custom content types (team members, case studies, FAQs), create matching custom post types in the portal via Content Types settings or the `post_types_create` MCP tool
  - Define custom field schemas for each type; the fields are added to the post edit form and available via the `post_types_fields_*` MCP tools
- **H3: Import taxonomies (categories and tags)**
  - Create categories and tags per site via `taxonomies_create_category` and `taxonomies_create_tag`
  - Apply them to posts via `posts_set_taxonomies` after the posts are created

---

### H2: After Migration — Verification and Cleanup

- **H3: Content verification checklist**
  - Visit 5–10% of imported pages on the live site; confirm rendering is correct
  - Check that internal links within content (e.g., blog posts linking to other posts) use the new URL slugs
  - Confirm media assets are loading from the new media library (not still pointing to the old host)
- **H3: CRM verification checklist**
  - Confirm contact count matches source
  - Verify custom field values are attached to a sample of records
  - Confirm deals are in the correct pipeline stage
  - Test a round-trip: create a test deal via the portal, verify it appears, then delete it
- **H3: Turn off the old system**
  - Do not disable the old system until you have completed verification and at least one full business cycle (a week or two of actual use) on the new platform
  - Keep the old system available in read-only mode for reference during the transition window
- **H3: Clean up orphaned data**
  - Delete test records created during migration verification
  - Remove placeholder branding or navigation items from the onboarding wizard that are no longer needed

---

### Conclusion

- CRM: MCP tools (`crm_contacts_create`, `crm_companies_create`, `crm_deals_create`) are the most efficient path for bulk migration
- Content: choose the approach that matches your source — HTML upload for content-heavy pages, visual editor rebuild for visual-heavy designs, block JSON construction for structured source data
- Verify before decommissioning; keep the old system in read-only mode during the transition

---

## Internal Links

- [CRM feature page](/solutions/crm)
- [Website Builder & CMS feature page](/solutions/websites)
- [AI Agent Platform — MCP tool reference](/solutions/ai-connect)
- [Tool reference: crm_* tools](/docs/agents/tool-reference)
- [Block Editor Guide](/docs/guides/BLOCK_EDITOR_GUIDE.md)
- [Launch a client website end-to-end (tutorial blog)](/blog/launch-client-website-end-to-end)

---

## CTA

**Primary:** "Start your migration" → `[portal URL]/onboarding`

**Secondary:** "Read the full MCP tool reference" → `/docs/agents/tool-reference`

---

## Screenshot / GIF Requirements Summary

| Asset | Description | Notes |
|---|---|---|
| Screenshot | CRM contacts list with multiple records and custom field columns visible | Generic names/emails |
| Screenshot | Contact detail with custom field values populated | |
| Screenshot | Deals kanban with multiple stages and cards | Use placeholder deal names |
| Screenshot | Media library — multiple images uploaded | |
| Screenshot | Post created from HTML upload — rendered in visual editor with blocks | |
| Diagram | Migration flow: source data → CRM (via MCP) + Content (via HTML upload or block JSON) → verify → cutover | Abstract; no competitor names |
