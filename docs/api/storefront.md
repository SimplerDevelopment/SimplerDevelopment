# Storefront API

The Storefront API powers embedded storefronts and the custom product designer on SimplerDevelopment-hosted tenant websites. It handles the full transactional surface: browsing products, managing a shopping cart, running checkout via Stripe, looking up orders, and the complete custom-product-designer lifecycle (create, edit, AI-generated artwork, share, add to cart).

This API is distinct from the read-only [Commerce API](./commerce.md), which is keyed with a platform API key and is designed for third-party integrations. The Storefront API has no platform API key — it is called directly from the storefront JavaScript running on the customer's browser.

**Base URL:** `https://{your-storefront-domain}/api/storefront/{siteId}/...`

The `{siteId}` is the numeric ID of the tenant website (a `clientWebsites.id`). Every endpoint requires a valid, enabled store for that site or returns `404 Store not found`.

---

## Authentication model

The Storefront API has three auth tiers. Read this section before writing any client code.

**Public endpoints** — no credential required. These are the product catalog, categories, cart operations, checkout, guest order lookup, discount/gift-certificate validation, and shipping rate queries. Anyone who knows the `siteId` can call them.

**Customer session (Bearer token)** — required for account, order history, wishlist, and support endpoints. After a customer logs in or registers via `POST /auth`, the response includes a `token`. Pass it on every protected call:

```
Authorization: Bearer <token>
```

The token is opaque to the client; the server validates it against a server-side session store. There is no cookie-based auth for customers — the Bearer header is the only mechanism.

**Designer session (cookie)** — used by the custom product designer for anonymous visitors. When `POST /designs` creates a design for a visitor who has no customer token, the server mints an anonymous session ID and sets it in a first-party cookie (`sd_design_session`). Subsequent designer calls read that cookie automatically. Logged-in customers use their Bearer token instead of the cookie; the server accepts both.

---

## Cart state model

The cart is server-side and keyed by a client-generated `sessionId` string (a UUID you create in `localStorage` and pass on every cart call). There are no cart cookies. A cart is created automatically on the first `POST /cart` call for a new `sessionId`, and expires 7 days after last activity. Carts that go dormant can enter an `abandoned` state and be reactivated via `GET /cart/recover`.

---

## Products

### `GET /products`

Returns a paginated list of active products.

- **Auth:** Public

**Query params**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `category` | string | — | Filter by category slug |
| `search` | string | — | Keyword search against product name and short description |
| `sort` | string | `newest` | `newest`, `price_asc`, `price_desc`, or `featured` |
| `page` | integer | `1` | Page number (1-based) |
| `limit` | integer | `24` | Results per page (max 100) |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "name": "Classic Crew Tee",
      "slug": "classic-crew-tee",
      "shortDescription": "A comfortable everyday crew-neck tee.",
      "price": 2500,
      "compareAtPrice": 3200,
      "featured": true,
      "categoryId": 7,
      "createdAt": "2025-03-15T10:22:00.000Z",
      "image": "https://cdn.example.com/products/classic-crew-tee.jpg",
      "categoryName": "T-Shirts"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 24,
    "total": 58,
    "totalPages": 3
  }
}
```

> `price` and `compareAtPrice` are in cents. `image` is the first image by display order, or `null`. `categoryId` and `categoryName` are `null` for uncategorized products.

---

### `GET /products/{slug}`

Returns a full product record including images, options with values, active variants, bulk pricing rules, and category. The `{slug}` segment accepts a URL slug (storefront) or a numeric product ID (product designer editor).

- **Auth:** Public

**Response** — same shape as [Commerce API `GET /products/{slug}`](./commerce.md) including `images`, `options`, `variants`, `bulkPricing`, and `category`.

When called with a numeric product ID instead of a slug, the response includes `styles` (product designer styles with nested `sides`) instead of the standard commerce fields.

---

### `GET /products/{slug}/styles`

Returns designer styles and their printable sides for a product. Used by the custom product designer to build the canvas.

- **Auth:** Public

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "productId": 42,
      "name": "White",
      "active": true,
      "order": 0,
      "sides": [
        {
          "id": 11,
          "styleId": 5,
          "name": "Front",
          "slug": "front",
          "mockupImage": "https://cdn.example.com/mockups/white-front.png",
          "printAreaX": 120,
          "printAreaY": 80,
          "printAreaWidth": 280,
          "printAreaHeight": 320,
          "order": 0
        }
      ]
    }
  ]
}
```

