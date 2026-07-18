# Changelog

All notable changes to `@simplerdevelopment/sdk` are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). See the README's "Stability" section for this package's pre-1.0 versioning policy.

## 0.2.0

Driven by building a real marketing site on the SDK — each item below is a gap that blocked that build.

### Added
- `pages.get(slug)` — fetch a single published page. Previously `pages` could only `list()`, so rendering a CMS-authored page by slug was impossible without dropping to `posts.get()` and hand-checking the type. Reads through `/posts/{slug}` (the v1 API has no `/pages/{slug}` route) and enforces the same `postType = "page"` filter `list()` uses, so a blog slug no longer resolves on a page route.
- `RequestOptions` — per-call `revalidate`, `tags`, `cache`, `signal`, and `headers`, accepted as the trailing argument of every resource method, plus a client-wide `defaults` option. Per-call values override client defaults. Without this, adopting the SDK in a Next.js app meant losing ISR entirely, since every request was uncached.
- Test suite (vitest, 18 tests) covering retry-after parsing, request-option merge semantics, and the `pages.get` type guard. The package previously had none.

### Fixed
- `cssVars` is now typed `CssVars` (`Record<string, string>`) on `BrandingResponse` and `SiteConfig`. It was declared `string`, but the API has always returned an object of CSS custom properties — so the published type misrepresented every consumer's data. **Breaking** for anyone who wrote code against the incorrect `string` type.
- `Retry-After` handling now accepts the HTTP-date form (RFC 9110 §10.2.3) and clamps past dates to `0`. `parseInt` previously produced `NaN` for dates, which propagated into `RateLimitError.retryAfter` and broke backoff arithmetic. Malformed values fall back to 60s instead of partially parsing (`"120abc"` no longer yields `120`).
- A 2xx response with an unparseable body now throws `SDKError` instead of leaking a raw `SyntaxError` from `response.json()`.

## 0.1.0

Initial published release.

### Added
- TypeScript client for the SimplerDevelopment REST v1 read surface (`/api/v1/sites/{siteId}/…`).
- Resources: `config`, `branding`, `navigation`, `posts`, `pages`, `categories`, `tags`, `media`, `products`, `productCategories`, `blocks`.
- Typed error hierarchy (`SDKError`, `NotFoundError`, `UnauthorizedError`, `RateLimitError`) with `retryAfter` support on 429 responses.
- Dual CJS/ESM build with bundled type declarations (`tsup`).
- Apache-2.0 license; npm publishing configuration (`publishConfig`, `files`).
