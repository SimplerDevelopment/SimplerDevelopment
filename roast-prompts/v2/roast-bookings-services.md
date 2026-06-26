# Roast: Bookings & Services — SimplerDevelopment (V2)

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

Two layered concepts live under one domain. First, per-tenant booking pages: agencies use SD to offer scheduling to their own end-customers — 1:1 appointments and group/class sessions — with configurable availability, Stripe payments, Google Calendar / Zoom sync, custom intake questions, waiver collection, add-ons pulled from the store product catalog, and a quote→payment→booking conversion flow. Second, an agency-owned service catalog (`services` table, separate from booking pages) that defines the hosting, development, and maintenance plans the agency sells to its own clients — and which gates feature access inside SD itself via a `requireService` guard (a tenant without an active `booking` service subscription cannot mutate live bookings or gift certificates, even if they have MCP scope).

The V2 thesis: this module exists for **net-new client onboards only**. No migration story. No Calendly displacement for clients who already have scheduling wired to a CRM, email, or Zapier chain. Agencies picking up a fresh client who needs scheduling skip the point-tool purchase entirely because booking, CRM, intake, approval, and block-embed are already in the platform the agency is already paying for.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS — they configure booking pages for net-new clients as a deliverable, and they consume the service catalog to define their own recurring revenue lines. Migration-from-Calendly is explicitly out of scope; this module is for day-one clients with no prior scheduling investment.
- **End user:** The agency's clients' customers (guests who book appointments) and the agency's direct clients (who subscribe to services).
- **Monetization:** Bundled into the SD subscription; the `booking` service is an unlockable per-tenant add-on within the platform's own service catalog — agencies pay more to enable it per managed client. No standalone product ambition; the revenue motion lives entirely inside the bundle.

## The edge

- **Approval gate before go-live.** New booking pages are inactive until an admin explicitly approves them via a token-link (`active = true` flip). This matches agency workflows where a client cannot publish anything without sign-off — an invariant none of the standalone schedulers enforce. This is the headline differentiator: it positions SD as the only scheduler that inherits the agency's governance model by default.
- **Native block-embed in the tenant CMS.** The `booking` and `booking-menu` block types render natively inside the block-editor CMS, so a booking widget is a page section, not a third-party iframe. A net-new client's full site — hero, copy, booking form — lives and publishes from one SD panel under agency control, with no external account to provision or bill separately.
- **Store add-on composability.** Booking add-ons can be imported directly from the store product catalog (`from-products` endpoint), so a photography session booking can up-sell a USB of edits from the same inventory without a separate integration layer.
- **CRM contact linkage.** Bookings associate with CRM contacts at the data layer, meaning a booked appointment surfaces automatically on the contact record and can feed automations — no middleware required.
- **MCP-native agent control (quiet differentiator).** 10 booking tools + 5 service tools are registered in the platform MCP server. An AI agent can scaffold a complete booking page, assign staff, issue gift certificates, and cancel bookings without a human touching the UI. This is relevant to builder/developer buyers and worth a footnote in the pitch; it is not the primary message to the business owner signing the check.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- **ICP is explicitly net-new client onboards.** Agencies with existing Calendly/Acuity wiring (webhooks, CRM zaps, email integrations) stay on those tools. This module does not attempt to absorb migration cost and does not compete on calendar-sync edge cases, recurring-event types, or mobile apps where point tools have years of investment.
- **GO-LIVE BLOCKERS — real code work, committed and in progress, not yet complete:**
  1. **Reliability hardening (scheduling correctness).** Reminder delivery, timezone/DST rendering for out-of-state guests, double-booking prevention under concurrent requests, and no-show handling are not yet stress-tested in production. These are the highest-ticket support categories in scheduling SaaS. No GTM motion advances until three consecutive net-new client booking cycles run clean with zero forced fallbacks to a point tool.
  2. **`requireService` gate UX.** The current guard surfaces as a penalty wall that agencies must explain to clients ("why can't I do X?"). It needs to read as platform billing integrity — flat and invisible to the end client — not as a dark-pattern upsell. This requires UI and billing-surface code changes before any agency can confidently demo the module to a client.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses

1. **Earns its place in the suite?** Does approval-gate + block-embed + bundled composability create enough value for net-new onboards that agencies genuinely skip the point-tool purchase — or does the reliability gap (reminders, timezone, double-book) always surface first, sending them back to Calendly and making this module a perpetual almost-good-enough?
2. **No standalone ambition — bundled retention layer.** The prior standalone lens is retired. The council verdict is unambiguous: this module has no defensible wedge outside the suite. Its edges (CRM linkage, CMS block-embed, service catalog gating, MCP tools) are entirely derivative of co-location with the rest of SD. Roast it instead on whether the ongoing maintenance obligation (calendar sync, timezone edge cases, reminder infrastructure) is justified by the net-new onboard savings, or whether it will quietly drain solo-founder focus while the higher-leverage parts of the platform wait.

## Riskiest assumption to pressure-test

The prior riskiest assumption — that agencies will migrate clients off Calendly for composability — is explicitly retired. The de-risked posture: **agencies picking up net-new clients will trust SD's scheduling reliability enough to skip a point-tool purchase entirely.** Validation path is the cheapest test: take the next 3 net-new client onboards, stand up their booking entirely inside SD with zero Calendly, and watch one full booking cycle for the boring failure modes (reminder delivery, timezone accuracy for an out-of-state guest, no double-book). If none hits a wall, the net-new wedge is real and the reliability blockers are closeable. If one forces a fallback, that specific failure mode is the exact scope of work to close before expanding.