---

## Categories

### `GET /categories`

Returns all active product categories ordered by `order` then `name`, with a live count of active products per category.

- **Auth:** Public

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "name": "T-Shirts",
      "slug": "t-shirts",
      "description": "All of our tee styles.",
      "image": "https://cdn.example.com/categories/t-shirts.jpg",
      "parentId": null,
      "order": 1,
      "productCount": 14
    }
  ]
}
```

> `parentId` is `null` for top-level categories; set to another category's `id` for subcategories.

---

## Cart

### `GET /cart`

Fetches the active cart for a session, with enriched line items (product name, slug, variant name, first product image, and any attached design thumbnail).

- **Auth:** Public

**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sessionId` | string | Yes | Client-generated cart session identifier |

**Response**

```json
{
  "success": true,
  "data": {
    "cartId": 301,
    "items": [
      {
        "id": 1501,
        "productId": 42,
        "variantId": 201,
        "designId": null,
        "quantity": 2,
        "unitPrice": 2500,
        "lineTotal": 5000,
        "productName": "Classic Crew Tee",
        "productSlug": "classic-crew-tee",
        "variantName": "Classic Crew Tee – S",
        "image": "https://cdn.example.com/products/classic-crew-tee.jpg",
        "design": null
      }
    ],
    "subtotal": 5000,
    "itemCount": 2
  }
}
```

> An empty or non-existent cart returns `{ success: true, data: { items: [], subtotal: 0 } }` — never a 404.

---

### `POST /cart`

Adds a product (optionally a specific variant, optionally with a saved custom design) to the cart. Creates the cart if one doesn't exist yet for the `sessionId`. Existing same-product + same-variant + same-design lines are merged by incrementing quantity; designed items are always added as new lines.

- **Auth:** Public

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | Cart session identifier |
| `productId` | integer | Yes | Product to add |
| `variantId` | integer | No | Specific variant; omit for base product |
| `quantity` | integer | No (default 1) | Units to add |
| `designId` | string (UUID) | No | Saved custom design to attach to this line |

**Response** — returns the inserted or updated cart item row.

---

### `PUT /cart`

Updates the quantity of an existing cart line. Setting `quantity` to `0` removes the item.

- **Auth:** Public

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cartItemId` | integer | Yes | ID of the cart item to update |
| `quantity` | integer | Yes | New quantity (0 = remove) |

---

### `DELETE /cart`

Clears all items from the active cart for a session.

- **Auth:** Public

**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sessionId` | string | Yes | Cart session identifier |

**Response**

```json
{ "success": true, "data": { "cleared": true } }
```

---

### `GET /cart/recover`

Reactivates an abandoned cart via a single-use recovery token (sent by cart-abandonment automations). Clears the token on use and redirects the browser to `{storeBaseUrl}/store/cart?recovered=1` with HTTP 302.

- **Auth:** Public

