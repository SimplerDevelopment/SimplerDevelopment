# @simplerdevelopment/sdk

TypeScript client for the SimplerDevelopment **REST v1** read surface. Use it to fetch published content, products, branding, and navigation from a SimplerDevelopment-powered site — suitable for headless renderers, static-site generators, and server-side data fetching.

## Install

```bash
npm install @simplerdevelopment/sdk
# or
bun add @simplerdevelopment/sdk
```

## Quick start

```typescript
import { SimplerDevelopment } from '@simplerdevelopment/sdk';

const client = new SimplerDevelopment({
  siteId: 42,           // numeric site ID from the portal
  apiKey: 'sd_live_…', // portal-issued API key (optional for public endpoints)
});

// List published posts
const { data: posts, pagination } = await client.posts.list({ limit: 10, postType: 'blog' });

// Fetch a single post by slug
const post = await client.posts.get('my-first-post');

// Get site branding (no API key required)
const { branding, cssVars } = await client.branding.get();

// List products filtered by category
const { data: products } = await client.products.list({ category: 'apparel', sort: 'price_asc' });
```

## Authentication

API keys are prefixed `sd_live_` and are issued in the portal under **Settings → API Keys**.

Pass the key as `apiKey` in the constructor. The SDK sends it as the `X-Api-Key` header on every request. Omitting the key still works for the four public endpoints: `config`, `branding`, `navigation`, and `blocks`.

```typescript
const client = new SimplerDevelopment({ siteId: 42, apiKey: 'sd_live_…' });
```

**Rate limit:** 60 requests / minute per key + site. On a 429 response the SDK throws a `RateLimitError` whose `.retryAfter` property contains the wait in seconds.

## Configuration

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `siteId` | `number` | Yes | — | Numeric ID of the site to query |
| `apiKey` | `string` | No | — | `sd_live_` API key; omit for unauthenticated calls |
| `baseUrl` | `string` | No | `https://simplerdevelopment.com` | Override for self-hosted or preview deployments |
| `fetch` | `typeof globalThis.fetch` | No | `globalThis.fetch` | Custom fetch implementation (useful in Node < 18 or test mocking) |

## Resources and methods

### `client.config`

```typescript
client.config.get(): Promise<SiteConfig>
```

Returns the full site bundle: metadata, branding, CSS vars, navigation tree, and `storeEnabled` flag.

### `client.branding`

```typescript
client.branding.get(): Promise<{ branding: Branding; cssVars: string }>
```

Returns the brand color palette, logo URLs, typography settings, and a pre-built CSS custom-property string.

### `client.navigation`

```typescript
client.navigation.get(): Promise<NavItem[]>
```

Returns the navigation menu as a nested tree (`NavItem.children`).

### `client.posts`

```typescript
client.posts.list(params?: ListPostsParams): Promise<{ data: PostSummary[]; pagination: ... }>
client.posts.get(slug: string): Promise<Post>
```

`list` supports `limit`, `offset`, `postType`, `category` (slug), `tag` (slug), and `search`. `get` returns the full post including `content`, `categories`, `tags`, and SEO fields.

### `client.pages`

```typescript
client.pages.list(params?: { limit?: number; offset?: number; search?: string }): Promise<{ data: PostSummary[]; pagination: ... }>
```

Equivalent to `posts.list` filtered to `postType = "page"`.

### `client.categories`

```typescript
client.categories.list(): Promise<Category[]>
```

Returns all categories sorted alphabetically.

### `client.tags`

```typescript
client.tags.list(): Promise<Tag[]>
```

Returns all tags sorted alphabetically.

### `client.media`

```typescript
client.media.list(params?: ListMediaParams): Promise<{ data: MediaItem[]; pagination: ... }>
```

Supports `limit`, `offset`, and `mimeType` (prefix match, e.g. `image/`).

### `client.products`

```typescript
client.products.list(params?: ListProductsParams): Promise<{ data: Product[]; pagination: ... }>
client.products.get(slug: string): Promise<ProductDetail>
```

`list` supports `category` (slug), `search`, `sort` (`newest` | `price_asc` | `price_desc` | `featured`), `page`, and `limit`. `get` returns full product detail including images, options, variants, and bulk pricing.

### `client.productCategories`

```typescript
client.productCategories.list(): Promise<ProductCategory[]>
```

Returns all active product categories with live product counts.

### `client.blocks`

```typescript
client.blocks.list(): Promise<BlockDefinition[]>
```

Returns the full block catalog — types, display names, categories, and input schemas. No API key required.

## Error handling

All errors extend `SDKError` (which extends `Error`).

```typescript
import { NotFoundError, UnauthorizedError, RateLimitError, SDKError } from '@simplerdevelopment/sdk';

try {
  const post = await client.posts.get('unknown-slug');
} catch (err) {
  if (err instanceof NotFoundError) {
    // 404 — resource does not exist
  } else if (err instanceof UnauthorizedError) {
    // 401 — invalid or missing API key
  } else if (err instanceof RateLimitError) {
    // 429 — rate limited; wait err.retryAfter seconds
    console.log(`Retry after ${err.retryAfter}s`);
  } else if (err instanceof SDKError) {
    // any other HTTP error; err.status is the HTTP status code
  }
}
```

## Which API surface does this cover?

This SDK wraps the **REST v1** surface only (`/api/v1/sites/{siteId}/…`). It covers all 13 read-only endpoints in that surface.

Other API surfaces — the Portal internal API, the Public (unauthenticated) API, and the MCP tool surface — are not covered. See [docs/agents/api-index.md](../../docs/agents/api-index.md) for a description of all four surfaces.

## Limitations

- **Read-only.** The REST v1 surface itself exposes no write operations; this SDK mirrors that constraint.
- **Site-scoped.** One `SimplerDevelopment` instance is bound to one `siteId`. Instantiate multiple clients to query multiple sites.
- **No streaming.** All methods resolve a single `Promise`; there is no streaming or SSE support.
- **No caching.** Caching (ISR, SWR, etc.) is the responsibility of the calling application.
