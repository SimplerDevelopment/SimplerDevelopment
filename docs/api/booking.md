# Booking & Gift Certificates API (Public)

These are unauthenticated endpoints your booking widget or front-end calls directly. They let you display booking pages, enumerate available time slots, present add-ons, validate discounts and gift certificates, collect waiver signatures, create bookings (including Stripe payment intents for paid sessions), pay quotes, cancel appointments, and purchase or validate gift certificates.

**Base URL:** All paths are relative to your site's origin, e.g. `https://yoursite.simplerdevelopment.com`.

**Authentication:** These endpoints are public — no API key or session token is required. See [authentication.md](./authentication.md) for endpoints that do require credentials.

---

## Booking Pages

### `GET /api/public/booking/[slug]`

Fetch the full configuration for a single active booking page, including branding, availability settings, custom questions, and optional staff list.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The booking page slug |

- **Response:**

```json
{
  "success": true,
  "data": {
    "id": 42,
    "title": "30-Minute Consultation",
    "slug": "consultation",
    "description": "A focused intro call.",
    "duration": 30,
    "timezone": "America/New_York",
    "availability": [...],
    "questions": [...],
    "color": "#2563eb",
    "maxAdvanceDays": 60,
    "minNoticeMins": 60,
    "price": 5000,
    "priceLabel": "$50",
    "maxGuests": null,
    "enableAddOns": true,
    "enableGiftCertificates": true,
    "enableDiscountCodes": true,
    "enableWaivers": false,
    "requireWaiverBeforeBooking": false,
    "waiverContent": null,
    "checkinEnabled": false,
    "allowStaffSelection": false,
    "bookingType": "one_on_one",
    "groupCapacity": null,
    "branding": {
      "primaryColor": "#2563eb",
      "secondaryColor": "#1e40af",
      "accentColor": "#f59e0b",
      "backgroundColor": "#ffffff",
      "textColor": "#111827",
      "headingFont": "",
      "bodyFont": "",
      "logoUrl": "https://cdn.example.com/logo.png",
      "borderRadius": "8px",
      "buttonStyle": {
        "primaryBg": "#2563eb",
        "primaryText": "#ffffff",
        "borderRadius": "6px"
      }
    },
    "cssVars": { "--color-primary": "#2563eb" },
    "hideTitle": false,
    "staffMembers": []
  }
}
```

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 404 | `Booking page not found` |

- **Notes:** `staffMembers` is only populated when `allowStaffSelection` is `true`. `assignmentMode` and `assignedUserId` are never exposed publicly. `price` is in cents.

```bash
curl https://yoursite.simplerdevelopment.com/api/public/booking/consultation
```

---

### `GET /api/public/booking/[slug]/slots`

List available time slots for a given date. Returns an empty array for past dates, blocked dates, or dates beyond `maxAdvanceDays`.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The booking page slug |

- **Query params:**

  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `date` | string | Yes | Date in `YYYY-MM-DD` format |
  | `staffId` | string | No | Numeric user ID; filters slots to that staff member's availability and existing bookings |

- **Response:**

```json
{
  "success": true,
  "data": [
    { "time": "2026-06-10T14:00:00.000Z", "remainingCapacity": null },
    { "time": "2026-06-10T14:30:00.000Z", "remainingCapacity": null }
  ]
}
```

`remainingCapacity` is `null` for 1:1 bookings and a positive integer for group/capacity bookings.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `Valid date parameter required (YYYY-MM-DD)` |
  | 404 | `Booking page not found` |

```bash
curl "https://yoursite.simplerdevelopment.com/api/public/booking/consultation/slots?date=2026-06-10"
```

---

### `GET /api/public/booking/[slug]/add-ons`

List active add-ons for a booking page. Returns an empty array when add-ons are not enabled. Product-linked add-ons use live product/variant pricing.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The booking page slug |

