# MCP Tools — Bookings, Integrations, Hosting, Billing & AI

These tools cover the operational and platform side of your SimplerDevelopment workspace: creating and managing bookable appointment pages, connecting third-party services, inspecting hosted sites and domains, working with invoices and AI credit balances, browsing AI conversation history, and reviewing or applying staged mutations through the approvals queue.

For authentication setup and how to obtain an MCP access token, see [./overview.md](./overview.md).

---

## Bookings

Tools in this section require the `bookings:read` or `bookings:write` scope.

Booking pages start `active: false` by default. The public `/book/<slug>` URL returns 404 until you either approve the returned link (which flips `active` to `true` automatically) or pass `active: true` at creation time.

---

### `booking_pages_create`

Create a new bookable service or appointment type.

- **Auth:** `bookings:write`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Display name (max 100 chars). |
| `slug` | string | No | URL-safe identifier. Auto-derived from `title` if omitted; a date suffix is appended on collision. |
| `description` | string \| null | No | Shown on the public booking page. |
| `websiteId` | number | No | Associate with a specific client website. |
| `brandingProfileId` | number | No | Branding profile to apply. |
| `price` | number | No | Price in cents. `0` = free. Default `0`. |
| `priceLabel` | string | No | Free-text price display, e.g. `"Starts at $200"`. |
| `duration` | number | No | Session length in minutes. Default `30`. |
| `bufferBefore` | number | No | Buffer minutes before the slot. Default `0`. |
| `bufferAfter` | number | No | Buffer minutes after the slot. Default `15`. |
| `maxAdvanceDays` | number | No | How far ahead guests can book. Default `60`. |
| `minNoticeMins` | number | No | Minimum notice required. Default `60`. |
| `timezone` | string | No | IANA timezone. Default `America/New_York`. |
| `availability` | object | No | Day-of-week + time-range schedule. Defaults to Mon–Fri 09–17 in `timezone`. |
| `bookingType` | `"individual"` \| `"group"` \| `"multi-attendee"` | No | Default `"individual"`. |
| `groupCapacity` | number \| null | No | Max group size when `bookingType` is `"group"`. |
| `maxGuests` | number \| null | No | Additional guests a booker may bring. |
| `assignmentMode` | `"fixed"` \| `"round_robin"` \| `"weighted_round_robin"` | No | Default `"fixed"`. |
| `assignedMembers` | number[] | No | User IDs in the assignment pool. |
| `roundRobinPool` | object | No | Weighted round-robin configuration. |
| `allowStaffSelection` | boolean | No | Let bookers pick a team member. Default `false`. |
| `conferenceType` | `"none"` \| `"google_meet"` \| `"zoom"` | No | Default `"none"`. |
| `googleCalendarSync` | boolean | No | Sync confirmed bookings to Google Calendar. Default `false`. |
| `questions` | object[] | No | Custom intake questions: `{ id, label, type: "text"\|"textarea"\|"select", required, options? }`. |
| `enableAddOns` | boolean | No | Default `false`. |
| `enableGiftCertificates` | boolean | No | Default `false`. |
| `enableDiscountCodes` | boolean | No | Default `false`. |
| `enableWaivers` | boolean | No | Default `false`. |
| `waiverContent` | string \| null | No | Waiver text shown before booking. |
| `requireWaiverBeforeBooking` | boolean | No | Default `false`. |
| `checkinEnabled` | boolean | No | Enable QR check-in. Default `false`. |
| `color` | string | No | Accent hex color. Default `#2563eb`. |
| `styling` | object | No | `BookingPageStyling` — `{ primaryColor?, backgroundColor?, textColor?, headingFont?, bodyFont?, borderRadius?, buttonPrimary*?, hideTitle?, hideLogo? }`. |
| `thumbnail` | string \| null | No | Image URL for the listing card. |
| `active` | boolean | No | Make public immediately. Default `false`. |

**Response:**

```json
{
  "id": 42,
  "clientId": 7,
  "title": "30-min Consultation",
  "slug": "30-min-consultation",
  "description": null,
  "price": 0,
  "duration": 30,
  "timezone": "America/New_York",
  "active": false,
  "bookingType": "individual",
  "assignmentMode": "fixed",
  "conferenceType": "none",
  "createdAt": "2026-06-04T12:00:00.000Z",
  "approval": {
    "url": "https://app.simplerdevelopment.com/approve/tok_abc123",
    "expiresAt": "2026-06-11T12:00:00.000Z"
  }
}
```

