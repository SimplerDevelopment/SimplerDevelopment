---
type: sales-collateral
document: enterprise-overview
phase: 19
date: 2026-06-27
status: internal-draft
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
  - marketing/feature-pages/
---

# SimplerDevelopment — Enterprise & Agency Tier Overview

This document covers the concerns most relevant to larger buyers, platform administrators, and technical evaluators: multi-tenancy architecture, white-label configuration, access control, integrations, deployment topology, security posture, and support.

---

## Multi-Tenancy Architecture

SimplerDevelopment is designed from the ground up as a multi-tenant system, not a single-tenant product with client switching bolted on.

**Tenant isolation is enforced at the data layer.** Every row in every tenant-scoped table carries a `clientId` foreign key. Every API handler and every MCP tool validates the active `clientId` before executing. A dedicated regression test suite (`bun test:tenancy`) specifically hunts for cross-tenant data leaks and runs on every push — a passing tenancy gate is a required status check.

**What isolation means in practice:**
- A client's CRM contacts, deals, Brain notes, and website content are never accessible to another client — even if both tenants share the same deployment.
- Each tenant has their own isolated sites (a single tenant can have multiple websites), their own Company Brain knowledge base, their own CRM pipeline configurations, and their own billing subscription.
- Site-resolver middleware resolves the active `clientId` and `siteId` on every request from the `Host` header (public site) or session + URL parameter (portal).

**A single agency admin manages all tenants** from the `app/admin/` panel. Admin routes are access-controlled to agency-level super-admins only — not visible to any client.

---

## White-Label and Agency Tier

The platform supports white-label configuration at the agency and per-tenant levels.

### Per-tenant branding (all tiers)
Every client gets a full branding profile: colors, typography, logo, messaging, and a generated brand style guide. The branding profile is used consistently across the client's website, email campaigns, and pitch decks. Multiple branding profiles can be saved per tenant (for managing multiple brands or sites).

MCP tools (`branding_*`) allow AI agents to read the active brand profile, run contrast audits, and update brand messaging — keeping AI-generated content on-brand.

### Agency white-label (Scale tier)
The Scale tier allows an agency to deploy the portal under a **custom domain** (e.g. `portal.example.com` instead of the default platform domain). DNS TXT verification confirms domain ownership before the custom domain goes live. The portal chrome — colors and visual framing — can be overridden to match the agency's own brand.

> **Note:** Sub-account resale (where a client can in turn resell access to their own end-customers) does not have a dedicated UI in the current release. White-label is an agency-to-client configuration, not a multi-level resale flow.

---

## Roles and Access Control

### Portal roles
Each tenant's portal has two user roles:

| Role | Permissions |
|---|---|
| **admin** | Full access to all portal domains — sites, CRM, Brain, projects, billing settings, team management |
| **editor** | Content editing and read access; cannot change billing, team roles, or security settings |

### Agency admin
Agency super-admins have access to the global `app/admin/` panel, which shows all tenants, billing overrides, MCP approval queues, and platform-level configuration. Agency admin access is entirely separate from any client's portal.

### API and MCP access control
MCP tokens are issued with approximately 50 named scopes (`brain:read`, `crm:write`, `email:send`, `approvals:manage`, etc.). A `*` wildcard scope grants full access; production integrations should request the minimum scope set required. Tokens are issued as:
- **Portal API keys** (`sd_mcp_` prefix) — SHA-256 hashed at rest, created in Settings → API Keys.
- **OAuth 2.1 tokens** (`sd_oauth_` prefix) — issued via a standard auth-code flow with PKCE (RFC 7636) and RFC 8707 resource audience binding.

Per-project outbound webhooks allow external systems to receive kanban event notifications. Webhooks are SSRF-guarded.

---

## Integrations

| Integration | Purpose |
|---|---|
| **Google Workspace** | Gmail push sync and inbound routing, Drive change polling, Google Calendar availability for bookings, Contacts sync |
| **Microsoft 365 / Teams** | Meeting transcript ingestion via Microsoft Graph change notifications |
| **Stripe** | Tenant billing (subscriptions, Checkout, webhooks); BYOK mode allows tenants to connect their own Stripe account for storefront payment processing |
| **Resend** | Outbound transactional and marketing campaign email |
| **Cloudflare Email Worker** | Inbound email routing to Company Brain review queue |
| **DropboxSign** | E-signature on CRM contracts — embedded iframe or per-signer email link |
| **EasyPost** | Live shipping label generation for storefront orders |
| **Printful** | Print-on-demand product fulfillment for storefront |
| **Zoom** | Meeting link generation for booking confirmations |
| **OpenAI** | Embeddings for Company Brain semantic search; AI content generation across slides, canvas, and Brain agent responses. BYOK: tenants can supply their own OpenAI API key, encrypted AES-256-GCM at rest |
| **Upstash Redis** | Auth rate limiting (fail-open architecture; no hard rate-limit failures) |