**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token` | string | Yes | Single-use recovery token from the abandonment email |

**Errors**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `token is required` | Missing token |
| `404` | `Invalid or expired recovery token` | Token not found, already used, or expired |

---

## Checkout

### `POST /checkout`

Validates the cart, calculates the order total (with optional shipping, discount code, gift certificate, and tax), creates a Stripe PaymentIntent, persists the order, and returns a `clientSecret` so the browser can confirm payment via Stripe.js without a second round-trip.

- **Auth:** Public

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | Cart session identifier |
| `customerEmail` | string | Yes | Purchaser email |
| `customerName` | string | Yes | Purchaser display name |
| `customerPhone` | string | No | Phone number |
| `shippingAddress` | object | No | Shipping address (free-form JSON) |
| `billingAddress` | object | No | Billing address (free-form JSON) |
| `shippingRateId` | integer | No | ID from `GET /shipping`; omit for digital or free shipping |
| `discountCode` | string | No | Discount code to apply |
| `giftCertificateCode` | string | No | Gift certificate code to redeem |
| `customerNote` | string | No | Note to attach to the order |

**Response**

```json
{
  "success": true,
  "data": {
    "clientSecret": "pi_3Abc123_secret_xyz",
    "publishableKey": "pk_live_...",
    "orderId": 9001,
    "orderNumber": "ORD-0042",
    "total": 7230,
    "currency": "USD"
  }
}
```

> The Stripe payment flow: (1) call `POST /checkout` to get `clientSecret` and `publishableKey`; (2) initialise `Stripe(publishableKey)` in the browser; (3) call `stripe.confirmPayment({ clientSecret, ... })` to capture funds. The order is created in `pending` status at step (1); a Stripe webhook (handled server-side) marks it `paid` after step (3) succeeds.

> All monetary amounts are in cents. `currency` is the store's configured ISO currency code.

**Errors**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `sessionId, customerEmail, and customerName are required` | Missing required fields |
| `400` | `Cart is empty` | The session has no active cart items |
| `400` | `Invalid discount code` | Code not found, expired, exceeded uses, or minimum not met |
| `400` | `Invalid shipping rate` | `shippingRateId` not valid for this store |
| `404` | `Cart not found` | No active cart for the `sessionId` |

---

## Orders

### `GET /orders/{orderNumber}`

Guest order lookup — returns a full order record without requiring a customer login, but requires the purchaser's email for verification.

- **Auth:** Public (email verification required)

**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `email` | string | Yes | Email address used when placing the order |

**Response**

```json
{
  "success": true,
  "data": {
    "orderNumber": "ORD-0042",
    "status": "shipped",
    "paymentStatus": "paid",
    "customerName": "Jane Smith",
    "customerEmail": "jane@example.com",
    "shippingAddress": { "line1": "123 Main St", "city": "Portland", "state": "OR", "postalCode": "97201", "country": "US" },
    "billingAddress": null,
    "subtotal": 5000,
    "shippingTotal": 995,
    "taxTotal": 385,
    "discountTotal": 0,
    "total": 6380,
    "shippingMethod": "USPS Priority Mail",
    "carrier": "USPS",
    "trackingNumber": "9400111899222..."
    "trackingUrl": "https://tools.usps.com/go/TrackConfirmAction?tLabels=...",
    "latestTrackingStatus": "In Transit",
    "latestTrackingEventAt": "2026-06-22T14:30:00.000Z",
    "paidAt": "2026-06-20T09:00:00.000Z",
    "shippedAt": "2026-06-21T12:00:00.000Z",
    "deliveredAt": null,
    "createdAt": "2026-06-20T08:55:00.000Z",
    "items": [ { "productName": "Classic Crew Tee", "variantName": "S", "sku": "CCT-001-S", "unitPrice": 2500, "quantity": 2, "total": 5000 } ],
    "trackingEvents": [
      { "processedAt": "2026-06-22T14:30:00.000Z", "eventType": "tracker.updated", "payload": { ... } }
    ]
  }
}
```

---

## Discounts

### `POST /discount/validate`

Validates a discount code and optionally calculates the discount amount for a given subtotal. Does not apply or consume the code — that happens at checkout.

- **Auth:** Public

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Discount code to validate |
| `subtotal` | integer | No | Cart subtotal in cents; enables `discountAmount` in the response |

**Response**

```json
{
  "success": true,
  "data": {
    "code": "SUMMER20",
    "description": "20% off your order",
    "discountType": "percent",
    "amount": 2000,
    "minOrderAmount": null,
    "discountAmount": 1000
  }
}
```

> `discountType` is `percent` (amount in basis points, e.g. `2000` = 20%), `fixed_amount` (amount in cents), or `free_shipping`. `discountAmount` is `null` when no `subtotal` is provided.

---

## Shipping

### `GET /shipping`

Returns available shipping rates for a destination. Combines manual rates configured in the portal with optional live carrier rates from EasyPost and/or Printful print-on-demand rates, depending on the store's configuration.

- **Auth:** Public

**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `country` | string | Yes | ISO 3166-1 alpha-2 country code (e.g. `US`) |
| `state` | string | No | State / province code |
| `postalCode` | string | No | Postal code — required for live EasyPost rates |
| `city` | string | No | City name (used for Printful recipient) |
| `parcel` | JSON string | No | Custom parcel dimensions: `{"lengthIn":6,"widthIn":4,"heightIn":2,"weightOz":8}` |
| `variantIds` | string | No | Comma-separated variant IDs for Printful POD rate lookup |
| `productIds` | string | No | Comma-separated product IDs for Printful POD items without a variant |
| `recipientName` | string | No | Customer name for Printful recipient (default: `"Customer"`) |
| `email` | string | No | Customer email for Printful recipient |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "name": "Standard Shipping",
      "rateType": "flat",
      "price": 595,
      "freeAbove": 5000,
      "minDeliveryDays": 3,
      "maxDeliveryDays": 7,
      "zoneName": "Domestic"
    },
    {
      "id": "live:rate_abc123",
      "name": "USPS Priority Mail",
      "rateType": "live",
      "price": 995,
      "freeAbove": null,
      "minDeliveryDays": 2,
      "maxDeliveryDays": 2,
      "zoneName": "Live carrier rate",
      "provider": "easypost",
      "carrier": "USPS",
      "service": "Priority",
      "shipmentId": "shp_abc123",
      "rateToken": "rate_abc123"
    }
  ]
}
```

