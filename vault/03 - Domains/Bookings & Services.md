---
type: domain-map
domain: bookings
status: active
date: 2026-06-10
sources:
  - lib/booking/
  - lib/db/schema/tools.ts
  - lib/db/schema/sites.ts
  - lib/mcp/tools/bookings.ts
  - app/api/admin/portal/booking/route.ts
---

# Domain: Bookings & Services

## Purpose

Two related but distinct concepts live here:

- **Bookings** — per-tenant scheduling product. Clients create booking pages (services with availability windows), guests reserve slots on a public URL, payments flow through Stripe, and calendar events sync to Google Calendar or Zoom. Supports 1-to-1 appointments and group/class sessions.
- **Services** — the agency's own service catalog (hosting, domain, development, maintenance plans). Clients subscribe to services, which gate feature access (including the booking tool itself via `requireService`). Service requests are client-initiated enquiries the admin reviews.

## Key entry points

| Surface | Path |
|---|---|
| Public booking page | `app/book/[slug]/page.tsx` |
| Public booking cancel | `app/book/cancel/page.tsx` |
| Portal booking list | `app/portal/tools/booking/page.tsx` |
| Portal booking detail + config | `app/portal/tools/booking/[id]/page.tsx` |
| Portal calendar view | `app/portal/tools/booking/calendar/page.tsx` |
| Portal check-in | `app/portal/tools/booking/checkin/page.tsx` |
| Portal quotes | `app/portal/tools/booking/quotes/page.tsx` |
| Portal new quote | `app/portal/tools/booking/quotes/new/page.tsx` |
| Portal analytics | `app/portal/tools/booking/analytics/page.tsx` |
| Portal new booking page | `app/portal/tools/booking/new/page.tsx` |
| Admin booking overview | `app/admin/booking/` |
| Core lib helpers | `lib/booking/` |

## Data model

All booking tables live in `lib/db/schema/tools.ts`. Service / service-request tables live in `lib/db/schema/sites.ts`.

**Booking tables (`lib/db/schema/tools.ts`)**

| Table | Purpose |
|---|---|
| `booking_pages` | One row per bookable service offering. Holds availability JSON, pricing, feature toggles (add-ons, waivers, gift certificates, discount codes), assignment mode, and `active` flag. |
| `booking_page_members` | Staff who can handle a booking page; per-member availability overrides and calendar colour. |
| `bookings` | Individual reservations. Tracks guest info, times, payment status, Stripe payment intent, assigned staff, check-in state, and `reminderSentAt` (idempotency sentinel for the reminder cron). |
| `booking_attendees` | Extra attendees for group/class sessions (`bookingType = 'group'`). For individual bookings the `bookings` row is the sole attendee; no row here. |
| `booking_add_ons` | Optional extras attached to a booking page (custom or linked to a store product). |
| `booking_selected_add_ons` | Price-snapshot join between a booking and the add-ons the guest chose. |
| `booking_waivers` | Signed waivers collected at booking time (base64 PNG signature + content snapshot). |
| `booking_quotes` | Pre-authorised quotes sent to a customer that convert to a booking upon payment. |
| `booking_date_overrides` | Per-date availability overrides (blocked or custom hours) keyed by `(bookingPageId, date)`. |
| `google_calendar_tokens` | Per-client OAuth tokens for Google Calendar sync (one row per client). |
| `zoom_tokens` | Per-client Zoom OAuth tokens for meeting link generation. |
| `gift_certificates` | Purchasable codes redeemable at bookings or the store. |
| `gift_certificate_redemptions` | Audit trail of redemptions; `context` = `booking` or `store`. |

**Service tables (`lib/db/schema/sites.ts`)**

| Table | Purpose |
|---|---|
| `services` | Agency service catalog (domain, hosting, development, maintenance). Carries Stripe price/product IDs and `active` flag. |
| `client_services` | Active subscriptions — links `clients` to `services` with status, renewal date, and credit grant tracking. |
| `service_requests` | Client-initiated enquiry for a service; status progresses `pending → reviewed → approved/rejected`. |

