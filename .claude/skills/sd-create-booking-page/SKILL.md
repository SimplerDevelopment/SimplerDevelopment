---
name: sd-create-booking-page
description: List, inspect, and embed booking pages from the SimplerDevelopment portal. Embeds an existing booking page into a CMS page, deck, or email via the `booking` block (or `booking-menu` for all-services). Returns the public `/book/<slug>` URL. NOTE — booking-page CREATE/UPDATE via MCP is not yet wired (the portal REST API and the UI are the canonical authoring path). This skill helps you DISCOVER existing booking pages and EMBED them; for net-new booking-page authoring it walks the user through portal-side setup. Use when the user says 'add a booking widget to this page', 'embed the discovery call booking', 'link the demo booking page', 'show our consulting hours', 'add a calendar to the email'.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-create-booking-page

This skill is split into two flows because of a gap in the MCP surface:

- **Flow A: embed an existing booking page** — fully wired today. Just embed via the `booking` block.
- **Flow B: author a new booking page from scratch** — MCP doesn't yet expose `booking_pages_create` / `booking_pages_update`. The skill walks the user through portal-side setup (with the exact fields), then comes back to Flow A.

The roadmap is: scaffold `booking_pages_create` + `booking_pages_update` MCP tools (use the `simplerdev-mcp-tool` skill) and widen this skill to author end-to-end. Until then, **be honest about the constraint** in the response.

## Pre-flight

1. **Read `.sd/config.json`** — confirm `client.id`, `defaultSiteId`, `brand`.
2. **Read `.sd/learnings.md`** if present — surface relevant active rules.
3. **Identify the use case.** Ask only if not obvious:
   - Discovery / sales call?
   - Service appointment (with price, duration)?
   - Group session (multi-attendee)?
   - Free consultation?

## Flow A — embed an existing booking page

### 1. Discovery

Call `mcp__simplerdevelopment-postcaptain__booking_pages_list` to enumerate what already exists. For each page, the response includes `id`, `slug`, `title`, `price`, `duration`, `active`, `assignmentMode`, `bookingType`.

If multiple match the user's intent (e.g. several "discovery call" variants), ask which one. If none match, pivot to Flow B.

### 2. Embed

For embedding in a CMS page or deck slide, append a `booking` block:

```json
{
  "id": "booking-1",
  "type": "booking",
  "order": <next>,
  "slug": "<booking-page-slug>",
  "title": "Book a 30-minute discovery call",
  "description": "Pick a time that works — we'll send a calendar invite + a 24h reminder.",
  "showPageTitle": false,
  "showDescription": false,
  "showSteps": true,
  "showLogo": true,
  "height": 720
}
```

`slug` is the only required field. The block renders the booking widget inline (no iframe — it's a native React component bound to the booking page's availability).

For an "all services" menu (e.g. a service-listings page), use `booking-menu`:

```json
{ "id": "menu-1", "type": "booking-menu", "order": <next>,
  "title": "Book a session", "columns": 3 }
```

This walks every active booking page on the site and renders them in a card grid.

### 3. Link from emails

Emails can't embed the booking widget (email clients don't run React), so use a button:

```json
{ "id": "cta", "type": "button", "order": <next>,
  "text": "Book a 30-min discovery call",
  "url": "https://<site-domain>/book/<slug>",
  "style": { "backgroundColor": "<brand.primaryColor>", ... } }
```

**Always include the full URL** (not relative) — emails resolve links absolutely.

### 4. Link from surveys

A survey's recommendation engine has a `bookUrl` field — set it to the public booking URL. After the user finishes the survey and is shown a recommendation, the CTA points at the right booking page.

```json
"recommendation": {
  ...,
  "bookUrl": "https://<site-domain>/book/<slug>"
}
```

### 5. Confirmation emails

Booking pages send confirmation + cancellation emails automatically via `lib/email/booking-emails.ts`. **They are NOT brand-aware out of the box** — they use a stock template. If the user wants branded confirmations, that's a server-side change request (note in the response).

Reminder emails are **NOT** sent today — no cron exists. If the user wants reminders, that's also a server-side change request.

## Flow B — author a new booking page (portal-side)

If no existing page fits, the skill produces a step-by-step recipe for the user to follow in `/portal/tools/booking/new`:

1. **Identity:** `title` (max 100), `slug` (auto-derived from title, editable), `description`.
2. **Pricing:** `price` (in cents), `priceLabel` (free text e.g. "Starts at $200"). For free consultations: `price: 0`, `priceLabel: "Free"`.
3. **Schedule:** `duration` (minutes), `bufferBefore`, `bufferAfter`, `maxAdvanceDays`, `minNoticeMins`, `timezone` (default America/New_York).
4. **Availability:** day-of-week + time-range matrix. Default Mon–Fri 09:00–17:00.
5. **Questions:** an array of `{ id, label, type: 'text'|'textarea'|'select', required, options? }` shown to the booker before confirming.
6. **Assignment:** `assignmentMode: 'fixed' | 'round_robin' | 'weighted_round_robin'` + `assignedMembers: [userId, ...]`.
7. **Booking type:** `individual` (one attendee per slot), `group` (one host, multiple attendees, `groupCapacity` cap), or `multi-attendee` (multiple discrete slots).
8. **Add-ons / discounts / gift cert / waiver toggles** if needed.
9. **Branding:** pick the brand profile so it inherits colors + fonts. Override `styling.{primaryColor, backgroundColor, textColor, headingFont, bodyFont, borderRadius}` only if the brand defaults are wrong for this page.
10. **Conferencing:** `conferenceType: 'none' | 'google_meet' | 'zoom'` (Google Meet requires Workspace OAuth connection).

After the user creates the page, come back to Flow A and embed it.

## Brand-aware embed

When the embedded `booking` block is rendered, it pulls colors from the booking page's `styling` row. **The block doesn't override** — what you see in the booking page's portal settings is what renders.

That means: if you want the booking widget on the page to match the brand profile, make sure the **booking page** has the brand profile applied. Check via `booking_pages_get` and surface a warning if `styling.primaryColor` is unset or off-brand.

## Output

Return to the user:
- Booking page id + slug
- Public URL: `<site-domain>/book/<slug>`
- Portal edit URL: `/portal/tools/booking/<id>`
- The block JSON ready to splice into a page / deck / email
- A reminder about confirmation-email branding gap (if relevant)
- A reminder about the missing MCP create/update gap (if Flow B was followed)

## Failure modes

- **`booking_pages_list` returns empty + Flow B requested** → walk user through portal-side setup. Don't fabricate a `booking_pages_create` call.
- **Booking page is `active=false`** → embedding still works but `/book/<slug>` returns 404. Approve the page (via the future approval flow once create/update is wired) or flip in the portal.
- **`assignedMembers` is empty + `assignmentMode='round_robin'`** → no one is on call. Public booking will surface "no availability." Flag.
- **Conferencing set to `google_meet` but no Workspace credentials** → bookings will be created without a calendar invite. The user must connect Workspace via `/portal/integrations/google`.

## Self-improvement

After every run where the user accepts or rejects the embed, invoke `sd-learn` with the artifact + feedback so the next run inherits the preference. Examples of rules that accumulate here:

- Always use the wide logo on the embed header, never the icon.
- For client X, the booking embed should be inside a `cta` block with eyebrow + heading.
- Confirmation-email branding gap should be surfaced every time until the server-side fix lands.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-create-booking-page" ~/.claude/skills/sd-create-booking-page
```