> Pass the chosen `id` as `shippingRateId` in `POST /checkout`. Live rate IDs are prefixed with `live:` or `printful:`. `freeAbove` is the subtotal threshold (in cents) above which this rate becomes free; `null` means no free-above threshold.

---

## Gift certificates

### `POST /gift-certificates/validate`

Validates a gift certificate code and returns the remaining balance. Does not redeem the certificate — that happens at checkout.

- **Auth:** Public

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Gift certificate code (case-insensitive) |

**Response**

```json
{
  "success": true,
  "data": {
    "code": "GIFT-ABCD-1234",
    "remainingAmount": 5000,
    "status": "active"
  }
}
```

---

## Auth

### `POST /auth`

Single endpoint for all customer authentication actions. The `action` field in the request body selects the operation.

- **Auth:** Public for all actions (session token required for `me` and `logout`)

**Common request structure**

```json
{ "action": "<action>", ...actionFields }
```

#### `action: "register"`

Requires customer accounts to be enabled for the store (`403` otherwise).

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `password` | string | Yes (min 8 chars) |
| `firstName` | string | No |
| `lastName` | string | No |

**Response (201)**

```json
{
  "success": true,
  "data": {
    "token": "<session-token>",
    "customer": { "id": 101, "email": "jane@example.com", "firstName": "Jane", "lastName": "Smith" }
  }
}
```

#### `action: "login"`

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `password` | string | Yes |

**Response** — same shape as `register`, `201` becomes `200`.

#### `action: "logout"`

Invalidates the current session. Pass the token via `Authorization: Bearer <token>`.

**Response** — `{ "success": true }`.

#### `action: "me"`

Returns the full customer profile for the current session. Requires `Authorization: Bearer <token>`.

**Response** — full customer object with `id`, `email`, `firstName`, `lastName`, `phone`, `defaultShippingAddress`, `defaultBillingAddress`, `addressBook`, `orderCount`, `totalSpent`, `createdAt`.

#### `action: "forgot-password"`

Sends a password-reset email if the address exists. Always returns success to avoid email enumeration.

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |

#### `action: "reset-password"`

| Field | Type | Required |
|-------|------|----------|
| `token` | string | Yes |
| `password` | string | Yes (min 8 chars) |

---

## Account (customer session required)

All endpoints in this group require `Authorization: Bearer <token>`. Returns `401 Unauthorized` without it.

### `GET /account`

Returns the authenticated customer's profile. See `action: "me"` above for the response shape.

---

### `PATCH /account`

Updates the customer profile. All fields are optional; only supplied fields are changed.

**Request body**

| Field | Type | Description |
|-------|------|-------------|
| `firstName` | string | — |
| `lastName` | string | — |
| `phone` | string | — |
| `defaultShippingAddress` | object | JSON address object |
| `defaultBillingAddress` | object | JSON address object |
| `addressBook` | array | Array of saved address objects |

---

### `GET /account/orders`