## API surface

**Portal (authenticated, tenant-scoped via `lib/active-client.ts`)**

- `app/api/portal/tools/booking/route.ts` — CRUD for booking pages
- `app/api/portal/tools/booking/[id]/route.ts` — single page get/update/delete
- `app/api/portal/tools/booking/[id]/bookings/route.ts` — list bookings for a page
- `app/api/portal/tools/booking/[id]/bookings/[bookingId]/route.ts` — get/update single booking
- `app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route.ts` — initiate Stripe refund
- `app/api/portal/tools/booking/[id]/add-ons/route.ts` + `[addOnId]/route.ts` — manage add-ons
- `app/api/portal/tools/booking/[id]/add-ons/from-products/route.ts` — import store products as add-ons
- `app/api/portal/tools/booking/[id]/date-overrides/route.ts` + `[overrideId]/route.ts`
- `app/api/portal/tools/booking/[id]/waivers/route.ts` — list/submit waivers; `app/api/portal/tools/booking/[id]/waivers/[waiverId]/pdf/route.ts` — export single waiver PDF; `app/api/portal/tools/booking/[id]/waivers/bulk-download/route.ts` — ZIP of all waivers for a booking page
- `app/api/portal/tools/booking/[id]/members/route.ts` — staff member management
- `app/api/portal/tools/booking/[id]/embed/route.ts` — embed snippet generation
- `app/api/portal/tools/booking/analytics/route.ts` — booking analytics aggregates
- `app/api/portal/tools/booking/calendar/route.ts` — calendar feed
- `app/api/portal/tools/booking/checkin/route.ts` + `today/route.ts` — check-in flow
- `app/api/portal/tools/booking/quotes/route.ts` + `[quoteId]/route.ts` — quotes CRUD
- `app/api/portal/tools/booking/google/auth|callback|disconnect/route.ts` — Google Calendar OAuth
- `app/api/portal/tools/booking/zoom/auth|callback|disconnect/route.ts` — Zoom OAuth

**Public (unauthenticated, resolved by `[slug]`)**

- `app/api/public/booking/[slug]/route.ts` — fetch booking page metadata
- `app/api/public/booking/[slug]/slots/route.ts` — available slot computation
- `app/api/public/booking/[slug]/book/route.ts` — create a booking (POST)
- `app/api/public/booking/[slug]/add-ons/route.ts` — fetch add-ons for the page
- `app/api/public/booking/[slug]/validate-discount/route.ts` — discount / gift-cert validation
- `app/api/public/booking/[slug]/waiver/route.ts` — waiver submission
- `app/api/public/booking/cancel/route.ts` — guest-initiated cancellation via `cancelToken`
- `app/api/public/booking/by-domain/[domain]/route.ts` + `by-site/[siteId]/route.ts` — list pages by tenant
- `app/api/public/booking/quote/[slug]/route.ts` + `pay/route.ts` — public quote view and payment

**Stripe webhook**

- `app/api/stripe/webhook/booking/route.ts` — handles `payment_intent.succeeded` / `payment_intent.payment_failed` for bookings

**Admin**

- `app/api/admin/portal/booking/route.ts` — admin-facing booking management endpoint (backs `app/admin/booking/`)

**Approval gate**

- `app/api/approve/[token]/route.ts` — approving a `booking_page` entity flips `active = true`, making the page live at `/book/<slug>`

## MCP tools

Registered in `lib/mcp/tools/bookings.ts` (scope `bookings:read` / `bookings:write`):

| Tool | Scope |
|---|---|
| `booking_pages_create` | `bookings:write` |
| `booking_pages_update` | `bookings:write` |
| `booking_pages_list` | `bookings:read` |
| `booking_pages_get` | `bookings:read` |
| `bookings_list` | `bookings:read` |
| `bookings_get` | `bookings:read` |
| `bookings_cancel` | `bookings:write` |
| `bookings_update` | `bookings:write` |
| `gift_certificates_list` | `bookings:read` |
| `gift_certificates_issue` | `bookings:write` |

Registered in `lib/mcp/tools/services.ts` (scope `services:read` / `services:write`):

