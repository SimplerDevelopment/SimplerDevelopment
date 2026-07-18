# Commerce API (Products & Product Categories)

The Commerce API lets you browse the product catalog for any SimplerDevelopment-hosted storefront: list products with filtering, sorting, and pagination; fetch a full single-product detail by slug; and retrieve the site's product category tree. All endpoints are read-only and return only `active` products from an enabled store.

**Base URL:** `https://{your-domain}/api/v1/sites/{siteId}`

**Authentication:** All endpoints require an API key. See [Authentication](./authentication.md) for how to pass your key.

---

## Endpoints

### `GET /products`

Returns a paginated list of active products for the site, with optional filtering by category, keyword search, and sort order.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|------|------|-------------|
| `siteId` | integer | Numeric ID of the site (client website) |

- **Query params:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `category` | string | — | Filter by category slug (e.g. `t-shirts`) |
| `search` | string | — | Keyword search against product `name` and `shortDescription` |
| `sort` | string | `newest` | Sort order: `newest`, `price_asc`, `price_desc`, or `featured` |
| `page` | integer | `1` | Page number (1-based) |
| `limit` | integer | `24` | Results per page (capped at 100) |

- **Response:**

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

> **Note:** `price` and `compareAtPrice` are in cents (integer). Divide by 100 for display. `compareAtPrice` is `null` when not set. `image` is the first image by display order, or `null` if no images are attached. `categoryId` and `categoryName` are `null` for uncategorized products.

- **Errors:**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `Invalid site ID` | `siteId` path param is not a valid integer |
| `401` | — | Missing or invalid API key (from auth middleware) |
| `404` | `Store not found` | No enabled store exists for the given `siteId` |

- **Example:**

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://yoursite.com/api/v1/sites/12/products?category=t-shirts&sort=price_asc&page=1&limit=12"
```

---

### `GET /products/{slug}`

Returns the full detail record for a single active product, including all images, options (with values), variants, bulk pricing rules, and category info.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|------|------|-------------|
| `siteId` | integer | Numeric ID of the site |
| `slug` | string | URL slug of the product (e.g. `classic-crew-tee`) |

- **Response:**

```json
{
  "success": true,
  "data": {
    "id": 42,
    "websiteId": 12,
    "categoryId": 7,
    "name": "Classic Crew Tee",
    "slug": "classic-crew-tee",
    "description": "<p>Full product description…</p>",
    "shortDescription": "A comfortable everyday crew-neck tee.",
    "price": 2500,
    "compareAtPrice": 3200,
    "costPrice": null,
    "sku": "CCT-001",
    "barcode": null,
    "trackInventory": true,
    "quantity": 120,
    "weight": "180.00",
    "weightUnit": "g",
    "lengthIn": null,
    "widthIn": null,
    "heightIn": null,
    "status": "active",
    "featured": true,
    "isDesignable": false,
    "designable": false,
    "seoTitle": "Classic Crew Tee | Shop",
    "seoDescription": null,
    "tags": ["basics", "sale"],
    "metadata": null,
    "createdAt": "2025-03-15T10:22:00.000Z",
    "updatedAt": "2025-05-01T08:00:00.000Z",
    "images": [
      {
        "id": 101,
        "productId": 42,
        "url": "https://cdn.example.com/products/classic-crew-tee.jpg",
        "alt": "Front view",
        "order": 0,
        "createdAt": "2025-03-15T10:22:00.000Z"
      }
    ],
    "options": [
      {
        "id": 5,
        "productId": 42,
        "name": "Size",
        "order": 0,
        "createdAt": "2025-03-15T10:22:00.000Z",
        "values": [
          { "id": 21, "optionId": 5, "value": "S", "label": "Small", "order": 0, "createdAt": "…" },
          { "id": 22, "optionId": 5, "value": "M", "label": "Medium", "order": 1, "createdAt": "…" }
        ]
      }
    ],
    "variants": [
      {
        "id": 201,
        "productId": 42,
        "name": "Classic Crew Tee – S",
        "sku": "CCT-001-S",
        "barcode": null,
        "price": 2500,
        "compareAtPrice": null,
        "costPrice": null,
        "quantity": 60,
        "weight": null,
        "lengthIn": null,
        "widthIn": null,
        "heightIn": null,
        "image": null,
        "optionValues": [{ "optionId": 5, "valueId": 21 }],
        "active": true,
        "createdAt": "…",
        "updatedAt": "…"
      }
    ],
    "bulkPricing": [
      {
        "id": 3,
        "productId": 42,
        "variantId": null,
        "minQuantity": 10,
        "maxQuantity": 49,
        "priceType": "percent_off",
        "amount": 1000,
        "createdAt": "…"
      }
    ],
    "category": {
      "id": 7,
      "name": "T-Shirts",
      "slug": "t-shirts"
    }
  }
}
```

> **Notes:**
> - `price`, `compareAtPrice`, `costPrice`, and variant `price` fields are in cents.
> - `bulkPricing[].priceType` is either `fixed` (amount = fixed price in cents) or `percent_off` (amount = basis points, e.g. `1000` = 10% off).
> - `options[].values` are the selectable option values in display order.
> - `variants` contains only active variants (`active: true`).
> - `category` is `null` if the product has no category.

- **Errors:**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `Invalid site ID` | `siteId` is not a valid integer |
| `401` | — | Missing or invalid API key |
| `404` | `Not found` | No active product with that slug exists on this site, or the store is not enabled |

- **Example:**

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://yoursite.com/api/v1/sites/12/products/classic-crew-tee"
```

---

### `GET /product-categories`

Returns all active product categories for the site, ordered by `order` then `name`. Includes a live count of active products in each category.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|------|------|-------------|
| `siteId` | integer | Numeric ID of the site |

- **Response:**

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
    },
    {
      "id": 9,
      "name": "Graphic Tees",
      "slug": "graphic-tees",
      "description": null,
      "image": null,
      "parentId": 7,
      "order": 2,
      "productCount": 6
    }
  ]
}
```

> **Notes:**
> - `parentId` is `null` for top-level categories; non-null values reference another category's `id`, enabling a tree structure.
> - `productCount` is a live count of active products assigned to that category.
> - Only categories with `active: true` are returned.

- **Errors:**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `Invalid site ID` | `siteId` is not a valid integer |
| `401` | — | Missing or invalid API key |
| `404` | `Store not found` | No enabled store exists for the given `siteId` |

- **Example:**

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://yoursite.com/api/v1/sites/12/product-categories"
```