Returns all orders placed with the authenticated customer's email address, ordered newest first.

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 9001,
      "orderNumber": "ORD-0042",
      "status": "shipped",
      "paymentStatus": "paid",
      "total": 6380,
      "createdAt": "2026-06-20T08:55:00.000Z"
    }
  ]
}
```

---

### `GET /account/orders/{orderNumber}`

Returns the full order detail including line items (with design thumbnails if applicable), status history, and EasyPost tracking events. Only returns orders that belong to the authenticated customer's email.

---

### `GET /account/support`

Lists all support messages submitted by the authenticated customer, ordered by latest activity.

---

### `POST /account/support`

Creates a new support message.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | string | Yes | Message subject |
| `body` | string | Yes | Message body |
| `category` | string | No | Category tag (default: `general`) |
| `orderId` | integer | No | Related order ID |

**Response (201)** — the created message record.

---

### `GET /account/support/{messageId}`

Returns a support message with its full reply thread.

---

### `POST /account/support/{messageId}`

Adds a customer reply to an existing support thread.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `body` | string | Yes |

---

### `GET /account/wishlist`

Returns the customer's default wishlist with enriched product data (name, slug, price, compare-at price, status, first image). Auto-creates the wishlist on first access.

---

### `POST /account/wishlist`

Adds a product to the wishlist. Idempotent — if the product is already present the existing item is returned.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `productId` | integer | Yes |
| `variantId` | integer | No |

---

### `DELETE /account/wishlist`

Removes a product from the wishlist.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `productId` | integer | Yes |

---

## Designs (custom product designer)

These endpoints power the custom product designer — an in-browser canvas where customers decorate designable products before adding them to the cart.

**Auth split:** Most design endpoints accept either a customer Bearer token (logged-in customers) or the `sd_design_session` cookie (anonymous visitors). The cookie is set automatically by `POST /designs` when a new anonymous session is created. Design ownership is verified against whichever identifier is present.

### `GET /designs`

Lists designs owned by the current caller (cookie or Bearer). Add `?productId={id}` to filter to one product. Add `?templates=1` to return site-wide staff-authored design templates instead.

---

### `POST /designs`

Creates a new design for a designable product.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productId` | integer | Yes | Must be a designable product on this site |
| `name` | string | No | Design name (default: `"Untitled Design"`) |
| `layers` | array | No | Initial layer data |

**Response (201)**

```json
{
  "success": true,
  "data": {
    "id": 77,
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "websiteId": 12,
    "productId": 42,
    "name": "My Custom Tee",
    "isPublic": false,
    "createdAt": "2026-06-23T10:00:00.000Z",
    "updatedAt": "2026-06-23T10:00:00.000Z"
  }
}
```

> If the caller has no existing session, the response sets the `sd_design_session` cookie to establish an anonymous designer session.

---

### `GET /designs/{designId}`

Returns a design. The caller must own it (matching customer ID or matching session ID).

`{designId}` accepts a numeric design ID (new designer, `productDesigns` table) or a 36-character UUID (legacy designer, `designs` table).

**Query params (GET, UUID designs only)**

| Name | Type | Required |
|------|------|----------|
| `sessionId` | string | When using anonymous session without cookie |

---

### `PUT /designs/{designId}`

Saves design changes.

**Request body (numeric ID — new designer)**

| Field | Type | Description |
|-------|------|-------------|
| `layers` | array | Layer data array |
| `styleOverrides` | object | Per-style overrides |
| `name` | string | Design name |
| `description` | string | — |
| `thumbnailUrl` | string | Preview image URL |
| `styleId` | integer | Active style |

**Request body (UUID — legacy designer)**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | — |
| `layersBySurface` | object | Keyed by surface slug |
| `canvasSize` | object | `{ width, height }` |
| `status` | string | `draft`, `finalized`, or `rendered` |
| `sessionId` | string | Required when using anonymous session without cookie |

---

### `DELETE /designs/{designId}`

Soft-deletes a design (new designer) or hard-deletes it (legacy). The caller must own it.

---

### `GET /designs/public/{uuid}`

Returns a publicly shared design. No auth required. Returns `404` if the design exists but `isPublic` is false.

---

### `POST /designs/{designId}/share`

Toggles the public-sharing flag on a design and returns a shareable URL.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `isPublic` | boolean | Yes |

**Response**

```json
{
  "success": true,
  "design": { ... },
  "shareableUrl": "https://yoursite.com/design/share/a1b2c3d4-...",
  "uuid": "a1b2c3d4-...",
  "isPublic": true
}
```

---

### `POST /designs/{designId}/clone`

Creates a copy of any design the caller can read (owned, public, or template). The clone belongs to the caller.

