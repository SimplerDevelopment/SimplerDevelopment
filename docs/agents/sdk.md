# SDK Reference — `@simplerdevelopment/sdk`

> **Audience:** developers building headless renderers, static-site generators, or any application that reads published content from a SimplerDevelopment-powered site.
> **Sibling docs:** [API Index](./api-index.md) · [Architecture](./architecture-for-agents.md) · [AI Overview](./ai-overview.md) · [Repository Map](./repository-map.md) · [Tool Reference](./tool-reference.md) · [Workflow Reference](./workflow-reference.md) · [Glossary](./glossary.md) · [/llms.txt](/llms.txt)

---

## Overview

`@simplerdevelopment/sdk` (v0.1.0) is the official TypeScript client for the SimplerDevelopment **REST v1** surface. It wraps all 13 read-only endpoints under `/api/v1/sites/{siteId}/…` with typed methods, structured error classes, and a pluggable fetch interface.

Source: `packages/sdk/`  
Package entry: `packages/sdk/src/index.ts`  
Build: `tsup` → CJS + ESM dual output with `.d.ts` declarations.

---

## Installation

```bash
npm install @simplerdevelopment/sdk
# or
bun add @simplerdevelopment/sdk
```

---

## Constructor and configuration

```typescript
import { SimplerDevelopment } from '@simplerdevelopment/sdk';

const client = new SimplerDevelopment(options);
```

`options` is a `SimplerDevelopmentConfig` object:

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `siteId` | `number` | Yes | — | Numeric site ID |
| `apiKey` | `string` | No | — | `sd_live_` API key; omit only for the four auth-optional endpoints |
| `baseUrl` | `string` | No | `https://simplerdevelopment.com` | Override for self-hosted or preview deployments |
| `fetch` | `typeof globalThis.fetch` | No | `globalThis.fetch` | Inject a custom fetch (Node < 18, edge runtimes, test mocks) |

Each `SimplerDevelopment` instance is bound to one site. Instantiate separately for each site you need to query.

---

## Authentication

The SDK sends the API key as the `X-Api-Key` header on every request when `apiKey` is provided.

Keys are prefixed `sd_live_` and are issued in the portal at **Settings → API Keys**. They are hashed with SHA-256 at rest.

**Auth-optional endpoints** (API key is not required): `config`, `branding`, `navigation`, `blocks`.

**Rate limit:** 60 requests / minute per key + site (sliding window). On a 429 the SDK throws `RateLimitError`; the raw `Retry-After` header value (in seconds) is exposed as `.retryAfter`.

---

## Client surface

The client exposes eleven resource namespaces as readonly properties. All methods are `async` and return typed values — the response envelope (`{ success, data }`) is unwrapped automatically.

### `client.config`

Maps to: `GET /api/v1/sites/{siteId}/config`  
Auth optional: yes

```typescript
client.config.get(): Promise<SiteConfig>
```

Returns the full site bundle: metadata (`id`, `name`, `domain`, `subdomain`, `description`, `customLayout`, `storeEnabled`), the `Branding` object, pre-built `cssVars`, and the navigation tree.

---

### `client.branding`

Maps to: `GET /api/v1/sites/{siteId}/branding`  
Auth optional: yes

```typescript
client.branding.get(): Promise<{ branding: Branding; cssVars: string }>
```

Returns the full brand profile (colors, logo variants, typography, button style, dark-mode overrides) and a ready-to-inject CSS custom-property string.

---

### `client.navigation`

Maps to: `GET /api/v1/sites/{siteId}/navigation`  
Auth optional: yes

```typescript
client.navigation.get(): Promise<NavItem[]>
```

Returns the navigation menu as a nested tree. Each `NavItem` carries `id`, `label`, `href`, `parentId`, `sortOrder`, `openInNewTab`, `isButton`, `description`, `icon`, `featuredImage`, `columnGroup`, and a `children` array of the same type.

---

### `client.posts`

Maps to: `GET /api/v1/sites/{siteId}/posts` and `GET /api/v1/sites/{siteId}/posts/{slug}`

```typescript
client.posts.list(params?: ListPostsParams): Promise<{
  data: PostSummary[];
  pagination: { limit: number; offset: number; total: number };
}>

client.posts.get(slug: string): Promise<Post>
```

**`list` parameters (`ListPostsParams`):**

| Param | Type | Description |
|---|---|---|
| `limit` | `number` | Max items to return |
| `offset` | `number` | Pagination offset |
| `postType` | `string` | Filter to a specific post type (e.g. `"blog"`) |
| `category` | `string` | Category slug |
| `tag` | `string` | Tag slug |
| `search` | `string` | Full-text keyword search |

`list` returns `PostSummary[]` (lightweight: `id`, `title`, `slug`, `postType`, `excerpt`, `coverImage`, `publishedAt`).

`get` returns the full `Post` including `content`, `seoTitle`, `seoDescription`, `ogImage`, `categories`, and `tags`.

---

### `client.pages`

Maps to: `GET /api/v1/sites/{siteId}/pages`

```typescript
client.pages.list(params?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{
  data: PostSummary[];
  pagination: { limit: number; offset: number; total: number };
}>
```

Equivalent to filtering posts by `postType = "page"`. There is no `pages.get(slug)` shortcut; use `posts.get(slug)` with a page slug.

---

### `client.categories`

Maps to: `GET /api/v1/sites/{siteId}/categories`

```typescript
client.categories.list(): Promise<Category[]>
```

Returns all categories sorted alphabetically. Each `Category` carries `id`, `name`, `slug`, `description`, and `color`.

---

### `client.tags`

