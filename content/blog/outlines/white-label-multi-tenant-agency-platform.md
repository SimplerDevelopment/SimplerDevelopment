---
type: blog-outline
phase: 10
post-type: enterprise-agency
slug: white-label-multi-tenant-agency-platform
status: outline
date: 2026-06-27
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domain 15, 16, 17)
  - marketing/feature-pages/ai-agent-platform.md
  - docs/agents/ai-overview.md
  - marketing/seo/seo-plan.md
authoring-constraints: >
  White-label (custom domain, branding overrides) is Scale-tier only.
  Sub-account resale UI is NOT built — do not feature or imply it.
  Do not fabricate metrics or customer names.
  Do not describe tenant count, ARR, or agency size claims.
  MFA shipped 2026-06-26 — can be mentioned as active security feature.
---

# Outline: White-Label + Multi-Tenant for Agencies

## SEO Metadata

| Field | Value |
|---|---|
| **Title (≤60 chars)** | White-Label Multi-Tenant Platform for Agencies |
| **Meta description (≤155 chars)** | Run the full client portal under your own brand: custom domain, your logo, agency colors, and per-tenant isolation — each client gets their own portal on Scale tier. |
| **URL slug** | `/blog/white-label-multi-tenant-agency-platform` |
| **Canonical** | `https://example.com/blog/white-label-multi-tenant-agency-platform` |
| **Target audience** | Agency principals and operations leaders evaluating white-label and multi-tenant solutions for client delivery |
| **Primary keyword** | white-label agency platform |
| **Secondary keywords** | multi-tenant client portal, agency white-label software, custom domain portal, agency branding software, Scale tier agency portal |

---

## H2 / H3 Outline

### Intro (no heading)

- The premise: agencies that deliver digital services to clients want those clients to interact with the agency's brand — not a third-party SaaS product's logo and domain
- What multi-tenant means: each client gets their own isolated portal — their own CRM, website, projects, email, Brain — not a shared space
- What white-label adds: the portal appears under the agency's own domain and branding rather than the platform's
- What this post covers: the architecture, what is available at Scale tier, the provisioning workflow, and what is not yet built (sub-account resale)

---

### H2: Multi-Tenant Architecture — What Each Client Gets

- **H3: Per-tenant isolation**
  - Every client is a separate tenant (called a "client" in the admin panel)
  - Each tenant's data — contacts, website content, CRM records, Brain notes, email subscribers, project cards — is keyed to their `clientId` and never visible to other tenants
  - The agency admin provisions new tenants from the admin panel; clients then manage their own portal
- **H3: Per-tenant capability modules**
  - Each client portal can be provisioned with only the modules they need via per-module à-la-carte subscriptions
  - A client that needs CRM + website + email does not pay for project management or bookings
- **H3: What a client sees in their portal**
  - Websites (up to their provisioned site count)
  - CRM (contacts, companies, deals, proposals, contracts)
  - Company Brain (notes, decisions, documents, playbooks, semantic search)
  - Email campaigns (campaigns, subscriber lists, templates)
  - Bookings and scheduling
  - Projects, kanban, and tickets
  - Storefront (if subscribed)
  - A unified inbox, content calendar, media library, and settings
- **H3: The agency admin view**
  - The global admin panel (`/admin/`) is separate from any tenant portal
  - From there, the agency can provision clients, manage billing, review MCP approval queues, monitor platform health, and override settings per tenant

---

### H2: White-Label — What Scale Tier Unlocks

This section is explicitly scoped to Scale-tier capabilities only.

- **H3: Custom portal domain**
  - At Scale tier, the entire portal runs under the agency's own domain (e.g., `portal.youragency.com`) instead of the platform's default domain
  - Domain verification uses DNS TXT record confirmation; the setup is managed in the agency settings panel
- **H3: Agency branding overrides**
  - The portal chrome (header, sidebar, login page) picks up the agency's logo, colors, and typography from the branding profile
  - Clients see the agency's brand when they log in and throughout their portal session — no third-party product branding is visible
- **H3: White-label login page**
  - The login and invite flows are served at the custom domain with the agency's branding
  - When a client accepts an invitation, they land on a page that looks like the agency's product
- **H3: What white-label does not include**
  - Sub-account resale: there is currently no UI for a client to themselves provision sub-tenants or resell portal access. This is a planned capability that has not been built. Do not position the platform as a white-label reseller tool until this ships.
  - Separate platform deployments per agency: the architecture is multi-tenant, not multi-deployment; all agencies share the same deployed instance, with data isolated per tenant

---

### H2: Onboarding a New Client — The Provisioning Flow

Step-by-step for agency admins:

- **H3: Create the client record**
  - In the admin panel, create a new client: set name, plan, and enabled modules
  - The client record is assigned a `clientId`; all subsequent data for that client is keyed to it
- **H3: Invite the client's team**
  - From the client record or from the tenant portal's team settings, send invite emails
  - Each invitee gets a link to set their password and access the portal under the agency's custom domain
- **H3: Run the onboarding wizard**
  - The 8-step onboarding wizard guides new clients through: profile setup, branding profile, website creation, navigation, CRM configuration, email domain setup, billing, and integration connections
  - Clients who need a guided start get the wizard; power users can skip ahead
- **H3: Configure branding profiles programmatically (bulk onboarding)**
  - The `branding_create_profile` and `branding_update_messaging` MCP tools allow provisioning branding configurations for multiple clients without touching the portal UI
  - Useful for agencies onboarding a cohort of clients at once

---

### H2: Security and Access Controls

- **H3: Role-based access within a tenant**
  - Two portal roles: `admin` (full access to all modules in the tenant) and `editor` (content and task access; no billing or team management)
  - Agency admins can add and remove team members and adjust roles from the portal settings
- **H3: MFA (TOTP)**
  - Multi-factor authentication with TOTP (time-based one-time passwords) is available for all portal users as of June 2026
  - Enrollment and management are in Settings → Security; MFA disable requires password re-verification
- **H3: Per-tenant API keys and MCP scopes**
  - Each tenant can generate portal API keys scoped to specific domains (`brain:read`, `crm:write`, `email:send`, etc.)
  - AI agents operating on behalf of a tenant are restricted to that tenant's data by construction — scope guards are enforced at the tool layer, not just at the route layer
- **H3: Approval queue for AI-authored changes**
  - Any AI agent action that would modify live content (publishing a page, sending a campaign, deleting a record) returns an `approvalUrl` instead of executing immediately
  - A human reviewer at the agency or client side clicks the link, reviews the change in a WYSIWYG preview, and approves or rejects it

---

### H2: AI Agents Across All Tenants

- The MCP surface (450 tools) is available to every tenant; each API key or OAuth token is scoped to the issuing tenant
- An AI agent operating for Client A cannot access Client B's data — tenancy is enforced at every tool handler
- Practical use: an agency can build a single AI agent workflow (e.g., monthly report generator, content refresh bot) and run it per tenant by issuing one key per client

---

### H2: What Is Not Yet Built (Honest Scope)

Being explicit about current boundaries prevents onboarding friction:

- **Sub-account resale**: the architecture supports the data model for sub-tenants, but there is no self-serve UI for a client to provision their own sub-accounts or resell portal access. This is planned, not shipped.
- **Per-tenant Stripe payment for clients**: each tenant's billing is managed by the agency admin on behalf of the client. Clients cannot independently purchase module upgrades from within their portal.
- **Org-level Google Workspace connection**: user-level Google connections (Gmail, Calendar, Drive) work; an org-level connection that applies across all users in a tenant is not yet populated.

---

### Conclusion

- Multi-tenant isolation means every client is a walled garden; white-label branding means the wall displays the agency's logo
- Scale tier delivers custom domain + branding overrides for the portal chrome; the 8-step wizard gets clients productive quickly
- Sub-account resale and self-serve billing for clients are on the roadmap, not yet shipped — plan accordingly if those are requirements

---

## Internal Links

- [Agency & White-Label feature page](/solutions/agency)
- [AI Agent Platform — scoped MCP tools per tenant](/solutions/ai-connect)
- [Billing & Pricing — per-module subscriptions](/pricing)
- [Automations & Workflows — automate client onboarding steps](/solutions/automations)
- [Company Brain — per-tenant AI knowledge base](/solutions/company-brain)

---

## CTA

**Primary:** "Explore the agency plan" → `/solutions/agency`

**Secondary:** "Book a walkthrough" → `/contact`

---

## Screenshot / GIF Requirements Summary

| Asset | Description | Notes |
|---|---|---|
| Screenshot | Agency settings panel — custom domain field with DNS TXT verification step visible | Use example.com placeholder domain |
| Screenshot | White-label portal login page — agency logo + colors, no third-party branding | Generic placeholder brand |
| Screenshot | Admin client list — multiple client records provisioned | Generic names; no real clients |
| Screenshot | Approval queue — pending AI-authored change with WYSIWYG preview and Approve/Reject buttons | |
| Screenshot | Security settings — MFA enrollment screen (TOTP QR code view) | |
| Diagram | Per-tenant isolation: Agency Admin → [Client A portal] [Client B portal] [Client C portal] — each walled with their own data | Abstract architecture diagram |
