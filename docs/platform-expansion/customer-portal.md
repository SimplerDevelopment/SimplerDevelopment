# Customer Portal

## Status

**Planned** (Phase 17). The per-tenant *admin* portal exists (`app/portal/`).
The customer-facing *end-customer* portal — where a tenant invites *their*
clients to log in and see bookings, tickets, quotes, invoices, documents,
payments, and messages — is the new capability.

Several public customer-facing surfaces already exist but are token-based
(no login):
- `app/proposal/[token]` — proposal viewing/signing.
- `app/contract/[token]` — contract signing.
- `app/book/[slug]` — public booking pages.
- `app/pitch-deck/[slug]` — public pitch decks.
- `app/widget/chat` — embedded webchat widget.

The Customer Portal adds an **authenticated** surface: a login (email/password,
magic link, or OAuth) bound to `(clientId, contactId)`, with a unified dashboard
across all those modules.

## Portal access

- `portal_users` table: `clientId` (tenant), `contactId` (CRM contact), email,
  password hash, magic-link token, OAuth provider links.
- Login methods: email/password, magic link, optional passwordless.
- Each portal user is strictly bound to one tenant + one CRM contact. Cross-
  tenant access is impossible.

## Dashboard

First screen: welcome message, next booking, open quotes, outstanding invoices,
open tickets, recent messages, documents, pending payments. Only modules the
tenant has active are shown.

## Per-module pages

### Profile
View/edit allowed fields (name, phone, email, language, preferences,
consent), change password, download data (where applicable). Internal CRM fields
are read-only.

### Bookings
Upcoming + history. Reserve, reschedule, cancel — reuses the existing booking
engine (`lib/booking/`). No logic duplication.

### Quotes / Proposals
Draft → sent → viewed → accepted → rejected → expired. Customer can view,
download, accept, reject, comment. Reuses `crm_proposals` + `clientToken`.

### Invoices
List, view, download PDF, see payment status, pay via Stripe Checkout/Elements
(reuses `lib/stripe/`). Interfaces are decoupled from a future full accounting
module.

### Payments
Pay quote, pay invoice, pay booking, see receipt. All through Stripe; never
processes cards directly.

### Tickets
Create, view, reply, upload attachments, see status and assigned team. Reuses
`support_tickets` + `ticket_messages`.

### Documents
View, download, sign (contracts, proposals, invoices, shared documents). Signed
URLs + tenant isolation.

### Messaging
View/continue enabled conversations. Policy-configurable (not all omnichannel
history is automatically exposed).

## Branding

White-label: logo, name, favicon, colors, custom domain, support email, privacy,
terms. Reuses existing `clients.whiteLabelEnabled` + `agency*` fields.

## Security

- Multi-tenant: portal user is `(clientId, contactId)` scoped.
- 2FA optional.
- Rate-limited login.
- Session management via NextAuth or portal-specific tokens.
- Audit-logged access.