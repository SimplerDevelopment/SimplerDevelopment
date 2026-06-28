---
title: "White-Label Multi-Tenant Platform for Agencies"
slug: "white-label-multi-tenant-agency-platform"
description: "Run the full client portal under your own brand: custom domain, your logo, agency colors, and per-tenant isolation — each client gets their own portal on Scale tier."
date: 2026-06-27
tags:
  - agency
  - white-label
  - multi-tenant
  - client-portal
  - security
  - mcp
author: "SimplerDevelopment Team"
draft: true
---

If your agency delivers digital services to clients — websites, CRM, content, email campaigns, project management — those clients will eventually notice the name in the browser tab. They will notice whose logo appears on the login screen. Some will ask whether their data sits alongside another client's data, and whether an AI agent you give them can accidentally reach into another account.

These are not unreasonable questions. This post covers how the platform is structured to answer them: how multi-tenancy works, what white-label access unlocks at Scale tier, how to provision a new client, what the security model looks like, and — importantly — what is not yet built and should not be treated as available.

---

## Multi-Tenant Architecture — What Each Client Gets

### Per-tenant isolation

Every client you provision in the admin panel is a separate tenant. Each tenant has its own isolated data store for contacts, CRM records, website content, Brain knowledge base, email subscriber lists, project boards, and every other module. There is no shared namespace. A query made in the context of Client A's portal cannot reach Client B's records by design — every table is keyed to a `clientId`, and every query the application executes requires an explicit match on that identifier derived from the authenticated session.

The agency runs a single deployment. Clients do not each get their own server or database cluster. Isolation is enforced in application code at the query layer, which means the separation is visible in code review and testable at the integration layer rather than hidden in database policy. A dedicated tenancy regression suite runs against every data-access change.

### Per-tenant capability modules

Not every client needs every module. When you provision a client, you select which modules are included in their subscription: websites, CRM, Company Brain, email campaigns, bookings, projects, tickets, storefront, and so on. A client that needs CRM and email does not see project management in their sidebar and does not pay for it.

Module access is enforced at both the UI layer (the sidebar entry does not appear) and the API layer (routes return 403 for modules the client has not subscribed to).

### What a client sees in their portal

A fully provisioned client portal includes:

- **Websites** — up to their site count, each with a visual block editor, navigation manager, custom code, and per-site content calendar
- **CRM** — contacts, companies, deals pipeline, proposals, e-signed contracts, activities, lead scoring, and custom fields
- **Company Brain** — notes, decisions, documents, playbooks, goals, initiatives, glossary, org chart, and semantic search over all of it
- **Email campaigns** — campaigns, subscriber lists, segments, and reusable templates
- **Bookings and scheduling** — booking pages and appointment management
- **Projects, kanban, and tickets** — sprint planning, task tracking, time logging, and a support ticket queue
- **Storefront** — product catalogue, variants, checkout, and order management (if subscribed)
- A unified media library, content calendar, and settings panel across all modules

### The agency admin view

The global admin panel at `/admin/` is entirely separate from any tenant portal. From there you can provision new client records, manage their plan and module access, review AI-agent approval queues, monitor platform health, and override per-tenant settings. Agency admins are not portal users — they operate in a distinct authentication context with access to all tenants.

---

## White-Label — What Scale Tier Unlocks

White-label capabilities are available at Scale tier only. The features below require a Scale-tier plan; they are not available on lower tiers regardless of the number of clients provisioned.

### Custom portal domain

At Scale tier, the entire portal — login page, all portal routes, invite acceptance flows — runs under a domain you control. Instead of `app.yoursaasplatform.com`, your clients access `portal.youragency.com` or any subdomain you configure.

Domain verification uses a DNS TXT record. You add the provided TXT record to your DNS zone, the platform confirms it, and the custom domain is activated for all portal traffic. The configuration is managed from the agency settings panel under the custom domain section.

### Agency branding overrides

Once a custom domain is active, the portal chrome — header, sidebar, login screen, invite acceptance page — picks up your branding profile. Your logo, primary colors, and typography replace the platform defaults. When a client logs in, they see your product, not a third-party tool with your logo bolted on as an afterthought.

Branding profiles are managed from the branding settings in the portal. Each profile contains color tokens, logo assets, and typography settings. The brand style guide view shows how those tokens render across UI components before you apply them.

### White-label login page

The login and invite flows are served at your custom domain with your branding applied. When you invite a new client team member, the invitation email links to a page that looks like your agency's product. First impressions are not accidentally someone else's.

### What white-label does not include

Two capabilities that sound adjacent to white-label are not built and should not be assumed:

**Sub-account resale.** There is currently no self-serve UI for a client to provision their own sub-tenants or resell portal access downstream. The data model can support sub-tenants, but the interface for client-side provisioning has not been built. If sub-account resale is a hard requirement, plan for it to be unavailable at launch.

**Separate deployments per agency.** The architecture is multi-tenant on a single deployment, not multi-deployment. All agencies and their clients share the same application instance with data isolated per tenant. There is no "your own private cloud" deployment option in the current product.

---

## Onboarding a New Client — The Provisioning Flow

### Create the client record

From the admin panel, create a new client record: name, plan tier, and enabled modules. The record is assigned a unique `clientId`. Every piece of data created in that client's portal — contacts, website content, Brain notes — is keyed to that identifier from the moment it is written.

### Invite the client's team