**Request body**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Name for the clone (optional) |

---

### `POST /designs/{designId}/ai-image`

Generates one or more print-ready AI images (via OpenAI `gpt-image-1`) and uploads them as design assets, ready to drop onto the canvas as image layers. Images are billed against the merchant who owns the website; the per-design rate limit is enforced server-side.

- **Auth:** Design ownership required (Bearer or session cookie)

**Request body**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | string | — | Image prompt (max 1,000 chars) |
| `style` | string | `illustration` | `illustration`, `photo`, `graphic`, or `auto` |
| `transparent` | boolean | `true` | Generate transparent-background PNG (recommended for print) |
| `size` | string | `1024x1024` | `1024x1024`, `1024x1536`, `1536x1024`, or `auto` |
| `quality` | string | `high` | `low`, `medium`, `high`, or `auto` |
| `n` | integer | `1` | Number of variations (1–4) |
| `sessionId` | string | — | Pass when using anonymous session without cookie |

**Response (201)**

```json
{
  "success": true,
  "data": {
    "id": 501,
    "url": "https://cdn.example.com/media/designs/77/ai/abc.png",
    "width": 1024,
    "height": 1024,
    "mimeType": "image/png",
    "fileSize": 204800,
    "prompt": "a bold sun rising over mountains",
    "augmentedPrompt": "...",
    "style": "illustration",
    "variants": [
      { "id": 501, "url": "...", "width": 1024, "height": 1024, "mimeType": "image/png", "fileSize": 204800 }
    ]
  }
}
```

**Errors**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `Prompt is required` | Missing or blank prompt |
| `402` | — | Merchant's AI plan limit reached; upgrade needed |
| `429` | — | Per-design rate limit exceeded |
| `503` | — | No OpenAI key configured for this merchant |

---

### `POST /designs/{designId}/ai-text`

Generates short text suggestions for the design canvas (slogans, taglines, copy) using Claude. Billed against the merchant's AI credits.

- **Auth:** Design ownership required (Bearer or session cookie)

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | What kind of text to generate (max 600 chars) |
| `productName` | string | No | Product context (max 200 chars) |
| `count` | integer | No (default 3) | Number of suggestions (1–6) |
| `sessionId` | string | No | Pass when using anonymous session |

**Response** — `{ "success": true, "data": { "suggestions": ["text 1", "text 2", ...] } }`

---

### `POST /designs/{designId}/finalize`

Marks a design as finalized and generates a composite mockup image (artwork composited over the product blank). Called before adding to cart.

- **Auth:** Design ownership required

---

### `POST /designs/{designId}/assets`

Uploads an image asset to a design (used for customer-uploaded artwork). Returns an asset record with the CDN URL.

---

### `POST /designs/claim`

Transfers all anonymous session designs to an authenticated customer after sign-in or registration. Call this once after `action: "login"` or `action: "register"` to preserve designs the customer created before logging in.

- **Auth:** Bearer token required

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | The anonymous `sd_design_session` value from before login |
| `customerId` | integer | Yes | Must match the authenticated customer's ID |

---

### `GET /designs/anonymous/count`

Returns the count of designs held under the current anonymous session cookie. Used to show a "you have N saved designs — log in to keep them" prompt.

- **Auth:** Public (reads `sd_design_session` cookie)

---

### `GET /designs/fonts`

Returns the list of fonts available in the product designer canvas.

- **Auth:** Public

---

### `POST /designs/generate-thumbnail`

Generates and stores a flat thumbnail PNG for a design from its layer data. Called by the canvas after significant edits.

- **Auth:** Design ownership required

---

### `POST /designs/upload-image`

Uploads a customer image (e.g. a photo or logo) for use on the canvas, without tying it to a specific design. Returns a CDN URL.

- **Auth:** Design ownership or anonymous session required

---

### `POST /designs/assets`

Batch-fetches or registers media assets for the designer. Used internally by the canvas.

---

## Error responses

All endpoints follow the `{ success: false, message: string }` envelope. Common status codes:

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing or invalid parameter |
| `401` | Unauthorized — missing or invalid Bearer token |
| `403` | Forbidden — valid session but wrong owner |
| `404` | Not found — resource or store not found |
| `409` | Conflict — e.g. email already registered |
| `500` | Internal server error |
