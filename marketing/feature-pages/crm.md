---
phase: 8
feature: CRM
slug: /features/crm
status: spec-draft
date: 2026-06-27
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domain 4)
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
---

# CRM — Marketing Spec

## Hero

**Headline:** Every client gets a full CRM — contacts, pipelines, proposals, and e-signed contracts in one place.

**Subhead:** Per-tenant CRM with configurable deal pipelines, a proposal builder, DropboxSign e-signature, lead scoring, and 35+ AI tools — provisioned automatically when a client is onboarded.

---

## Problem

Agencies either push clients into a generic CRM that doesn't fit their sales process, or maintain a separate contacts tool, a separate proposal builder, and a separate contract signing service. Switching between three tools for a single deal slows down every close.

When clients do use a generic CRM, their pipeline stages, custom field needs, and lead scoring rules don't match what's built in — leading to workarounds that erode adoption.

---

## Solution

SimplerDevelopment provisions a complete, per-tenant CRM the moment a client is onboarded. Each tenant gets their own isolated contacts, companies, deal pipeline, proposal builder, and DropboxSign-backed e-signature — all in the portal.

Pipeline stages are configurable. Custom fields can be defined on contacts and companies. Lead scoring rules apply automatically. Saved views let each team member work the way they prefer. And the entire CRM surface is accessible to AI agents via 35+ MCP tools — so automations and integrations don't require a separate API integration.

---

## Key Benefits

- **Kanban deal pipeline** with configurable stages, deal comments, artifact links, and move history — create and update deals via the portal or the `crm_deals_*` MCP tools.
- **Proposal builder with e-signature** — generate proposals, send them for client review, and collect signatures on contracts via DropboxSign (embedded signing flow or per-signer email links).
- **Custom fields and lead scoring** — define per-tenant fields on contacts and companies; configure scoring rules in CRM settings to rank leads automatically.
- **Activity log** — track calls, emails, and meetings per contact and company so every interaction is on record.
- **Browser extension** — create contacts, log activity, and file notes from any web page without opening the portal.

---

## How It Works

1. **Add contacts and companies:** Create records through the portal, the browser extension, or the `crm_contacts_create` / `crm_companies_create` MCP tools. Attach custom field values immediately.
2. **Work the pipeline:** Open a deal in the kanban board. Add comments, link related documents or proposals as artifacts, and move the card through stages as the deal progresses.
3. **Close with a proposal and e-signature:** Build a proposal in the portal, send it for review, and once accepted, collect an e-signature on the contract — embedded in the portal or via a per-signer email link through DropboxSign.
4. **Score and filter:** Lead scoring rules rank contacts automatically. Saved views let team members filter to the slice of the CRM most relevant to their work.

---

## FAQs

**Q: Can I define my own pipeline stages?**
Yes. Pipelines are configurable with named stages. Multiple pipelines can be created for different sales motions. Stages are managed in CRM settings or via the `crm_pipelines_*` MCP tools.

**Q: How does e-signature work?**
Contracts use DropboxSign. You can embed the signing experience inside the portal (iframe) or send a per-signer email link. Once all signers complete, the contract status updates automatically.

**Q: Can I add fields that aren't in the default schema?**
Yes. Custom fields are defined per tenant for contacts and companies. Field types and labels are configurable. Values are stored in the CRM and retrievable via the `crm_custom_field_values_*` MCP tools.

**Q: Does the CRM score leads automatically?**
Yes. Scoring rules are defined in CRM settings. Rules evaluate contact activity and field values and assign a numeric score that surfaces in the contacts list.

**Q: Can an AI agent drive the CRM?**
Yes. 35+ MCP tools cover contacts, companies, deals, proposals, contracts, pipelines, activities, custom fields, saved views, and scoring rules. Tokens with the `crm:read` or `crm:write` scope restrict access appropriately.

---

## SEO Block

| Field | Value |
|---|---|
| **Page title** | Per-Tenant CRM for Agencies \| SimplerDevelopment |
| **Meta description** | Full CRM per client — contacts, configurable deal pipelines, proposals, DropboxSign e-signature, lead scoring, and 35+ AI tools. No separate CRM platform needed. |
| **URL slug** | /features/crm |
| **Primary keyword** | white-label CRM for agencies |
| **Secondary keywords** | per-tenant CRM, agency client CRM software, configurable deal pipeline, e-signature proposals, lead scoring CRM |

---

## Structured Data

Apply both types to this page:

**SoftwareApplication**
- `name`: "SimplerDevelopment – CRM"
- `applicationCategory`: "BusinessApplication"
- `featureList`: ["Kanban deal pipeline with configurable stages", "Proposal builder with DropboxSign e-signature", "Custom fields on contacts and companies", "Lead scoring rules", "Activity log", "Browser extension CRM surface", "35+ MCP tools for AI agents"]
- `operatingSystem`: "Web"

**FAQPage**
- Wrap each FAQ Q&A pair in `mainEntity` → `Question` / `acceptedAnswer` → `Answer`.

---

## Internal Links

- [AI overview — MCP tool surface](../../docs/agents/ai-overview.md)
- [Glossary: Custom Post Type](../../docs/agents/glossary.md#custom-post-type) (cross-ref for custom fields concept)
- [Glossary: MCP Tool](../../docs/agents/glossary.md#mcp-tool)
- Sibling feature pages: [Sites, CMS & Visual Editor](./websites-cms-visual-editor.md) · [Company Brain](./company-brain.md) · [Storefront & Commerce](./storefront-commerce.md)

---

## Media Requirements

Capture these assets in Phase 5/6:

| Asset | Screen / Workflow | Notes |
|---|---|---|
| Screenshot | CRM dashboard — summary cards (contacts, open deals, proposals) | Show real-looking data; no real client info |
| Screenshot | Contacts list with at least two custom field columns visible | Illustrate per-tenant custom fields |
| Screenshot | Deals kanban board with multiple stages and card detail drawer open | Show deal comments or artifact links inside the drawer |
| Screenshot | Proposal builder — proposal detail view showing line items and status | |
| Screenshot | Contract detail with DropboxSign embedded signing frame | Capture the embedded iframe state |
| Screenshot | CRM settings — scoring rules list | |
| GIF | Moving a deal card from one pipeline stage to another | ~4 seconds; smooth drag-and-drop |

---

## CTA

**Primary:** "Set up your client CRM" → `[portal URL]/crm`

**Secondary:** "See all CRM tools" → `[docs URL]/agents/tool-reference.md` (filter to `crm_*`)