From the client record or from the tenant portal's team settings, send invitation emails to the client's staff. Each invite generates a time-limited token. When the invitee clicks the link, they land on the white-label login page (at your custom domain if configured), set their password, and access the portal.

### Run the onboarding wizard

New clients are guided through an 8-step onboarding wizard:

1. Profile setup
2. Branding profile configuration
3. Website creation
4. Navigation setup
5. CRM configuration
6. Email domain setup
7. Billing
8. Integration connections (Google Workspace, etc.)

Clients who want a guided start follow the wizard linearly. Power users can skip steps or jump ahead. The wizard is optional — all configuration is also accessible directly from portal settings.

### Bulk provisioning via MCP tools

For agencies onboarding multiple clients at once, the branding and profile configuration steps can be automated without touching the portal UI. The `branding_create_profile`, `branding_update_profile`, and `branding_update_messaging` MCP tools accept the full branding configuration as structured parameters, allowing a cohort of clients to be provisioned in a single scripted pass.

---

## Security and Access Controls

### Role-based access within a tenant

Each tenant has two portal roles:

- **Admin** — full access to all modules the tenant is subscribed to, including team management, billing, and settings
- **Editor** — content and task access; cannot manage team membership, billing, or API keys

The agency admin can add, remove, and promote team members from the portal settings or from the admin panel.

### MFA with TOTP

Multi-factor authentication using TOTP (time-based one-time passwords) is active for all portal users as of June 2026. Enrollment is in Settings → Security. Users scan a QR code with any TOTP app, verify a code, and MFA is active on their account. Disabling MFA requires password re-verification, so a compromised login session alone is not sufficient to remove the factor.

### Per-tenant API keys and MCP scopes

Each tenant can generate portal API keys, and each key is scoped to specific capability domains:

- `brain:read` / `brain:write` — Company Brain
- `crm:read` / `crm:write` — CRM records
- `email:send` — email campaign execution
- `sites:write` — website content
- (and additional scopes for other modules)

An AI agent operating with a key issued by Client A's portal cannot read or write Client B's data. The scope guard is enforced at the tool handler layer — inside the function that executes the query — not only at the HTTP route layer. A misconfigured API gateway cannot bypass it.

### Approval queue for AI-authored changes

Any AI agent action that would modify live, visible content — publishing a page, sending a campaign, deleting a CRM record — does not execute immediately. Instead, the tool returns an `approvalUrl`. A human reviewer at the agency or the client side follows that link, reviews the pending change in a WYSIWYG preview, and explicitly approves or rejects it before anything happens.

This applies to all MCP tools that write to production-visible state. It is not opt-in; it is the default behavior for the affected tool categories.

---

## AI Agents Across All Tenants

The platform exposes approximately 450 MCP tools covering every product domain. Every tool is available to all tenants; access is determined by the API key or OAuth token used to authenticate the request, which is always scoped to a single tenant.

In practice, this means you can build a single AI agent workflow — a monthly performance report generator, a content refresh bot, a CRM enrichment pipeline — and run it for multiple clients by issuing one key per client. The agent's code does not change; the key determines whose data it touches.

An AI agent operating for Client A will receive errors, not Client B's data, if it attempts to access a resource outside its scope.

---

## What Is Not Yet Built

Honest scope matters for planning. Three capabilities are commonly assumed in discussions about agency platforms and are not currently available:

**Sub-account resale.** As noted above, the architecture supports the data model for sub-tenants, but there is no self-serve UI for clients to provision downstream accounts. This is a planned capability.

**Client-side billing for module upgrades.** Each client's billing is managed by the agency admin on behalf of the client. Clients cannot independently purchase additional modules or upgrade their plan from within their own portal. The billing flow is agency-controlled.

**Org-level Google Workspace connection.** User-level Google connections — Gmail, Calendar, Drive — are available and work per user. An org-level Google Workspace connection that applies across all users in a tenant simultaneously (allowing one OAuth authorization to cover the full team) is not yet built.

---

## What This Means in Practice

Multi-tenant architecture and white-label branding solve different parts of the same agency problem. Tenancy ensures that every client's data is a walled garden — isolated by construction, scoped at every query, and tested by a dedicated regression suite. White-label branding ensures that the wall displays your logo, not the platform's.

At Scale tier, those two capabilities combine: clients log in to `portal.youragency.com`, see your colors and logo throughout their session, and work inside a portal that never surfaces the underlying platform's identity. The 8-step onboarding wizard gets new clients productive in one session. The MCP tool surface lets you build AI agent workflows that operate across your entire client roster with per-tenant scope enforcement.

The capabilities that are not built — sub-account resale, client-side billing, org-level Google Workspace — are worth knowing before you build a client pitch around them. The roadmap exists; the product does not yet.

---

## Internal Links

- [Agency and white-label solutions](/solutions/agency) — plan comparison and Scale-tier details
- [AI agent platform — scoped MCP tools per tenant](/solutions/ai-connect) — full tool surface and scope documentation
- [Billing and per-module pricing](/pricing) — à-la-carte module subscriptions
- [Automations and workflows](/solutions/automations) — automate client onboarding steps and recurring tasks
- [Company Brain — per-tenant AI knowledge base](/solutions/company-brain) — notes, documents, semantic search, and playbooks

---

**Explore the agency plan** → [/solutions/agency](/solutions/agency)

**Book a walkthrough** → [/contact](/contact)