- **Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "source": "custom",
      "name": "Equipment Rental",
      "description": "Includes all gear.",
      "price": 1500,
      "image": "https://cdn.example.com/gear.jpg",
      "variantName": null,
      "maxQuantity": 3
    },
    {
      "id": 8,
      "source": "product",
      "name": "Starter Kit",
      "description": "Everything you need to begin.",
      "price": 2999,
      "image": "https://cdn.example.com/kit.jpg",
      "variantName": "Small",
      "maxQuantity": 1
    }
  ]
}
```

`price` is in cents. Product-linked add-ons whose product is inactive or deleted are excluded automatically.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 404 | `Booking page not found` |
  | 500 | `Internal server error` |

```bash
curl https://yoursite.simplerdevelopment.com/api/public/booking/consultation/add-ons
```

---

### `POST /api/public/booking/[slug]/validate-discount`

Validate a discount code against a booking page and optionally calculate the savings for a given subtotal.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The booking page slug |

- **Request body:**

```json
{
  "code": "SAVE20",
  "subtotal": 5000
}
```

`subtotal` (cents) is optional. When provided, `discountAmount` is calculated and returned.

- **Response:**

```json
{
  "success": true,
  "data": {
    "code": "SAVE20",
    "description": "20% off any booking",
    "discountType": "percent",
    "amount": 2000,
    "minOrderAmount": null,
    "discountAmount": 1000
  }
}
```

`amount` for `percent` type is in basis points (2000 = 20%). For `fixed_amount` it is in cents.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `Discount code is required` |
  | 400 | `Discount codes are not enabled` |
  | 400 | `Invalid discount code` |
  | 400 | `Discount code is not yet active` |
  | 400 | `Discount code has expired` |
  | 400 | `Discount code has been fully redeemed` |
  | 400 | `Minimum order amount of {n} not met` |
  | 400 | `No website configured for discount codes` |
  | 404 | `Booking page not found` |
  | 500 | `Internal server error` |

```bash
curl -X POST https://yoursite.simplerdevelopment.com/api/public/booking/consultation/validate-discount \
  -H "Content-Type: application/json" \
  -d '{"code":"SAVE20","subtotal":5000}'
```

---

### `POST /api/public/booking/[slug]/waiver`

Submit a signed waiver for an existing booking. Only works when `enableWaivers` is `true` on the booking page.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The booking page slug |

- **Request body:**

```json
{
  "bookingId": 123,
  "signerName": "Jane Smith",
  "signerEmail": "jane@example.com",
  "signatureData": "data:image/png;base64,iVBORw0KGgoAAAA..."
}
```

All four fields are required.

- **Response (201 Created):**

```json
{
  "success": true,
  "data": { "id": 55 }
}
```

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `Waivers are not enabled` |
  | 400 | `bookingId, signerName, signerEmail, and signatureData are required` |
  | 404 | `Booking page not found` |
  | 404 | `Booking not found` |
  | 500 | `Internal server error` |

```bash
curl -X POST https://yoursite.simplerdevelopment.com/api/public/booking/consultation/waiver \
  -H "Content-Type: application/json" \
  -d '{"bookingId":123,"signerName":"Jane Smith","signerEmail":"jane@example.com","signatureData":"data:image/png;base64,..."}'
```

---

### `POST /api/public/booking/[slug]/book`

Create a booking. For paid sessions, returns a Stripe `clientSecret` for payment confirmation. For free sessions (including fully-covered discount/gift-cert bookings), confirms immediately and sends email confirmations.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The booking page slug |

- **Request body:**

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+15555550100",
  "startTime": "2026-06-10T14:00:00.000Z",
  "timezone": "America/New_York",
  "answers": { "How did you hear about us?": "Google" },
  "groupSize": 1,
  "addOns": [
    { "addOnId": 7, "quantity": 1 }
  ],
  "discountCode": "SAVE20",
  "giftCertificateCode": "CERT-AB12CD",
  "staffId": 5,
  "seats": 2,
  "attendees": [
    { "name": "Jane Smith", "email": "jane@example.com", "phone": "+15555550100", "notes": "" },
    { "name": "Bob Jones", "email": "bob@example.com", "phone": null, "notes": "Vegetarian" }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Primary guest name |
| `email` | string | Yes | Primary guest email |
| `phone` | string | No | Primary guest phone |
| `startTime` | ISO 8601 string | Yes | Slot start time as returned by `/slots` |
| `timezone` | string | No | Falls back to booking page timezone |
| `answers` | object | No | Custom question answers |
| `groupSize` | number | No | Guest count for capacity-mode pages (default 1) |
| `addOns` | array | No | Array of `{ addOnId, quantity }` |
| `discountCode` | string | No | Requires `enableDiscountCodes` |
| `giftCertificateCode` | string | No | Requires `enableGiftCertificates` |
| `staffId` | number | No | Requires `allowStaffSelection` on the page |
| `seats` | number | No | Number of seats for group/class bookings |
| `attendees` | array | No | Per-seat detail for group bookings; each needs `name` and `email` |

- **Response — free booking:**

```json
{
  "success": true,
  "data": {
    "id": 123,
    "guestName": "Jane Smith",
    "guestEmail": "jane@example.com",
    "startTime": "2026-06-10T14:00:00.000Z",
    "endTime": "2026-06-10T14:30:00.000Z",
    "timezone": "America/New_York",
    "status": "confirmed",
    "paymentStatus": "free",
    "meetingLink": null,
    "checkinCode": null
  }
}
```

- **Response — paid booking (requires Stripe payment):**

```json
{
  "success": true,
  "data": {
    "id": 123,
    "clientSecret": "pi_3Xxxxxxx_secret_Xxxxxxxx",
    "total": 5000,
    "paymentStatus": "pending"
  }
}
```

Use the `clientSecret` with Stripe.js `stripe.confirmPayment()` to complete the transaction. `total` is in cents.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `Name is required` |
  | 400 | `Email is required` |
  | 400 | `Start time is required` |
  | 400 | `Invalid start time` |
  | 400 | `This date is too far in advance` |
  | 400 | `Number of attendees must match seat count` |
  | 400 | `Each attendee needs a name and email` |
  | 404 | `Booking page not found` |
  | 409 | `This time slot is no longer available` |
  | 409 | `Only {n} seats remaining for this slot` |
  | 409 | `Only {n} spots remaining` |

```bash
curl -X POST https://yoursite.simplerdevelopment.com/api/public/booking/consultation/book \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "startTime": "2026-06-10T14:00:00.000Z",
    "timezone": "America/New_York"
  }'