| Tool | Scope |
|---|---|
| `service_requests_list` | `services:read` |
| `service_requests_create` | `services:write` |
| `service_catalog_list` | `services:read` |
| `suggested_projects_list` | `services:read` |
| `suggested_project_requests_create` | `services:write` |

`bookings_cancel`, `bookings_update`, and `gift_certificates_issue` also call `requireService(clientId, 'booking')` — if the client does not have an active booking service subscription the call is denied. `booking_pages_create` and `booking_pages_update` rely on scope guards only. See the Invariants section for the full guard contract.

## UI surfaces

**Portal config** (`app/portal/tools/booking/[id]/`)

Tabbed panels rendered by components in `app/portal/tools/booking/[id]/_components/`:
- `SettingsPanel.tsx` — duration, buffer, availability hours, timezone, pricing
- `AvailabilityPanel.tsx` — per-date overrides
- `StaffPanel.tsx` — member assignment and round-robin pool
- `BookingsPanel.tsx` — past and upcoming bookings list
- `QuestionsPanel.tsx` — custom intake questions
- `StylingPanel.tsx` — colours and branding overrides
- `EmbedPanel.tsx` — embed snippet

**Public booking page**

`app/book/[slug]/page.tsx` — fully public, no auth required. Renders the time-slot picker, add-on selection, Stripe payment, waiver collection, and confirmation. Cancellation via `app/book/cancel/page.tsx`.

**Embeddable blocks** (in `lib/blocks/registry.ts`)

| Block type | Label | Icon |
|---|---|---|
| `booking` | Booking | `calendar_month` |
| `booking-menu` | Booking Menu | `event_available` |
| `services-grid` | Services | `apps` |

These are rendered inside `app/sites/**` for tenant public websites.

## Tests & gates

| Path | Type | What it covers |
|---|---|---|
| `tests/unit/booking-assign.test.ts` | unit | Round-robin / fewest-upcoming assignment logic |
| `tests/unit/booking-capacity.test.ts` | unit | Group capacity tracking |
| `tests/unit/booking-timezone.test.ts` | unit | Timezone slot computation |
| `tests/unit/api-public-booking-book-route.test.ts` | unit | Public book endpoint |
| `tests/unit/api-public-booking-book-route-coverage.test.ts` | unit | Edge-case coverage |
| `tests/unit/api-stripe-webhook-booking-route.test.ts` | unit | Stripe webhook handler |
| `tests/unit/api-cron-stuck-booking-holds-route.test.ts` | unit | Stuck-hold cleanup cron |
| `tests/unit/api-portal-booking-members-route.test.ts` | unit | Staff member CRUD |
| `tests/unit/mcp-tools-bookings.test.ts` | unit | MCP booking tool handlers |
| `tests/unit/mcp-tools-services.test.ts` | unit | MCP service tool handlers |
| `tests/unit/email-booking-emails.test.ts` | unit | Booking confirmation/reminder email rendering |
| `tests/unit/hooks-use-booking-page.test.ts` | unit | `useBookingPage` hook |
| `tests/integration/api/booking/bookings.test.ts` | integration | Portal booking CRUD with real DB |
| `tests/integration/api/booking-public.test.ts` | integration | Public booking endpoints |
| `tests/integration/api/cron/booking-reminders.test.ts` | integration | Reminder cron idempotency |
| `tests/integration/api/public/booking/` | integration | Full public booking flows |
| `tests/integration/booking/` | integration | Core booking logic |
| `tests/e2e/portal-booking.spec.ts` | e2e | Portal booking management flow |
| `tests/e2e/portal-booking-detail-baseline.spec.ts` | e2e | Booking page detail baseline |
| `tests/e2e/portal-booking-internals.spec.ts` | e2e | Internal booking operations |
| `tests/e2e/group-booking.spec.ts` | e2e | Group/class booking flow |
| `tests/e2e/admin-booking.spec.ts` | e2e | Admin booking management |
| `tests/e2e/portal-service-requests.spec.ts` | e2e | Service request portal flow |
| `tests/unit/components-booking-form-inline.test.tsx` | unit | Inline booking form component |
| `tests/unit/app-admin-portal-services-page.test.tsx` | unit | Admin services page |
| `tests/unit/components-portal-service-request-form.test.tsx` | unit | Service request form component |
| `tests/e2e/portal-automations-services-hosting-mutations.spec.ts` | e2e | Service and hosting mutation flows |

