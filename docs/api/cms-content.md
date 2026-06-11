# CMS Content API (Posts, Pages, Categories, Tags)

The CMS Content API gives you read access to the published content on any active SimplerDevelopment site — blog posts, custom post types, static pages, and their associated categories and tags. Use it to pull content into external applications, power headless front ends, or build integrations on top of your site's content.

**Base URL:** `https://your-domain.com/api/v1/sites/{siteId}`

**Authentication:** All endpoints require a valid API key passed as a bearer token. See [Authentication](./authentication.md) for details.

---

## Endpoints

- [GET /posts](#get-posts) — list published posts
- [GET /posts/{slug}](#get-postsslugg) — get a single post by slug
- [GET /pages](#get-pages) — list published pages
- [GET /categories](#get-categories) — list categories for a site
- [GET /tags](#get-tags) — list tags for a site

---

### `GET /posts`

Returns a paginated list of published posts for the site. Supports filtering by post type, category, tag, and keyword search.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|---|---|---|
| `siteId` | integer | The numeric ID of the site |

- **Query params:**

| Name | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `20` | Maximum number of results to return. Capped at `100`. |
| `offset` | integer | `0` | Number of records to skip (for pagination). |
| `postType` | string | — | Filter by post type slug (e.g. `blog`, `case-study`). Omit to return all types. |
| `category` | string | — | Filter by category slug. Only posts assigned to this category are returned. |
| `tag` | string | — | Filter by tag slug. Only posts assigned to this tag are returned. |
| `search` | string | — | Case-insensitive title keyword filter (matches anywhere in the title). |

- **Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "title": "Getting Started with Headless CMS",
      "slug": "getting-started-headless-cms",
      "postType": "blog",
      "excerpt": "A quick overview of how to pull your content via the API.",
      "coverImage": "https://cdn.example.com/images/hero.jpg",
      "publishedAt": "2026-05-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 84
  }
}
```

- **Errors:**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid site ID` | `siteId` is not a valid integer |
| `404` | `Not found` | Site does not exist or is not active |
| `401` | _(varies)_ | Missing or invalid API key |

- **Example:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/posts?postType=blog&category=tutorials&limit=10"
```

---

### `GET /posts/{slug}`

Returns a single published post by its slug, including its full content, SEO fields, assigned categories, and assigned tags.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|---|---|---|
| `siteId` | integer | The numeric ID of the site |
| `slug` | string | The URL slug of the post |

- **Response:**

The `data` object contains all columns from the `posts` table for the matching record, plus embedded `categories` and `tags` arrays.

```json
{
  "success": true,
  "data": {
    "id": 42,
    "title": "Getting Started with Headless CMS",
    "slug": "getting-started-headless-cms",
    "postType": "blog",
    "excerpt": "A quick overview of how to pull your content via the API.",
    "content": "{\"blocks\":[...]}",
    "coverImage": "https://cdn.example.com/images/hero.jpg",
    "published": true,
    "publishedAt": "2026-05-01T12:00:00.000Z",
    "seoTitle": "Getting Started with Headless CMS | Acme Blog",
    "seoDescription": "Learn how to use the SimplerDevelopment CMS API.",
    "ogImage": "https://cdn.example.com/images/og-hero.jpg",
    "noIndex": false,
    "canonicalUrl": null,
    "customCss": null,
    "customJs": null,
    "websiteId": 7,
    "parentPostId": null,
    "createdAt": "2026-04-28T09:00:00.000Z",
    "updatedAt": "2026-05-01T11:55:00.000Z",
    "categories": [
      {
        "id": 3,
        "name": "Tutorials",
        "slug": "tutorials",
        "color": "#2563eb"
      }
    ],
    "tags": [
      {
        "id": 11,
        "name": "headless",
        "slug": "headless"
      }
    ]
  }
}
```

> **Note on `content`:** The `content` field is a JSON string encoding the block tree used by the visual editor (`{ "blocks": [...], "version": "1.0" }`). Parse it as JSON to work with individual blocks.

- **Errors:**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid site ID` | `siteId` is not a valid integer |
| `404` | `Not found` | Site does not exist, is not active, or the post slug does not match a published post |
| `401` | _(varies)_ | Missing or invalid API key |

- **Example:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/posts/getting-started-headless-cms"
```

---

### `GET /pages`

Returns a paginated list of published pages for the site. Pages are posts with `postType = "page"` — this endpoint is a convenience wrapper that always applies that filter. Supports keyword search and pagination.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|---|---|---|
| `siteId` | integer | The numeric ID of the site |

- **Query params:**

| Name | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `20` | Maximum number of results to return. Capped at `100`. |
| `offset` | integer | `0` | Number of records to skip (for pagination). |
| `search` | string | — | Case-insensitive title keyword filter. |

- **Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "title": "About Us",
      "slug": "about-us",
      "postType": "page",
      "excerpt": null,
      "coverImage": null,
      "publishedAt": "2026-01-10T08:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 6
  }
}
```

- **Errors:**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid site ID` | `siteId` is not a valid integer |
| `404` | `Not found` | Site does not exist or is not active |
| `401` | _(varies)_ | Missing or invalid API key |

- **Example:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/pages?search=about"
```

---

### `GET /categories`

Returns all categories for the site, ordered alphabetically by name.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|---|---|---|
| `siteId` | integer | The numeric ID of the site |

- **Query params:** None

- **Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "name": "Tutorials",
      "slug": "tutorials",
      "description": "Step-by-step guides for developers.",
      "color": "#2563eb"
    },
    {
      "id": 5,
      "name": "News",
      "slug": "news",
      "description": null,
      "color": null
    }
  ]
}
```

- **Errors:**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid site ID` | `siteId` is not a valid integer |
| `404` | `Not found` | Site does not exist or is not active |
| `401` | _(varies)_ | Missing or invalid API key |

- **Example:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/categories"
```

---

### `GET /tags`

Returns all tags for the site, ordered alphabetically by name.

- **Auth:** API key required
- **Path params:**

| Name | Type | Description |
|---|---|---|
| `siteId` | integer | The numeric ID of the site |

- **Query params:** None

- **Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 11,
      "name": "headless",
      "slug": "headless"
    },
    {
      "id": 14,
      "name": "open-source",
      "slug": "open-source"
    }
  ]
}
```

- **Errors:**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid site ID` | `siteId` is not a valid integer |
| `404` | `Not found` | Site does not exist or is not active |
| `401` | _(varies)_ | Missing or invalid API key |

- **Example:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/tags"
```

---

## Pagination

List endpoints (`/posts`, `/pages`) use offset-based pagination. Use `limit` and `offset` together with the `pagination.total` value in the response to page through results.

```bash
# Page 1
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/posts?limit=10&offset=0"

# Page 2
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/posts?limit=10&offset=10"
```

The `limit` value is capped server-side at `100` regardless of what you pass.

## Filtering posts by category and tag

Use the `slug` values returned from `/categories` and `/tags` as the filter values on `/posts`. Passing both `category` and `tag` returns only posts that belong to **both**.

```bash
# Posts in the "tutorials" category with the "headless" tag
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/v1/sites/7/posts?category=tutorials&tag=headless"
```