Maps to: `GET /api/v1/sites/{siteId}/tags`

```typescript
client.tags.list(): Promise<Tag[]>
```

Returns all tags sorted alphabetically. Each `Tag` carries `id`, `name`, `slug`.

---

### `client.media`

Maps to: `GET /api/v1/sites/{siteId}/media`

```typescript
client.media.list(params?: ListMediaParams): Promise<{
  data: MediaItem[];
  pagination: { limit: number; offset: number; total: number };
}>
```

**`list` parameters (`ListMediaParams`):**

| Param | Type | Description |
|---|---|---|
| `limit` | `number` | Max items to return |
| `offset` | `number` | Pagination offset |
| `mimeType` | `string` | MIME prefix filter (e.g. `"image/"`) |

Each `MediaItem` carries `id`, `filename`, `mimeType`, `url`, `thumbnailUrl`, `alt`, `caption`, `width`, `height`.

---

### `client.products`

Maps to: `GET /api/v1/sites/{siteId}/products` and `GET /api/v1/sites/{siteId}/products/{slug}`

```typescript
client.products.list(params?: ListProductsParams): Promise<{
  data: Product[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}>

client.products.get(slug: string): Promise<ProductDetail>
```

**`list` parameters (`ListProductsParams`):**

| Param | Type | Description |
|---|---|---|
| `category` | `string` | Product category slug |
| `search` | `string` | Keyword search |
| `sort` | `'newest' \| 'price_asc' \| 'price_desc' \| 'featured'` | Sort order |
| `page` | `number` | Page number (1-based) |
| `limit` | `number` | Items per page |

Note: products use page-based pagination (`page` / `totalPages`), not offset-based.

`get` returns `ProductDetail` with `images[]`, `options[]` (each with `values[]`), `variants[]`, `bulkPricing[]`, and a nested `category` object.

---

### `client.productCategories`

Maps to: `GET /api/v1/sites/{siteId}/product-categories`

```typescript
client.productCategories.list(): Promise<ProductCategory[]>
```

Returns all active product categories with live `productCount` values. Each `ProductCategory` carries `id`, `name`, `slug`, `description`, `image`, `parentId`, `order`, `productCount`.

---

### `client.blocks`

Maps to: `GET /api/v1/sites/{siteId}/blocks`  
Auth optional: yes

```typescript
client.blocks.list(): Promise<BlockDefinition[]>
```

Returns the full block catalog. Each `BlockDefinition` carries `type`, `name`, `category`, and `inputs` (list of field names).

---

## Error handling

All errors extend `SDKError extends Error`. Import error classes from the package root.

```typescript
import { SDKError, NotFoundError, UnauthorizedError, RateLimitError } from '@simplerdevelopment/sdk';
```

| Class | HTTP status | Extra fields |
|---|---|---|
| `UnauthorizedError` | 401 | — |
| `NotFoundError` | 404 | — |
| `RateLimitError` | 429 | `.retryAfter: number` (seconds) |
| `SDKError` | any other | `.status: number`, `.response?: unknown` |

```typescript
try {
  const post = await client.posts.get('unknown-slug');
} catch (err) {
  if (err instanceof RateLimitError) {
    await delay(err.retryAfter * 1000);
  } else if (err instanceof NotFoundError) {
    // handle 404
  } else if (err instanceof SDKError) {
    console.error(err.status, err.message);
  }
}
```

---

## REST v1 endpoint coverage

The SDK covers **all 13** REST v1 endpoints.

| Endpoint | SDK method |
|---|---|
| `GET /sites/{siteId}/config` | `client.config.get()` |
| `GET /sites/{siteId}/branding` | `client.branding.get()` |
| `GET /sites/{siteId}/navigation` | `client.navigation.get()` |
| `GET /sites/{siteId}/posts` | `client.posts.list()` |
| `GET /sites/{siteId}/posts/{slug}` | `client.posts.get(slug)` |
| `GET /sites/{siteId}/pages` | `client.pages.list()` |
| `GET /sites/{siteId}/categories` | `client.categories.list()` |
| `GET /sites/{siteId}/tags` | `client.tags.list()` |
| `GET /sites/{siteId}/media` | `client.media.list()` |
| `GET /sites/{siteId}/products` | `client.products.list()` |
| `GET /sites/{siteId}/products/{slug}` | `client.products.get(slug)` |
| `GET /sites/{siteId}/product-categories` | `client.productCategories.list()` |
| `GET /sites/{siteId}/blocks` | `client.blocks.list()` |

---

## Roadmap / not yet covered

The following API surfaces are intentionally out of scope for v0.1.0:

| Surface | Gap |
|---|---|
| **Public API** (`/api/public/…`) | Booking availability, gift certificate lookups, live-chat, A/B events, unauthenticated slug lookups — not wrapped |
| **Portal internal API** (`/api/portal/…`) | ~60 route groups (CRM, Brain, Kanban, email campaigns, invoices, etc.) — session-cookie auth; not intended for third parties |
| **MCP surface** (`POST /api/mcp`) | 450-tool surface for AI agents — see [Tool Reference](./tool-reference.md) |
| **Write operations** | The REST v1 surface is read-only by design; no write wrapper is possible until a write surface is added to the API |
| **`pages.get(slug)`** | No dedicated shortcut exists; use `client.posts.get(slug)` for page slugs |

---

## Related docs

- [API Index](./api-index.md) — full description of all four API surfaces and their auth models
- [Tool Reference](./tool-reference.md) — MCP tool catalog for AI agents
- [/llms.txt](/llms.txt) — machine-readable platform summary
- Package source: `packages/sdk/`
- Package README: `packages/sdk/README.md`
