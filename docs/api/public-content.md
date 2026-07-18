# Public Content & A/B Events API

These endpoints let you read published content (posts, categories, tags, and media) from any active SimplerDevelopment website without an API key. A separate endpoint lets your front-end tracker record A/B test view and goal events. Use these to build headless front ends, static-site generators, or analytics integrations on top of content your client manages in the portal.

**Base URL:** `https://your-instance.simplerdevelopment.com`

**Authentication:** These endpoints require no API key. For authenticated write operations see [./authentication.md](./authentication.md).

---

## Content endpoints

All content endpoints share the path prefix `/api/public/websites/{siteId}` and only return data for **active** websites. A `siteId` that does not exist or belongs to an inactive site returns `404`.

---

### `GET /api/public/websites/{siteId}/posts`

List published posts for a website, with optional filtering and pagination.

- **Auth:** Public — no key required
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the website |

- **Query params:**

  | Name | Type | Default | Description |
  |---|---|---|---|
  | `limit` | integer | `20` | Number of posts to return. Capped at `100`. |
  | `offset` | integer | `0` | Number of posts to skip (for pagination). |
  | `postType` | string | — | Filter by post type (e.g. `post`, `page`). |
  | `category` | string | — | Filter by category **slug**. |
  | `tag` | string | — | Filter by tag **slug**. |
  | `search` | string | — | Case-insensitive title substring match. |

- **Response:**

  ```json
  {
    "success": true,
    "data": [
      {
        "id": 42,
        "title": "Getting started with blocks",
        "slug": "getting-started-with-blocks",
        "postType": "post",
        "excerpt": "A quick intro to the block editor.",
        "coverImage": "https://cdn.example.com/cover.jpg",
        "publishedAt": "2026-05-20T14:00:00.000Z"
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 1
    }
  }
  ```

- **Errors:**

  | Status | Condition |
  |---|---|
  | `404` | `siteId` not found or site is inactive |

- **Example:**

  ```bash
  curl "https://your-instance.simplerdevelopment.com/api/public/websites/7/posts?limit=5&category=news&search=blocks"
  ```

---

### `GET /api/public/websites/{siteId}/posts/{slug}`

Fetch a single published post by its slug, including its full content, categories, and tags.

- **Auth:** Public — no key required
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the website |
  | `slug` | string | URL slug of the post |

- **Response:**

  ```json
  {
    "success": true,
    "data": {
      "id": 42,
      "title": "Getting started with blocks",
      "slug": "getting-started-with-blocks",
      "postType": "post",
      "excerpt": "A quick intro to the block editor.",
      "coverImage": "https://cdn.example.com/cover.jpg",
      "publishedAt": "2026-05-20T14:00:00.000Z",
      "content": { },
      "categories": [
        { "id": 3, "name": "News", "slug": "news", "color": "#3b82f6" }
      ],
      "tags": [
        { "id": 11, "name": "blocks", "slug": "blocks" }
      ]
    }
  }
  ```

  > The `content` field contains the full block JSON stored in the post. Its shape depends on which blocks are used on the post.

- **Errors:**

  | Status | Condition |
  |---|---|
  | `404` | `siteId` not found, site inactive, slug not found, or post is unpublished |

- **Example:**

  ```bash
  curl "https://your-instance.simplerdevelopment.com/api/public/websites/7/posts/getting-started-with-blocks"
  ```

---

### `GET /api/public/websites/{siteId}/categories`

List all categories for a website, ordered alphabetically by name.

- **Auth:** Public — no key required
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the website |

- **Response:**

  ```json
  {
    "success": true,
    "data": [
      {
        "id": 3,
        "name": "News",
        "slug": "news",
        "description": "Latest news and updates.",
        "color": "#3b82f6"
      }
    ]
  }
  ```

- **Errors:**

  | Status | Condition |
  |---|---|
  | `404` | `siteId` not found or site is inactive |

- **Example:**

  ```bash
  curl "https://your-instance.simplerdevelopment.com/api/public/websites/7/categories"
  ```

---

### `GET /api/public/websites/{siteId}/tags`

List all tags for a website, ordered alphabetically by name.

- **Auth:** Public — no key required
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the website |

- **Response:**

  ```json
  {
    "success": true,
    "data": [
      { "id": 11, "name": "blocks", "slug": "blocks" },
      { "id": 7, "name": "tutorial", "slug": "tutorial" }
    ]
  }
  ```

- **Errors:**

  | Status | Condition |
  |---|---|
  | `404` | `siteId` not found or site is inactive |

- **Example:**

  ```bash
  curl "https://your-instance.simplerdevelopment.com/api/public/websites/7/tags"
  ```

