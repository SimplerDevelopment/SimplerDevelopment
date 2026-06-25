# Roast: Bookings & Services — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

Two layered concepts live under one domain. First, per-tenant booking pages: agencies use SD to offer scheduling to their own end-customers — 1:1 appointments and group/class sessions — with configurable availability, Stripe payments, Google Calendar / Zoom sync, custom intake questions, waiver collection, add-ons pulled from the store product catalog, and a quote→payment→booking conversion flow. Second, an agency-owned service catalog (`services` table, separate from booking pages) that defines the hosting, development, and maintenance plans the agency sells to its own clients — and which gates feature access inside SD itself via a `requireService` guard (a tenant without an active `booking` service subscription cannot mutate live bookings or gift certificates, even if they have MCP scope).

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS — they configure booking pages for clients as a deliverable, and they consume the service catalog to define their own recurring revenue lines.
- **End user:** The agency's clients' customers (guests who book appointments) and the agency's direct clients (who subscribe to services).
- **Monetization:** Bundled into the SD subscription; the `booking` and `surveys` services are unlockable per-tenant, making bookings a natural upsell within the platform's own service catalog — agencies pay more to enable it for each client they manage.

## The edge

- **MCP-native agent control.** 10 booking tools + 5 service tools are registered in the platform MCP server. An AI agent can scaffold a complete booking page, assign staff, issue gift certificates, and cancel bookings without a human touching the UI — something Calendly, Acuity, and Cal.com have no equivalent for.
- **Approval gate before go-live.** New booking pages are inactive until an admin explicitly approves them via a token-link (`active = true` flip). This matches agency workflows where a client cannot publish anything without sign-off — an invariant none of the standalone schedulers enforce.
- **Store add-on composability.** Booking add-ons can be imported directly from the store product catalog (`from-products` endpoint), so a photography session booking can up-sell a USB of edits from the same inventory — without a separate Zapier integration.
- **Embeddable in tenant websites as blocks.** The `booking` and `booking-menu` block types render natively inside the block-editor CMS, so booking is a page section, not an iframe from a third party.
- **CRM contact linkage.** Bookings associate with CRM contacts at the MCP tool layer, meaning a booked appointment can automatically surface on the contact record and feed automations.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Calendly, Cal.com, Acuity Scheduling, SavvyCal.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses

1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test

Agencies will migrate their clients off Calendly (and the CRM/email/Zapier integrations already wired to it) because the add-on composability, block-embed, and MCP agent control inside SD's bundle outweigh a feature gap in recurring-event types, native mobile apps, and enterprise calendar integrations that Calendly has spent years building.