```

---

## Cancellation

### `GET /api/public/booking/cancel`

Look up a booking by cancel token. Use this to display a confirmation screen before the customer confirms cancellation.

- **Auth:** Public
- **Query params:**

  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `token` | string | Yes | The `cancelToken` included in the booking confirmation email |

- **Response:**

```json
{
  "success": true,
  "data": {
    "id": 123,
    "guestName": "Jane Smith",
    "startTime": "2026-06-10T14:00:00.000Z",
    "endTime": "2026-06-10T14:30:00.000Z",
    "timezone": "America/New_York",
    "status": "confirmed",
    "pageTitle": "30-Minute Consultation"
  }
}
```

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `Token is required` |
  | 404 | `Booking not found` |

```bash
curl "https://yoursite.simplerdevelopment.com/api/public/booking/cancel?token=uuid-here"
```

---

### `POST /api/public/booking/cancel`

Cancel a booking. Sends cancellation emails to the guest and host, and removes associated Google Calendar events or Zoom meetings.

- **Auth:** Public
- **Request body:**

```json
{
  "token": "3f8a1bc2-9d44-4f2a-8e1d-abc123456789"
}
```

- **Response:**

```json
{
  "success": true,
  "data": { "message": "Booking cancelled successfully" }
}
```

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `Cancel token is required` |
  | 400 | `Cannot cancel a past booking` |
  | 404 | `Booking not found` |
  | 409 | `This booking has already been cancelled` |

```bash
curl -X POST https://yoursite.simplerdevelopment.com/api/public/booking/cancel \
  -H "Content-Type: application/json" \
  -d '{"token":"3f8a1bc2-9d44-4f2a-8e1d-abc123456789"}'
