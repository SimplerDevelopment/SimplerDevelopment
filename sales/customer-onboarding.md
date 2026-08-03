---
type: sales-collateral
document: customer-onboarding
phase: 19
date: 2026-06-27
status: internal-draft
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domain 15 — Agency, Onboarding & Branding)
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
  - marketing/feature-pages/
---

# SimplerDevelopment — Customer Onboarding Journey

This document describes the onboarding experience for a new client tenant: what the 8-step wizard covers, the first-value milestones a client hits along the way, and what ongoing platform access looks like after the wizard is complete.

---

## How Onboarding Starts

A new client tenant is provisioned by the agency admin from the `app/admin/clients/` panel. Once provisioned:

1. The client receives an email invite link with a time-limited token.
2. The client clicks the link, sets a password, and arrives in the portal.
3. The portal immediately surfaces the onboarding wizard — an 8-step guided flow that must be completed before full portal access is unlocked.

The wizard is linear and completable in a single session for most clients. Progress is saved, so clients can pause and return.

---

## The 8-Step Onboarding Wizard

The wizard lives at `app/portal/onboarding/` and guides the client through every foundational decision needed before their portal is production-ready. The eight steps cover:

### Step 1 — Business Profile
The client enters their business name, contact email, and basic profile information. This populates the portal identity and is used as the default author context for content and AI-generated material.

### Step 2 — Branding
The client uploads their logo, selects brand colors, and sets typography. These choices are stored as a branding profile and applied across the client's website, email campaigns, and pitch decks. The platform generates a brand style guide that can be shared with team members.

> **First-value milestone:** After Step 2, the client's site renderer and email previews will render with their own brand — the platform immediately looks like theirs, not a generic template.

### Step 3 — First Website
The client names their first website and assigns it a domain (or a temporary subdomain while DNS propagates). The platform provisions the site and creates an initial homepage using the block editor.

> **First-value milestone:** After Step 3, the client has a live public URL — even if it's just a placeholder page. The domain is configured; the site is rendering.

### Step 4 — Navigation and Pages
The client builds their primary navigation tree — page names and hierarchy. A set of starter pages (Home, About, Contact) is created. The client can edit each page's content in the visual block editor immediately.

### Step 5 — Team Setup
The client invites team members and assigns roles (`admin` or `editor`). Each invited user receives their own email invite. The agency admin retains visibility into all team members across all clients from the admin panel.

> **First-value milestone:** After Step 5, the client is no longer a single user — their team can collaborate on content, manage the CRM, and run projects independently.

### Step 6 — Integrations
The client connects any relevant third-party accounts: Google Workspace (Gmail, Calendar, Contacts, Drive), Stripe (for storefront payment processing if using the commerce module), and Zoom (for booking confirmations). Integrations that are not relevant to the client's active modules can be skipped.

> **First-value milestone:** After Step 6, booking confirmations can include Zoom links, calendar events are synced for availability, and Gmail activity can flow into Company Brain's review queue.

### Step 7 — CRM Baseline
The client configures their CRM — setting up at least one deal pipeline (with stage names matching their sales process) and optionally importing an initial contact list. Custom fields for contacts and companies can be defined here or later.

> **First-value milestone:** After Step 7, the client has a working CRM immediately. The sales team can start logging deals and contacts without waiting for additional setup.

### Step 8 — Review and Launch
The wizard summarizes the client's configuration: site URL, branding, team size, active integrations, and CRM setup. The client confirms readiness and exits the wizard. The portal home dashboard is now fully unlocked.

> **First-value milestone:** The client's portal is live. All active modules are accessible. The agency admin receives a notification that onboarding is complete.

---

## First-Value Timeline

| Milestone | Reached at | What's unlocked |
|---|---|---|
| Branded experience | End of Step 2 | Site renders with client brand; email previews match |
| Live public URL | End of Step 3 | Domain pointing at the client's actual site |
| Team collaboration | End of Step 5 | Multiple team members with role-based access |
| Connected integrations | End of Step 6 | Google Calendar sync, Zoom links, Gmail flow |
| Working CRM | End of Step 7 | Deal pipeline with stages, contacts importable |
| Full portal access | End of Step 8 | All active modules unlocked; onboarding complete |

For most clients, the gap between wizard start and "full portal access" is measured in minutes for a single user completing it synchronously, or a few hours if Step 6 requires waiting for DNS propagation or third-party OAuth consent from IT.

---

## After the Wizard: What Clients Do Next

### Content
The client's first homepage is a placeholder. The visual block editor is the primary tool for building out real page content — the block picker offers 47+ content block types (hero sections, text columns, image grids, CTAs, embeds, testimonials, and more). Custom post types let the client define structured content beyond standard pages.

The content calendar and publishing kanban board give the client's team a shared view of what's in draft, what's scheduled, and what's live.

### CRM
With the baseline pipeline created in Step 7, the client's sales team can immediately start creating contacts, logging activity, building proposals, and moving deals through stages. DropboxSign e-signature is available for contracts from day one.

### Company Brain
New clients are encouraged to begin capturing knowledge early — the value of Company Brain's semantic search compounds as the knowledge base grows. The Brain onboarding recommendation is to create at least one note per team member's domain, log any existing decisions that inform current work, and define key glossary terms.

### Marketing
Email campaigns require a confirmed sending domain before sends are permitted. The client adds and verifies a sending domain in email settings. Once verified, subscriber import and first campaign send are typically the next steps.

### Billing
The client's plan and module entitlements are configured by the agency admin. If a client wants to activate an additional module (e.g. adding the storefront), they or the agency admin makes the change in billing settings, which updates their Stripe subscription.

---

## Agency Admin: Monitoring Onboarding Progress

From `app/admin/clients/`, the agency admin can see each client's onboarding status, active modules, and plan. If a client gets stuck in the wizard or needs help, the admin can view the client's account and assist without impersonating the user.

The admin can also apply billing overrides, change plan entitlements, and grant or revoke module access on behalf of any client from the same admin panel.

---

## Support During Onboarding

Clients can file support tickets from within the portal at any time — including during onboarding. Tickets are threaded, support file attachments, and appear in the agency's global ticket queue. For complex migrations (e.g. importing an existing website, bulk CRM import, or storefront setup with an existing product catalog), the agency team typically assists directly via a ticket or live session.

The platform also provides a service catalog (`service_catalog_list` MCP tool) and a suggested-projects catalog in the portal — these present structured service requests the client can initiate to engage the agency for specific deliverables (e.g. "set up my Google Workspace integration," "migrate my existing website").
