---
name: sd-create-booking-page
description: List, inspect, and embed booking pages from the SimplerDevelopment portal. Embeds an existing booking page into a CMS page, deck, or email via the `booking` block (or `booking-menu` for all-services). Returns the public `/book/<slug>` URL. NOTE — booking-page CREATE/UPDATE via MCP is not yet wired (the portal REST API and the UI are the canonical authoring path). This skill helps you DISCOVER existing booking pages and EMBED them; for net-new booking-page authoring it walks the user through portal-side setup. Use when the user says 'add a booking widget to this page', 'embed the discovery call booking', 'link the demo booking page', 'show our consulting hours', 'add a calendar to the email'.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-create-booking-page

This skill is split into two flows:

- **Flow A: embed an existing booking page** — list, pick, embed.
- **Flow B: author a new booking page from scratch via `booking_pages_create`** — fully wired in MCP. The new page is created with `active=false` and a fresh approval URL is minted; approving the URL flips `active=true` so `/book/<slug>` accepts reservations. Iterate via `booking_pages_update`.

Both flows return the public URL, the portal edit URL, and the approval URL. The skill picks Flow A by default if `booking_pages_list` already has a matching page; otherwise it pivots to Flow B.

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

## Flow B — author a new booking page via MCP

Call `mcp__simplerdevelopment-postcaptain__booking_pages_create` with the minimum:

```json
{
  "title": "Discovery call",
  "description": "30-minute intake to scope your project.",
  "duration": 30,
  "price": 0,
  "priceLabel": "Free",
  "timezone": "America/New_York",
  "brandingProfileId": <from .sd/config.json>,
  "questions": [
    { "id": "q-company", "label": "Company", "type": "text", "required": true },
    { "id": "q-context", "label": "What hurts about your current stack?", "type": "textarea", "required": false }
  ],
  "conferenceType": "google_meet",
  "active": false
}
```

The response includes `{ id, slug, ..., approval: { url, ... } }`. Hand the approval URL to the user; approving flips `active=true` so the public `/book/<slug>` route starts accepting reservations.

For more complex needs, the tool accepts the full field set: `availability` (day-of-week + time-range matrix; defaults to Mon–Fri 09–17), `assignmentMode` (`fixed`/`round_robin`/`weighted_round_robin`) + `assignedMembers`, `bookingType` (`individual`/`group`/`multi-attendee`) + `groupCapacity`, add-ons / discount / waiver / gift-cert toggles, `styling` overrides, etc. Default Mon–Fri 09–17 in the chosen timezone is set server-side if `availability` is omitted.

**For client-specific waivers:** pass `enableWaivers: true`, `waiverContent: "<your text>"`, `requireWaiverBeforeBooking: true`.

**For Google Meet conferencing:** the tenant needs a connected Google Workspace OAuth (`/portal/integrations/google`). Without that, `conferenceType: 'google_meet'` will still save but bookings won't get calendar invites.

Iterate via `booking_pages_update` (same field shape, `id` required). Each update mints a fresh approval URL.

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
