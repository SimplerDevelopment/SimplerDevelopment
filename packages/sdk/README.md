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
| `defaults` | `RequestOptions` | No | — | Request options applied to every call; overridable per method call |

## Caching

Every resource method takes an optional trailing `RequestOptions` argument, and the same shape can be set once as `defaults` on the client. Per-call values win over client defaults.

```typescript
export interface RequestOptions {
  revalidate?: number | false;  // Next.js ISR window, in seconds
  tags?: string[];              // Next.js cache tags, for revalidateTag()
  cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache' | 'only-if-cached';
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
```

```typescript
// Cache everything for 60s by default…
const client = new SimplerDevelopment({ siteId: 42, defaults: { revalidate: 60 } });

// …but keep navigation for an hour, and tag it for targeted invalidation.
const nav = await client.navigation.get({ revalidate: 3600, tags: ['nav'] });

// …and never cache a preview fetch.
const draft = await client.pages.get('pricing', { cache: 'no-store' });
```

`revalidate` and `tags` map onto Next.js's `fetch` extensions. They are inert in other runtimes: when neither is set the SDK omits the `next` key from the request init entirely, so non-Next fetch implementations see a plain init object. Note that Next.js rejects `cache: 'no-store'` combined with `revalidate` — pick one.

## Resources and methods

### `client.config`

```typescript
client.config.get(): Promise<SiteConfig>
```

Returns the full site bundle: metadata, branding, CSS vars, navigation tree, and `storeEnabled` flag.

### `client.branding`

```typescript
client.branding.get(): Promise<{ branding: Branding; cssVars: CssVars }>
```

Returns the brand color palette, logo URLs, typography settings, and `cssVars` — a `Record<string, string>` of CSS custom properties (`{ '--brand-primary': '#00B3A6', … }`). In React it can be handed straight to a `style` prop:

```tsx
const { branding, cssVars } = await client.branding.get();
return <html style={cssVars as React.CSSProperties}>…</html>;
```

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
client.pages.get(slug: string): Promise<Post>
```

`list` is equivalent to `posts.list` filtered to `postType = "page"`.

`get` fetches a single published page. The v1 API has no `/pages/{slug}` route — `/posts/{slug}` resolves any post type — so `pages.get` reads through the posts endpoint and applies the same `postType = "page"` filter `list` uses. A slug belonging to a blog post throws `NotFoundError` rather than returning a post from a page route.

```typescript
// Rendering a CMS-authored marketing page in a Next.js route
import { NotFoundError } from '@simplerdevelopment/sdk';

try {
  const page = await client.pages.get(slug);
  return <BlockRenderer content={page.content} />;
} catch (err) {
  if (err instanceof NotFoundError) notFound();
  throw err;
}
```

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

## Stability

This package is **pre-1.0**. The REST v1 surface it wraps is expected to stay stable, but resource shapes and error types may still shift between minor versions without a deprecation cycle. Pin an **exact** version (no `^`/`~`) in production code, and check `CHANGELOG.md` before bumping. `1.0.0` will signal a frozen public API and semver-honored breaking-change policy going forward.
