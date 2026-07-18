# Changelog

All notable changes to `@simplerdevelopment/sdk` are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). See the README's "Stability" section for this package's pre-1.0 versioning policy.

## 0.1.0

Initial published release.

### Added
- TypeScript client for the SimplerDevelopment REST v1 read surface (`/api/v1/sites/{siteId}/…`).
- Resources: `config`, `branding`, `navigation`, `posts`, `pages`, `categories`, `tags`, `media`, `products`, `productCategories`, `blocks`.
- Typed error hierarchy (`SDKError`, `NotFoundError`, `UnauthorizedError`, `RateLimitError`) with `retryAfter` support on 429 responses.
- Dual CJS/ESM build with bundled type declarations (`tsup`).
- Apache-2.0 license; npm publishing configuration (`publishConfig`, `files`).