**What is not currently available:** Publishing content to social media channels; webhook publishing; a self-serve OAuth developer console for registering third-party OAuth clients.

---

## Deployment Topology

### Hosted (agency-managed)
The most common model: the agency deploys one platform instance and provisions all client tenants within it. Infrastructure decisions are made once by the agency; clients interact only through their portal.

```
Next.js app (Vercel or any Next.js host)
  └─ Postgres + pgvector  (Railway / Neon / Supabase / self-hosted)
  └─ Yjs WebSocket server (Railway — real-time collaboration for editor and pitch decks)
```

- Production branch: `main`. All other pushed branches deploy automatically as Preview environments.
- Each environment (production, staging, dev) must have its own isolated Postgres database.
- The `pgvector` Postgres extension is required on every database — Company Brain embeddings fail without it.
- No data is shared between environments by design.

### Self-hosted
The platform is deployable on self-managed infrastructure. The Next.js app can run on any compliant Next.js host; the database can be any Postgres instance with pgvector enabled. BYOK for AI and payments is fully supported in self-hosted mode.

Self-hosted deployments retain full control over Postgres schema (Drizzle ORM, migration files in `drizzle/`), data residency, and hosting region.

### BYOK (Bring Your Own Key) summary
| Key type | Where configured | Encryption at rest |
|---|---|---|
| OpenAI API key | Portal → Settings → AI | AES-256-GCM (`lib/crypto/`) |
| Stripe account keys | Portal → Store settings | Varies by Stripe Connect model |

---

## Security and Authentication

- **Sessions:** NextAuth v5, JWT in `httpOnly` cookie. 7-day max age, 1-day idle refresh. Providers: password (bcrypt) and Google OAuth.
- **MFA:** TOTP multi-factor authentication. Enrolling generates a TOTP secret; login prompts for the 6-digit code. Disabling MFA requires password re-verification. Shipped 2026-06-26.
- **OAuth 2.1 server:** The platform runs a full authorization server for MCP clients — auth-code flow, PKCE (RFC 7636), RFC 8707 audience binding. Admin UI for managing OAuth clients.
- **Tenant isolation enforcement:** `clientId`/`siteId` scope guards on every API handler and MCP tool. Dedicated tenancy regression test gate.
- **Rate limiting:** Upstash Redis-backed auth rate limiting. Fail-open — no hard outage if Redis is unavailable.
- **BYOK key encryption:** AES-256-GCM for AI keys stored in the platform's Postgres.
- **MCP human-in-the-loop:** Live-content write tools produce an approval link that a human must click before the change takes effect. Draft and metadata operations are immediate.

---

## Support Posture

**What is built into the platform:**
- Every tenant has a support ticket module — clients can submit tickets, attach files, and receive threaded replies from the agency. The tickets module includes basic SLA tracking (calendar-hours measurement).
- The agency admin panel has a global ticket queue view for managing tickets across all clients.
- Company Brain can route inbound email to a review queue for structured triage.

**What is not currently documented:** Platform-level service-level agreements (uptime guarantees, response-time commitments) are not specified in the current product documentation. Buyers requiring contractual SLA commitments should request current terms separately.

---

## Getting Started

1. **Agency provisioning:** An agency account is created in the admin panel. Super-admin credentials are set at deploy time.
2. **Client onboarding:** From the admin panel, provision a new client. The client receives an invite link to the portal and steps through an 8-step onboarding wizard covering branding, site setup, team, and integrations.
3. **White-label (Scale tier):** Point a CNAME to the platform host, add the domain in Agency → Branding → Custom Domain, and complete DNS TXT verification.
4. **AI/MCP integration:** Generate an API key in Settings → API Keys, or go through the OAuth 2.1 flow to obtain a scoped token. Point any MCP-compatible client at `POST /api/mcp`.