---

### `GET /api/public/websites/{siteId}/media`

List media assets for a website, ordered newest-first, with optional MIME type filtering and pagination.

- **Auth:** Public — no key required
- **Path params:**

  | Name | Type | Description |
  |---|---|---|
  | `siteId` | integer | Numeric ID of the website |

- **Query params:**

  | Name | Type | Default | Description |
  |---|---|---|---|
  | `limit` | integer | `20` | Number of items to return. Capped at `100`. |
  | `offset` | integer | `0` | Number of items to skip (for pagination). |
  | `mimeType` | string | — | Prefix filter on MIME type (e.g. `image`, `video`, `image/png`). Pass `all` or omit to return every type. |

- **Response:**

  ```json
  {
    "success": true,
    "data": [
      {
        "id": 88,
        "filename": "hero-banner.jpg",
        "mimeType": "image/jpeg",
        "url": "https://cdn.example.com/hero-banner.jpg",
        "thumbnailUrl": "https://cdn.example.com/hero-banner-thumb.jpg",
        "alt": "Hero banner for homepage",
        "caption": null,
        "width": 1920,
        "height": 1080
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 1
    }
  }
  ```

- **Errors:**

  | Status | Condition |
  |---|---|
  | `404` | `siteId` not found or site is inactive |

- **Example:**

  ```bash
  # Fetch the first 10 images only
  curl "https://your-instance.simplerdevelopment.com/api/public/websites/7/media?mimeType=image&limit=10"
  ```

---

## A/B test event endpoint

### `POST /api/public/ab/event`

Record a single A/B test event (a view or a goal conversion) from a visitor's browser. Your client-side tracker calls this endpoint; the portal's experiment dashboard aggregates the results.

The endpoint deduplicates silently: if the same `(experimentId, visitorId, kind)` triple has already been recorded, it returns `success: true` with `duplicated: true` and does **not** insert a second row. This prevents a single visitor from inflating metrics by refreshing the page.

Events are accepted for experiments in `running` or `completed` status. Experiments in `draft` or `archived` status are rejected.

- **Auth:** Public — no key required
- **Request body:**

  ```json
  {
    "experimentId": 5,
    "variantKey": "ctrl",
    "visitorId": "a1b2c3d4-e5f6",
    "kind": "view"
  }
  ```

  | Field | Type | Required | Constraints | Description |
  |---|---|---|---|---|
  | `experimentId` | integer | Yes | Must be a positive integer | ID of the A/B experiment |
  | `variantKey` | string | Yes | Truncated to 8 characters | Identifies which variant the visitor saw |
  | `visitorId` | string | Yes | 8–64 alphanumeric characters and hyphens (`[a-zA-Z0-9-]`) | Stable anonymous visitor identifier (e.g. a UUID from a first-party cookie) |
  | `kind` | string | Yes | `"view"` or `"goal"` | Type of event being recorded |

- **Response — new event recorded:**

  ```json
  {
    "success": true,
    "data": { "recorded": true }
  }
  ```

- **Response — duplicate suppressed:**

  ```json
  {
    "success": true,
    "data": { "duplicated": true }
  }
  ```

- **Errors:**

  | Status | Error value | Condition |
  |---|---|---|
  | `400` | `"invalid_json"` | Request body is not valid JSON |
  | `400` | `"invalid_body"` | Body is not an object |
  | `400` | `"invalid_experiment_id"` | `experimentId` is missing, zero, or not a finite number |
  | `400` | `"invalid_payload"` | `variantKey` is empty, or `kind` is not `"view"` or `"goal"` |
  | `400` | `"invalid_visitor"` | `visitorId` fails the `[a-zA-Z0-9-]{8,64}` pattern |
  | `404` | `"not_found"` | No experiment exists with the given `experimentId` |
  | `409` | `"not_active"` | Experiment exists but its status is `draft` or `archived` |

- **Example — recording a goal conversion:**

  ```bash
  curl -X POST "https://your-instance.simplerdevelopment.com/api/public/ab/event" \
    -H "Content-Type: application/json" \
    -d '{
      "experimentId": 5,
      "variantKey": "var-a",
      "visitorId": "d4e5f6a7-b8c9",
      "kind": "goal"
    }'
  ```

---

## Differences from authenticated `/api/v1` endpoints

| | Public endpoints (`/api/public/...`) | Authenticated endpoints (`/api/v1/...`) |
|---|---|---|
| API key required | No | Yes |
| Writes allowed | No (read-only, plus A/B event ingest) | Yes |
| Posts returned | Published only | All (including drafts) |
| Intended caller | Public website visitors / headless front ends | Your server-side integration / portal tooling |