**Errors:**

| Condition | Response |
|---|---|
| Missing `bookings:write` scope | `Permission denied: this API key lacks the "bookings:write" scope.` |

**Example:**

```json
{
  "tool": "booking_pages_create",
  "arguments": {
    "title": "Discovery Call",
    "duration": 30,
    "price": 0,
    "timezone": "America/Los_Angeles"
  }
}
```

---

### `booking_pages_update`

Patch any combination of fields on an existing booking page. Mints a fresh approval URL on every call. The previous approval URL remains in whatever state it was.

- **Auth:** `bookings:write`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Booking page ID. |
| *(all other fields from `booking_pages_create`)* | — | No | Any subset of create fields. |

**Response:** Same shape as `booking_pages_create` — the updated row plus an `approval` envelope.

**Errors:**

| Condition | Response |
|---|---|
| Missing `bookings:write` scope | Permission denied message. |
| ID not found for client | `{ "error": "Booking page not found" }` |

**Example:**

```json
{
  "tool": "booking_pages_update",
  "arguments": {
    "id": 42,
    "active": true,
    "price": 15000
  }
}
```

---

### `booking_pages_list`

List bookable services for the client.

- **Auth:** `bookings:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `activeOnly` | boolean | No | When `true` (default), only return active pages. |

**Response:**

```json
[
  {
    "id": 42,
    "title": "30-min Consultation",
    "slug": "30-min-consultation",
    "description": null,
    "price": 0,
    "duration": 30,
    "timezone": "America/New_York",
    "maxGuests": null,
    "active": true,
    "websiteId": 3
  }
]
```

---

### `booking_pages_get`

Fetch the full configuration of a single booking page, including availability windows, custom questions, and feature toggles.

- **Auth:** `bookings:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Booking page ID. |

**Response:** Full `bookingPages` row.

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Booking page not found" }` |

---

### `bookings_list`

List scheduled appointments. Use this to answer questions like "what's on my calendar this week."

- **Auth:** `bookings:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `bookingPageId` | number | No | Filter to a specific service. |
| `status` | `"confirmed"` \| `"cancelled"` \| `"completed"` \| `"no_show"` | No | Filter by status. |
| `startAfter` | string | No | ISO datetime — only return bookings with `startTime` at or after this value. |
| `endBefore` | string | No | ISO datetime — only return bookings with `startTime` at or before this value. |
| `limit` | number | No | 1–500. Default `100`. |

**Response:**

```json
[
  {
    "id": 101,
    "clientId": 7,
    "bookingPageId": 42,
    "guestName": "Jane Smith",
    "guestEmail": "jane@example.com",
    "startTime": "2026-06-10T14:00:00.000Z",
    "endTime": "2026-06-10T14:30:00.000Z",
    "status": "confirmed",
    "notes": null,
    "assignedTo": null,
    "cancelledAt": null,
    "createdAt": "2026-06-04T09:00:00.000Z"
  }
]
```

---

### `bookings_get`

Fetch a single booking by ID.

- **Auth:** `bookings:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Booking ID. |

**Response:** Full `bookings` row.

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Booking not found" }` |

---

### `bookings_cancel`

Cancel a booking. Stamps `status = "cancelled"` and `cancelledAt`. Does **not** auto-refund payment or remove Google Calendar events.

- **Auth:** `bookings:write`
- **Service gate:** `booking` service must be active for this client.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Booking ID. |
| `reason` | string | No | Internal note appended to `booking.notes`. |

**Response:** Updated booking row.

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Booking not found" }` |
| Already cancelled | `{ "error": "Booking already cancelled" }` |
| Service not active | Service denied message. |

---

### `bookings_update`

Edit booking fields — times, status, notes, assignee, or guest info. Time changes do **not** automatically push to Google Calendar or notify the guest.

- **Auth:** `bookings:write`
- **Service gate:** `booking` service must be active for this client.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Booking ID. |
| `startTime` | string | No | ISO datetime. |
| `endTime` | string | No | ISO datetime. |
| `status` | `"confirmed"` \| `"cancelled"` \| `"completed"` \| `"no_show"` | No | |
| `notes` | string \| null | No | |
| `assignedTo` | number \| null | No | User ID. |
| `guestName` | string | No | Min 1 char. |
| `guestEmail` | string | No | Valid email. |
| `guestPhone` | string \| null | No | |

**Response:** Updated booking row.

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Booking not found" }` |
| Service not active | Service denied message. |