## Cross-domain dependencies

- **CRM** — bookings can be associated with CRM contacts; `crmContacts` is queried in the MCP bookings tool. See [[CRM]].
- **Email & Campaigns** — `lib/booking/host-notification.ts` resolves the host email address (assigned staff first, then client owner). The reminder cron dispatches pre-booking nudge emails. See [[Email & Campaigns]].
- **Integrations — Google Calendar / Zoom** — `googleCalendarSync` flag on `booking_pages` triggers event creation in the connected Google Calendar (`google_calendar_tokens`). `conferenceType` = `google_meet` or `zoom` auto-generates meeting links using the respective OAuth tokens (`zoom_tokens`). See [[Integrations - Google, Microsoft & OAuth]].
- **Billing & Stripe** — paid bookings create a `stripePaymentIntentId`; the webhook at `app/api/stripe/webhook/booking/route.ts` handles fulfillment. Gift certificates cross into billing. See [[Billing & Stripe]].
- **Blocks** — `booking` and `booking-menu` block types render booking pages inside tenant sites. `services-grid` renders the agency catalog. Blocks are universal; registered in `lib/blocks/registry.ts`.

## Invariants & gotchas

- **`active = true` approval gate.** A newly created booking page is inactive by default. The admin must approve it via the approval-link flow (`app/api/approve/[token]/route.ts`), which flips `active = true`. Until approved, `/book/<slug>` is unreachable by guests. Do not bypass `active` checks in public slot queries.
- **`requireService` guard.** The three write tools that mutate live booking or payment data — `bookings_cancel`, `bookings_update`, and `gift_certificates_issue` — call `requireService(clientId, 'booking')` before mutating. If the client's `client_services` row for the `booking` service is absent or inactive, the tool returns denied. This is separate from MCP scope guards — both must pass. Booking page CRUD tools (`booking_pages_create`, `booking_pages_update`) rely on scope guards only and do not call `requireService`.
- **Reminder idempotency.** The hourly cron (`app/api/cron/booking-reminders`, schedule `0 * * * *`) only emails guests whose `reminderSentAt` is `NULL`. It sets the column on dispatch — never re-send.
- **Stuck-hold cleanup.** Every 30 minutes (`*/30 * * * *`) `app/api/cron/stuck-booking-holds` releases payment intents that never completed, preventing slot lockout.
- **Group vs individual bookings.** When `bookingType = 'group'`, one `bookings` row is the slot/class and `booking_attendees` holds each registrant. For `individual` the `bookings` row IS the single attendee — `booking_attendees` is never populated.
- **Assignment modes.** `fixed` (single owner), `round_robin` (fewest bookings in next 7 days), and `fewest_upcoming` (fewest total upcoming). Logic lives in `lib/booking/assign.ts`. Override the pool with `roundRobinPool` JSON on the booking page.
- **Services vs booking pages.** The `services` table in `lib/db/schema/sites.ts` is the agency's own product catalog — not the same as booking pages. Clients subscribe to services; booking pages are the schedulable items they offer to their own customers.

## Planning notes

- Zoom OAuth sub-routes live at `app/api/portal/tools/booking/zoom/`; Google Calendar at `app/api/portal/tools/booking/google/`. Google Calendar is more complete; Zoom is token-only (no calendar write back).
- Quote flow (`booking_quotes`) exists but has thin integration test coverage — treat as experimental.
- `lib/booking/capacity.ts` and `lib/booking/availability.ts` handle slot overlap detection and capacity enforcement.

## Related

- [[CRM]]
- [[Email & Campaigns]]
- [[Integrations - Google, Microsoft & OAuth]]
- [[Billing & Stripe]]
