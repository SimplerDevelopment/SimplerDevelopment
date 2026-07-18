# Feature Landing Page Spec — Bookings & Scheduling

---

## SEO Block

- **Title (≤60 chars):** Online Booking & Scheduling for Your Clients
- **Meta description (≤155 chars):** Accept appointments, collect payments, and sync with Google Calendar — all on a branded booking page your clients own.
- **Slug:** `/features/bookings-scheduling`
- **Primary keyword:** online booking software for agencies
- **Secondary keywords:** client scheduling page, appointment booking with Stripe, Google Calendar booking sync, add-on services booking, white-label scheduling

---

## Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SimplerDevelopment Bookings & Scheduling",
  "applicationCategory": "BusinessApplication",
  "featureList": [
    "Online time-slot booking",
    "Stripe payment collection at booking",
    "Google Calendar availability sync",
    "Zoom meeting link generation",
    "Add-on services and waivers",
    "Guest cancellation self-service",
    "Booking analytics dashboard",
    "Gift certificate issuance and redemption"
  ],
  "offers": {
    "@type": "Offer",
    "description": "Per-tenant module subscription"
  }
}
```

Additional applicable type: `FAQPage` (see FAQs section below).

---

## Hero

**Headline:** Let Clients Book Appointments Without the Back-and-Forth

**Subhead:** A fully branded booking page — with real-time availability, Stripe payments, add-on services, and Google Calendar sync — that lives on your client's domain and requires no ongoing maintenance from you.

---

## Problem

Agencies that offer time-based services — consultations, workshops, coaching, installations — cobble together a booking link, a payment processor, a calendar app, and a confirmation email workflow from separate tools. None of those tools are under the client's brand, and every change means logging into multiple dashboards.

---

## Solution

SimplerDevelopment gives each client their own booking page inside their portal. They configure their services, staff availability, add-ons, and payment settings once. Guests land on a branded time-slot picker, pay via Stripe, and receive an automatically generated Zoom link for remote appointments. The appointment lands in Google Calendar. The agency never has to touch an external scheduling tool.

---

## Key Benefits

1. **Stripe payments at booking.** Collect deposits or full payment during the scheduling flow — no separate invoicing step required.
2. **Google Calendar availability sync.** Booking pages read from and write to Google Calendar so double-bookings are eliminated without manual coordination.
3. **Zoom meeting links generated automatically.** Remote appointments receive a Zoom link the moment a slot is confirmed; no host action needed.
4. **Add-ons, waivers, and custom questions.** Each booking page supports optional add-on services, digital waivers, and intake questions surfaced to the guest during checkout.
5. **Built-in analytics and check-in.** The portal includes a calendar view, a check-in screen, and an analytics dashboard so clients can track booking volume and attendance.

---

## How It Works

1. **Create a booking page in the portal.** Define the service name, duration, availability windows, staff, add-ons, intake questions, and payment amount. The page requires admin approval via a secure link before it goes live.
2. **Share the public URL.** Guests visit `yourdomain.com/book/your-service` and pick an available slot from the live calendar.
3. **Guest completes payment and receives confirmation.** Stripe processes the payment. A confirmation email goes out with the appointment details and, for remote sessions, the Zoom meeting link.
4. **Client manages bookings from the portal.** The booking list, calendar view, and check-in screen give the client full visibility. They can update or cancel bookings; guests can self-cancel via a secure link in their confirmation email.

---

## FAQs

**Q: Does a client need a separate Stripe account?**
A: Clients can use the agency's shared Stripe integration or connect their own Stripe account via the portal settings. Both options are supported.

**Q: Can a client accept bookings without taking payment?**
A: Yes. Payment collection is optional per booking page. Pages can be configured for free appointments with no Stripe step.

**Q: How does availability work if staff calendars are not on Google Calendar?**
A: Availability windows are configured directly in the portal as day/time slots. Google Calendar sync adds an additional layer — it blocks times when the connected calendar shows busy — but the base availability settings work independently of any calendar integration.

**Q: Is the booking page brandable?**
A: Yes. The booking page styling is controlled from the portal, and the page is served from the client's own domain.

**Q: What happens if a guest needs to cancel?**
A: Every confirmation email includes a self-service cancellation link. Clients can also cancel or update bookings from the portal's booking management screen.

---

## CTA

**Primary:** Start accepting bookings — [Start free trial]
**Secondary:** See the booking flow in action — [Book a demo]

---

## Internal Links

- [AI Agent Platform](/features/ai-agent-platform) — manage booking pages and records via MCP tools (`booking_pages_*`, `bookings_*`)
- [Automations & Workflows](/features/automations-workflows) — trigger follow-up emails or CRM actions after a booking is confirmed
- [CRM](#) — automatically route new bookings into your client's CRM pipeline
- Developer reference: [docs/agents/tool-reference.md](../../docs/agents/tool-reference.md) — `booking_pages_*` and `bookings_*` tool families

---

## Media Requirements

- **Screenshot:** Public booking page time-slot picker on a branded domain, showing available slots and a service description.
- **Screenshot:** Portal booking management list view with status indicators (upcoming, completed, cancelled).
- **Screenshot:** Booking page settings panel — availability windows, add-ons tab, payment settings.
- **Screenshot:** Calendar view inside the portal showing confirmed bookings.
- **GIF:** Guest flow from landing on the booking page → selecting a slot → completing Stripe payment → confirmation screen (approx. 15 seconds).
- **Screenshot:** Analytics tab — booking volume chart and attendance summary.

---

## Status Notes (internal — omit from published page)

- Quote flow (`booking_quotes`) has thin test coverage — do not feature on this page.
- Zoom integration is token-only; Google Calendar write-back works but Zoom calendar write-back does not.
- Admin approval via token link is required before a booking page goes live — mention this as a workflow step, which it is.