```

---

## Discovery — List Booking Pages

### `GET /api/public/booking/by-domain/[domain]`

List all active booking pages for a site resolved by domain or subdomain. Useful for building a booking menu on a custom domain.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `domain` | string | Full custom domain (e.g. `acme.com`), subdomain (e.g. `acme.simplerdevelopment.com`), or bare subdomain (e.g. `acme`) |

- **Response:**

```json
{
  "data": [
    {
      "id": 42,
      "title": "30-Minute Consultation",
      "slug": "consultation",
      "description": "A focused intro call.",
      "duration": 30,
      "price": 5000,
      "priceLabel": "$50",
      "color": "#2563eb",
      "maxGuests": null,
      "thumbnail": "https://cdn.example.com/thumb.jpg"
    }
  ]
}
```

Results are sorted by `price` ascending. Returns `{ "data": [] }` (no `success` key) when the domain is not found.

- **Errors:** No error body; unknown domain returns `{ "data": [] }`.

```bash
curl https://yoursite.simplerdevelopment.com/api/public/booking/by-domain/acme.com
```

---

### `GET /api/public/booking/by-site/[siteId]`

List all active booking pages for a site resolved by numeric site ID.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `siteId` | string | Numeric website ID |

- **Response:** Same shape as `/by-domain/[domain]`.

- **Errors:**

  | Status | Body |
  |--------|------|
  | 400 | `{ "error": "Invalid site ID" }` |

  Note: the 400 error body uses an `error` key (not `success`/`message`) — this differs from the standard envelope used by other endpoints.

```bash
curl https://yoursite.simplerdevelopment.com/api/public/booking/by-site/17
```

---

## Quotes

### `GET /api/public/booking/quote/[slug]`

Fetch a booking quote sent to a customer. Returns the quote detail including line items, price, and status.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The quote slug (from the quote link) |

- **Response:**

```json
{
  "success": true,
  "data": {
    "id": 9,
    "slug": "q-abc123",
    "title": "Photography Session",
    "description": "2-hour portrait session.",
    "price": 35000,
    "customerName": "Jane Smith",
    "lineItems": [...],
    "startTime": "2026-07-01T13:00:00.000Z",
    "endTime": "2026-07-01T15:00:00.000Z",
    "status": "pending",
    "expiresAt": "2026-06-20T00:00:00.000Z"
  }
}
```

When `status` is `paid`, the response includes `"alreadyPaid": true`. `price` is in cents.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 404 | `Quote not found` |
  | 410 | `This quote has expired` |

Cancelled quotes are excluded entirely (no match → 404).

```bash
curl https://yoursite.simplerdevelopment.com/api/public/booking/quote/q-abc123
```

---

### `POST /api/public/booking/quote/[slug]/pay`

Create a Stripe PaymentIntent to pay a pending quote. Uses Stripe Connect if the client has a connected account configured.

- **Auth:** Public
- **Path params:**

  | Name | Type | Description |
  |------|------|-------------|
  | `slug` | string | The quote slug |

- **Request body:** Empty — no body fields are read.

- **Response:**

```json
{
  "success": true,
  "data": {
    "clientSecret": "pi_3Xxxxxxx_secret_Xxxxxxxx",
    "amount": 35000
  }
}
```

Use `clientSecret` with Stripe.js to confirm payment. `amount` is in cents.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 404 | `Quote not found or already paid` |
  | 410 | `This quote has expired` |
  | 500 | `Internal server error` |

```bash
curl -X POST https://yoursite.simplerdevelopment.com/api/public/booking/quote/q-abc123/pay
```

---

## Gift Certificates

### `POST /api/public/gift-certificates/purchase`

Purchase a gift certificate. Creates a record in `pending_payment` status and returns a Stripe `clientSecret` to complete payment. The certificate becomes `active` automatically once Stripe confirms the payment via webhook.

- **Auth:** Public
- **Request body:**

```json
{
  "websiteId": 17,
  "amount": 10000,
  "purchaserName": "Alice Johnson",
  "purchaserEmail": "alice@example.com",
  "recipientName": "Bob Smith",
  "recipientEmail": "bob@example.com",
  "personalMessage": "Happy birthday!",
  "redeemableAt": "both"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `websiteId` | number | Yes | Numeric site ID |
| `amount` | number | Yes | Amount in cents; minimum 100 ($1.00) |
| `purchaserName` | string | Yes | |
| `purchaserEmail` | string | Yes | |
| `recipientName` | string | No | |
| `recipientEmail` | string | No | |
| `personalMessage` | string | No | |
| `redeemableAt` | string | No | `"booking"`, `"store"`, or `"both"` (default `"both"`) |

- **Response:**

```json
{
  "success": true,
  "data": {
    "id": 31,
    "code": "CERT-AB12CD",
    "amount": 10000,
    "clientSecret": "pi_3Xxxxxxx_secret_Xxxxxxxx"
  }
}
```

`amount` is in cents. Use `clientSecret` with Stripe.js to confirm payment.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `websiteId is required` |
  | 400 | `Minimum amount is $1.00` |
  | 400 | `Purchaser name and email are required` |
  | 404 | `Website not found` |
  | 500 | `Internal server error` |

```bash
curl -X POST https://yoursite.simplerdevelopment.com/api/public/gift-certificates/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "websiteId": 17,
    "amount": 10000,
    "purchaserName": "Alice Johnson",
    "purchaserEmail": "alice@example.com",
    "redeemableAt": "booking"
  }'
```

---

### `POST /api/public/gift-certificates/validate`

Check whether a gift certificate code is active, applicable to a given context, and has remaining balance.

- **Auth:** Public
- **Request body:**

```json
{
  "code": "CERT-AB12CD",
  "context": "booking"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `code` | string | Yes | Certificate code (case-insensitive) |
| `context` | string | No | `"booking"` or `"store"` (default `"booking"`) |

- **Response:**

```json
{
  "success": true,
  "data": {
    "code": "CERT-AB12CD",
    "initialAmount": 10000,
    "remainingAmount": 7500
  }
}
```

All amounts are in cents.

- **Errors:**

  | Status | Message |
  |--------|---------|
  | 400 | `Gift certificate code is required` |
  | 400 | `Invalid or inactive gift certificate` |
  | 400 | `This gift certificate has expired` |
  | 400 | `This gift certificate has been fully redeemed` |
  | 500 | `Internal server error` |

```bash
curl -X POST https://yoursite.simplerdevelopment.com/api/public/gift-certificates/validate \
  -H "Content-Type: application/json" \
  -d '{"code":"CERT-AB12CD","context":"booking"}'
```