---

### `gift_certificates_list`

List gift certificates, optionally filtered by website or redemption status.

- **Auth:** `bookings:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `websiteId` | number | No | Filter to a specific site. |
| `status` | `"pending_payment"` \| `"active"` \| `"fully_redeemed"` \| `"expired"` \| `"cancelled"` | No | |
| `limit` | number | No | 1–200. Default `50`. |

**Response:** Array of gift certificate rows, newest first.

---

### `gift_certificates_issue`

Manually issue a gift certificate that bypasses Stripe payment. The certificate starts as `active` and is immediately redeemable. Use with care.

- **Auth:** `bookings:write`
- **Service gate:** `booking` service must be active.

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number | Yes | Value in cents (minimum 1). |
| `purchaserName` | string | Yes | |
| `purchaserEmail` | string | Yes | Valid email. |
| `recipientName` | string | No | |
| `recipientEmail` | string | No | Valid email. |
| `personalMessage` | string | No | |
| `websiteId` | number | No | Associate with a specific site. |

**Response:**

```json
{
  "id": 15,
  "clientId": 7,
  "code": "A1B2C3D4",
  "initialAmount": 10000,
  "remainingAmount": 10000,
  "status": "active",
  "purchaserName": "Dan Coyle",
  "purchaserEmail": "dan@example.com",
  "recipientName": null,
  "recipientEmail": null,
  "createdAt": "2026-06-04T12:00:00.000Z"
}
```

---

## Integrations

Tools in this section require the `integrations:read` or `integrations:write` scope. Currently, Google Workspace is the only supported provider.

---

### `integrations_list`

List third-party integrations connected for your user under this client. Returns an array of providers so future integrations can slot in without breaking callers.

- **Auth:** `integrations:read`

**Input fields:** None.

**Response — no Workspace tenant:**

```json
{
  "tier": "standard",
  "integrations": []
}
```

**Response — Workspace tenant with active connection:**

```json
{
  "tier": "enterprise",
  "tenantStatus": "active",
  "integrations": [
    {
      "provider": "google",
      "connection": {
        "googleAccountEmail": "you@yourdomain.com",
        "scopes": ["https://www.googleapis.com/auth/calendar"],
        "expiresAt": "2026-06-05T12:00:00.000Z",
        "lastSyncAt": "2026-06-04T10:00:00.000Z",
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    }
  ]
}
```

---

### `integrations_revoke`

Disconnect a third-party integration for your user. Makes a best-effort revoke at the provider, then marks the local connection row as revoked. Idempotent: if there is no active connection, returns `alreadyDisconnected: true`.

- **Auth:** `integrations:write`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | `"google"` | Yes | Only `"google"` is supported today. |

**Response — success:**

```json
{
  "ok": true,
  "providerRevokeError": null
}
```

**Response — already disconnected:**

```json
{
  "ok": true,
  "alreadyDisconnected": true
}
```

**Errors:**

| Condition | Response |
|---|---|
| Workspace not provisioned for client | `{ "error": "workspace_not_provisioned" }` |
| Unsupported provider | `{ "error": "Unsupported provider: <value>" }` |

---

## Hosting

Tools in this section require the `hosting:read` scope. Provisioning new hosted sites is a Stripe-driven flow and is not exposed to MCP keys.

---

### `hosting_list`

List Railway-hosted application sites for the client. Returns name, custom domain, Railway domain, status, plan, and renewal date.

- **Auth:** `hosting:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `"provisioning"` \| `"active"` \| `"suspended"` \| `"cancelled"` | No | Filter by lifecycle status. |

**Response:**

```json
[
  {
    "id": 5,
    "name": "My App",
    "customDomain": "app.example.com",
    "railwayDomain": "myapp-prod.up.railway.app",
    "status": "active",
    "plan": "starter",
    "renewalDate": "2026-07-01T00:00:00.000Z",
    "createdAt": "2025-12-01T00:00:00.000Z"
  }
]
```

---

### `hosting_get`

Get full details for a single hosted site, including DNS instructions and operator notes.

- **Auth:** `hosting:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Hosted site ID. |

**Response:** Full `hostedSites` row.

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Hosted site not found" }` |

---

## Billing

Tools in this section require the `billing:read` scope.

---

### `invoices_list`

List invoices issued to this client. Useful for "what's outstanding" or "who owes me what" queries.

- **Auth:** `billing:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `"draft"` \| `"sent"` \| `"paid"` \| `"overdue"` \| `"cancelled"` | No | Filter by invoice status. |
| `limit` | number | No | 1–200. Default `50`. |

**Response:** Array of full invoice rows, newest first.

```json
[
  {
    "id": 88,
    "clientId": 7,
    "status": "sent",
    "totalAmount": 250000,
    "currency": "USD",
    "dueDate": "2026-06-30T00:00:00.000Z",
    "createdAt": "2026-06-01T00:00:00.000Z"
  }
]
```

---

### `invoices_get`

Fetch an invoice together with its line items.

- **Auth:** `billing:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Invoice ID. |

**Response:**

```json
{
  "invoice": {
    "id": 88,
    "clientId": 7,
    "status": "sent",
    "totalAmount": 250000,
    "currency": "USD"
  },
  "items": [
    {
      "id": 201,
      "invoiceId": 88,
      "description": "Website retainer — June 2026",
      "quantity": 1,
      "unitAmount": 250000,
      "totalAmount": 250000
    }
  ]
}
```

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Invoice not found" }` |

---

### `ai_credits_balance`

Return the current AI token balance, monthly grant amount, and pay-as-you-go status for this client.

- **Auth:** `billing:read`

**Input fields:** None.

**Response:**

```json
{
  "clientId": 7,
  "balance": 450000,
  "monthlyGrant": 500000,
  "payAsYouGo": false
}
```

> If no balance row exists yet, all numeric fields default to `0` and `payAsYouGo` to `false`.

---

### `ai_credits_ledger`

List recent AI credit ledger entries — grants, usage deductions, purchases, refunds, and expirations — with running balances.

- **Auth:** `billing:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `limit` | number | No | 1–200. Default `50`. |
| `type` | `"grant"` \| `"usage"` \| `"purchase"` \| `"refund"` \| `"expiry"` | No | Filter by entry type. |

**Response:** Array of ledger rows, newest first.

```json
[
  {
    "id": 301,
    "clientId": 7,
    "type": "usage",
    "amount": -1200,
    "balance": 448800,
    "description": "Brain query",
    "createdAt": "2026-06-04T11:30:00.000Z"
  }
]
```

---

## AI

Tools in this section require the `ai:read` scope. They surface the portal AI assistant's conversation history for auditing and analytics — they do not initiate new AI completions.

---

### `ai_conversations_list`

List AI chat conversations for this client.

- **Auth:** `ai:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `flagged` | boolean | No | When set, filter to flagged (`true`) or unflagged (`false`) conversations. |
| `limit` | number | No | 1–200. Default `50`. |

**Response:** Array of conversation rows, most recently updated first.

```json
[
  {
    "id": 55,
    "clientId": 7,
    "title": "Help drafting onboarding email",
    "flagged": false,
    "updatedAt": "2026-06-04T10:00:00.000Z",
    "createdAt": "2026-06-04T09:45:00.000Z"
  }
]
```

---

### `ai_conversations_get`

Fetch a conversation with its full message history. Useful for auditing what the in-app AI assistant has been doing.

- **Auth:** `ai:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Conversation ID. |

**Response:**

```json
{
  "conversation": {
    "id": 55,
    "clientId": 7,
    "title": "Help drafting onboarding email",
    "flagged": false
  },
  "messages": [
    {
      "id": 1001,
      "conversationId": 55,
      "role": "user",
      "content": "Draft a welcome email for new sign-ups.",
      "createdAt": "2026-06-04T09:45:10.000Z"
    },
    {
      "id": 1002,
      "conversationId": 55,
      "role": "assistant",
      "content": "Sure! Here's a draft...",
      "createdAt": "2026-06-04T09:45:15.000Z"
    }
  ]
}
```

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Conversation not found" }` |

---

## Approvals

The approvals surface lets staff-level keys review and apply (or reject) staged MCP writes before they hit the database. Most write tools that touch CMS content, decks, or proposals produce a pending change instead of mutating immediately. The `approvals:read` scope lets you inspect the queue; `approvals:manage` lets you approve or reject.

> A writer key with `require_cms_approval=true` can create pending changes but **cannot** approve them — enforced by scope separation.

---

### `approvals_list`

List staged MCP writes awaiting review.

- **Auth:** `approvals:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `"pending"` \| `"approved"` \| `"rejected"` \| `"applied"` \| `"failed"` | No | Filter by lifecycle status. |
| `entityType` | `"post"` \| `"pitch_deck"` \| `"pitch_deck_slides"` \| `"pitch_deck_slide_draft"` \| `"proposal"` \| `"email_campaign"` \| `"site"` \| `"site_nav"` \| `"block_template"` \| `"taxonomy"` \| `"post_taxonomy"` | No | Filter to a specific domain. |
| `limit` | number | No | 1–200. Default `50`. |

**Response:**

```json
[
  {
    "id": 9,
    "entityType": "post",
    "entityId": null,
    "operation": "create",
    "summary": "Create post \"June Product Update\"",
    "status": "pending",
    "keyId": 3,
    "userId": 12,
    "reviewerId": null,
    "reviewedAt": null,
    "appliedAt": null,
    "errorMessage": null,
    "createdAt": "2026-06-04T11:00:00.000Z"
  }
]
```

---

### `approvals_get`

Fetch full detail for a single pending change, including the staged payload and an original snapshot (for diffing).

- **Auth:** `approvals:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Pending change ID. |

**Response:** Full `mcpPendingChanges` row including `payload` and `snapshotBefore`.

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Pending change not found" }` |

---

### `approvals_approve`

Apply a pending MCP-staged write. Re-runs the original mutation with the stored payload and marks `status = "applied"`. If the apply fails, the row is marked `status = "failed"` with an `errorMessage`.

- **Auth:** `approvals:manage`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Pending change ID. |
| `note` | string | No | Optional review note recorded on the change. |

**Response:**

```json
{
  "change": {
    "id": 9,
    "status": "applied",
    "reviewerId": 1,
    "reviewedAt": "2026-06-04T12:00:00.000Z",
    "appliedAt": "2026-06-04T12:00:00.000Z",
    "reviewNote": "LGTM"
  },
  "result": {
    "id": 77,
    "title": "June Product Update",
    "slug": "june-product-update",
    "published": false
  }
}
```

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Pending change not found" }` |
| Status is not `"pending"` | `{ "error": "Cannot approve — status is <status>" }` |
| Apply logic throws | `{ "error": "Apply failed: <message>" }` and change marked `failed`. |

---

### `approvals_reject`

Mark a pending change as rejected. The staged mutation is **not** applied.

- **Auth:** `approvals:manage`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Pending change ID. |
| `note` | string | No | Reason shown to the original submitter. |

**Response:** Updated `mcpPendingChanges` row with `status = "rejected"`.

**Errors:**

| Condition | Response |
|---|---|
| Not found | `{ "error": "Pending change not found" }` |
| Status is not `"pending"` | `{ "error": "Cannot reject — status is <status>" }` |

---

## Live Chat

Tools in this section require the `chat:read` or `chat:write` scope. They manage the embeddable web chat widget: listing configured widgets, browsing conversation threads, reading message history, and replying as an agent. All data is scoped to your client account; individual conversation reads and writes verify ownership to prevent cross-tenant access.

---

### `chat_widgets_list`

List all chat widgets configured for this client.

- **Auth:** `chat:read`

**Input fields:** None.

**Response:**

```json
[
  {
    "id": 1,
    "siteId": 7,
    "enabled": true,
    "greetingMessage": "Hi! How can we help?",
    "position": "bottom-right",
    "primaryColor": "#2563eb",
    "createdAt": "2026-01-10T12:00:00.000Z"
  }
]
```

---

### `chat_conversations_list`

List chat conversations for this client, ordered by most recent message first.

- **Auth:** `chat:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `widgetId` | number | No | Filter to a specific widget. |
| `status` | `"open"` \| `"assigned"` \| `"closed"` | No | Filter by conversation status. |
| `limit` | number | No | 1–100. Default `25`. |

**Response:**

```json
[
  {
    "id": 55,
    "widgetId": 1,
    "visitorName": "Jane Smith",
    "visitorEmail": "jane@example.com",
    "status": "open",
    "lastMessageAt": "2026-06-04T14:22:00.000Z"
  }
]
```

---

### `chat_conversations_get`

Fetch a single chat conversation and its full message history. Verifies the conversation belongs to the authenticated client.

- **Auth:** `chat:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Conversation ID. |

**Response:**

```json
{
  "id": 55,
  "widgetId": 1,
  "visitorName": "Jane Smith",
  "visitorEmail": "jane@example.com",
  "status": "open",
  "messages": [
    {
      "id": 101,
      "authorKind": "visitor",
      "authorName": "Jane Smith",
      "body": "Hi, I need help with my order.",
      "occurredAt": "2026-06-04T14:20:00.000Z"
    },
    {
      "id": 102,
      "authorKind": "agent",
      "authorName": null,
      "body": "Happy to help! What's your order number?",
      "occurredAt": "2026-06-04T14:21:00.000Z"
    }
  ]
}
```

**Errors:**

| Condition | Response |
|---|---|
| Not found or wrong tenant | `{ "error": "Conversation not found or access denied." }` |

---

### `chat_conversation_reply`

Send an agent reply into a visitor chat conversation. Verifies ownership before inserting. Updates `lastMessageAt` on the conversation.

- **Auth:** `chat:write`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `conversationId` | number | Yes | ID of the conversation to reply to. |
| `body` | string | Yes | Message body text (min 1 character). |

**Response:**

```json
{ "messageId": 103 }
```

**Errors:**

| Condition | Response |
|---|---|
| Conversation not found or wrong tenant | `{ "error": "Conversation not found or access denied." }` |

---

### `chat_conversation_update`

Update the status and/or assigned user of a conversation. Closing a conversation stamps `closedAt`. Verifies ownership before updating.

- **Auth:** `chat:write`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Conversation ID. |
| `status` | `"open"` \| `"assigned"` \| `"closed"` | No | New status. Setting `"closed"` stamps `closedAt`. |
| `assignedUserId` | number \| null | No | User ID to assign, or `null` to unassign. |

**Response:**

```json
{ "id": 55, "status": "closed" }
```

**Errors:**

| Condition | Response |
|---|---|
| Conversation not found or wrong tenant | `{ "error": "Conversation not found or access denied." }` |

---

## Notifications

Tools in this section manage the in-app notification inbox for the **authenticated portal user**. Unlike most other tools, notifications are keyed by `userId` (not `clientId`) — every query is scoped to the user who owns the API key, not the broader client account.

---

### `notifications_list`

List in-app notifications for the authenticated user, ordered newest first.

- **Auth:** `notifications:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `unreadOnly` | boolean | No | When `true`, return only unread notifications. |
| `limit` | number | No | 1–100. Default `25`. |

**Response:**

```json
[
  {
    "id": 201,
    "kind": "booking_confirmed",
    "title": "New booking confirmed",
    "body": "Jane Smith booked a 30-min Consultation for June 10.",
    "readAt": null,
    "createdAt": "2026-06-04T09:00:00.000Z"
  }
]
```

---

### `notifications_mark_read`

Mark a single notification (by `id`) or all unread notifications as read. Exactly one of `id` or `all: true` must be provided.

- **Auth:** `notifications:write`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | No | ID of a specific notification to mark read. |
| `all` | boolean | No | When `true`, mark ALL unread notifications read. |

> Provide exactly one of `id` or `all: true`. Providing neither or both returns an error.

**Response:**

```json
{ "updated": 1 }
```

**Errors:**

| Condition | Response |
|---|---|
| Neither or both params provided | `{ "error": "Provide exactly one of id or all:true." }` |

---

## Usage

The usage tool surfaces your own MCP tool-call and token-spend history. It requires `billing:read` and is scoped to the authenticated client — you cannot view another tenant's usage.

---

### `usage_get`

Return this client's MCP tool-call and token-spend summary for the past N days. Covers total calls, errors, error rate, token consumption, and estimated cost.

- **Auth:** `billing:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `days` | number | No | Look-back window in days. 1–90. Default `7`. |

**Response:**

```json
{
  "days": 7,
  "totalCalls": 342,
  "totalErrors": 4,
  "errorRate": 0.0117,
  "totalTokens": 28400,
  "estCostUsd": 0.14
}
```

---

## Booking Analytics

### `booking_analytics_get`

Return booking performance aggregates for the client over a look-back window: paid booking count, cancelled count, revenue (broken down into base booking revenue and add-on revenue), total guests, and average booking value. All figures are client-scoped.

- **Auth:** `bookings:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `days` | number | No | Look-back window in days. 1–365. Default `30`. |

**Response:**

```json
{
  "days": 30,
  "bookingCount": 48,
  "cancelledCount": 3,
  "totalRevenue": 720000,
  "bookingRevenue": 660000,
  "addOnRevenue": 60000,
  "totalGuests": 52,
  "averageBookingValue": 15000,
  "totalInWindow": 51
}
```

> All monetary values are in **cents**. `bookingCount` counts only paid or free bookings; `totalInWindow` counts every booking (including cancelled) created in the window.
