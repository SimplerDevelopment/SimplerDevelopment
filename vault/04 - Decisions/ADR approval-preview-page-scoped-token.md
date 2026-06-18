---
type: adr
domain: esign-approvals
status: accepted
date: 2026-06-16
sources:
  - lib/preview-token.ts
  - app/approve/[token]/page.tsx
  - app/approve/[token]/PostPreview.tsx
  - app/sites/[domain]/[[...slug]]/page.tsx
  - tests/unit/lib-misc-batch-37h.test.ts
---

# ADR: Page-scoped preview token for public approval pages

## Status

Accepted

## Context

The visual editor's preview mode mints a short-lived HMAC token (`lib/preview-token.ts`) that unlocks the site renderer (`app/sites/[domain]/[[...slug]]/page.tsx`) for a single tenant's site. Before this change the token was site-wide: payload `preview:<siteId>:<day>`, valid for any page on that site for 24 hours.

The public MCP approval page (`app/approve/[token]/`) is unauthenticated — anyone with the approval URL can view it. When the approval page was updated to embed a live-site preview iframe (so reviewers see a faithful WYSIWYG render instead of a divergent `BlockRenderer`-in-a-card), the iframe URL necessarily carried a preview token.

Embedding the site-wide preview token in that iframe URL creates an information-disclosure risk: an external reviewer can copy the token from the URL and use it to enumerate all draft pages on the site for the rest of the 24-hour window. The reviewer is intentionally not an authenticated portal user, so they should not have access beyond the single page they were sent to approve.

## Decision

Add an optional `scope` parameter to `generatePreviewToken(siteId, scope?)` and `verifyPreviewToken(siteId, token, scope?)` in `lib/preview-token.ts`.

- When `scope` is supplied to `generatePreviewToken`, the HMAC payload becomes `preview:<siteId>:<scope>:<day>`. A token minted with a scope validates only for that exact scope value — it cannot be used to preview a different page path.
- When `scope` is supplied to `verifyPreviewToken`, the function accepts either the site-wide token (backward-compatible for the authenticated visual editor) or the narrow page-scoped token. Without a scope argument, only site-wide tokens are accepted (no regression for existing callers).

The public approval page (`app/approve/[token]/page.tsx`, `buildPostPreviewIframeSrc`) always mints a page-scoped token, using the post's slug as the scope. It additionally cross-checks that the post's `siteId` belongs to the same `clientId` as the approval link before minting any token (tenancy guard).

The site renderer (`app/sites/[domain]/[[...slug]]/page.tsx`) passes the resolved `pageSlug` as scope when verifying, so the narrowing is enforced server-side.

The authenticated visual editor continues to use site-wide tokens unchanged — it is a portal-authenticated route and needs to preview any page on the site.

## Consequences

Easier:
- A leaked approval iframe URL now validates for exactly one page, not the entire site's draft content.
- The change is backward-compatible: no existing callers break.
- The scoping mechanism is unit-tested (`tests/unit/lib-misc-batch-37h.test.ts`).

Harder / new invariants:
- **The public approval page must always use page-scoped tokens.** Never call `generatePreviewToken(siteId)` (unscoped) from `app/approve/[token]/page.tsx`. Enforce at code review.
- The site renderer's scope check means a scoped token for `"blog/hello"` will fail at the server if presented to `"about"`. Any future refactor that changes how slug is derived must keep both sides in sync.
- Two flavors of valid preview token now exist. Agents modifying `verifyPreviewToken` must preserve the dual-acceptance logic (site-wide token always valid; scoped token valid only for its own scope).

## Alternatives considered

**Accept the risk (site-wide token in the public iframe URL).** Rejected. The token lifespan is 24 hours and the approval flow is explicitly unauthenticated. The risk of a reviewer forwarding the approval URL to someone who then harvests all draft content is not hypothetical.

**Gate the preview iframe behind portal auth (require the reviewer to be logged in).** Rejected. The approval flow is designed to be usable by external clients and stakeholders who are not portal users. Adding auth breaks the primary use case.

**Issue a one-time-use signed URL with an even shorter TTL (e.g. 5 minutes).** Considered but not chosen. This would require a separate short-URL table (or Redis TTL), added infrastructure complexity, and breaks page refresh during review. The page-scoped HMAC approach is stateless and achieves the same principal bound without the operational overhead.

**Separate preview-token library for the approval path.** Rejected. The existing `lib/preview-token.ts` is the correct place; a parallel library would diverge and require dual maintenance. The optional `scope` param keeps the API surface minimal.

## Related

- Domain map: [[E-Sign & Approvals]]
- Implementation: commit `63795a77` on `feat/scribble-migration-roi`
- Test: `tests/unit/lib-misc-batch-37h.test.ts`
