---
type: spec
domain: integrations
status: proposed
date: 2026-06-22
sources:
  - lib/db/schema/auth.ts
  - lib/api-keys.ts
  - lib/api-key-middleware.ts
  - lib/mcp-auth.ts
  - lib/security/token-hash.ts
  - lib/plugins/rate-limit.ts
  - app/api/v1/sites/[siteId]/posts/route.ts
  - app/api/v1/sites/[siteId]/posts/[slug]/route.ts
  - app/api/v1/sites/[siteId]/categories/route.ts
  - app/api/v1/sites/[siteId]/products/route.ts
  - app/api/portal/websites/[siteId]/api-keys/route.ts
  - app/api/portal/websites/[siteId]/api-keys/[keyId]/route.ts
  - app/portal/settings/api-keys/page.tsx
---

# Feature: Public Developer Surface — API-Key Auth

## ⚠ Security finding — the two holes are now FIXED (57abb226, 2026-06-22)

Research found the headless content API **already exists** (`app/api/v1/sites/[siteId]/**`, 13 read routes) with a **partially-built** API-key layer that had two security holes: (1) `api_keys` stored the **raw key in plaintext**; (2) `withApiKeyAndCors` **passed through on a missing key** — so the v1 surface was effectively anonymous. **Both are now fixed** (commit 57abb226): keys are stored as `key_hash` (SHA-256) + `key_preview` (migration 10008 backfills then drops the plaintext column); a missing key now returns 401. Verified no internal code consumes `/api/v1/sites/**` (platform SSR uses `/api/public/**`), so require-key is not a breaking change. e2e: `gap-api-key-auth-coverage.spec.ts`.

**Still open from Phase 1:** per-key **scope enforcement** (the `requiredScope` middleware arg + per-route wiring) and the **portal key-management UI** (`app/portal/websites/[siteId]/developer/`). Phases 2 (Redis rate limit) + 3 (write surface) unchanged.

## Overview

Harden the headless content API with mandatory API-key auth, hashed at-rest storage, per-key scope enforcement, and robust rate limiting; add the missing portal management UI.

## Domain context

Read first: [[Integrations E2E Audit]]. Every `app/api/v1/sites/[siteId]/` route wraps its handler in `withApiKeyAndCors` (`lib/api-key-middleware.ts`), which extracts `Authorization: Bearer sd_live_…` / `x-api-key`, calls `validateApiKey` (`lib/api-keys.ts`), and applies an in-memory sliding-window limiter. **If no key is present it falls through to the handler.** The headless content API (all under `app/api/v1/sites/[siteId]/`): `posts`, `posts/[slug]`, `pages`, `categories`, `tags`, `media`, `blocks`, `branding`, `config`, `navigation`, `products`, `products/[slug]`, `product-categories`. The parallel `app/api/public/websites/[siteId]/**` set is the **unauthenticated legacy surface used by in-platform SSR** — NOT gated by this feature. Portal auth = NextAuth; MCP auth = `portalApiKeys` (hashed, `sd_mcp_` prefix, `lib/mcp-auth.ts` with `hasScope`). `lib/security/token-hash.ts` is the existing SHA-256 primitive.

## Problem

1. **Raw key storage** — `api_keys.key` persists the full token; a DB/replica/backup read yields usable credentials.
2. **Unauthenticated pass-through** — absent a key, the handler runs anyway → v1 is public.
3. **No scope enforcement** — `api_keys.scopes` exists but is never checked per route.
4. **No portal UI** for website-scoped key management (CRUD routes exist; no page).

## Goal

- All `app/api/v1/sites/[siteId]/**` require a valid `sd_live_…` key; missing ⇒ 401.
- Keys stored hashed (SHA-256), shown once on creation.
- Per-key scope list enforced per route.
- Per-key rate limit with standard headers (`X-RateLimit-*`, `Retry-After`).
- Portal create/preview/revoke UI.

## Design

- **Schema (`lib/db/schema/auth.ts`):** drop `api_keys.key`; add `keyHash` varchar(64) unique (SHA-256 hex) + `keyPreview` varchar(20) (first 12 + `…` + last 4), matching the `portalApiKeys` pattern. Migration: hash existing raw values into the new columns, drop `key` (or wipe-and-reissue — see Open Q).
- **`lib/api-keys.ts`:** add `hashApiKey` (sha256, mirror `hashPortalApiKey`); `validateApiKey` looks up by `keyHash`; preview from the raw token.
- **`lib/api-key-middleware.ts`:** `if (!key) return 401`; after lookup, `hasScope(record.scopes, requiredScope)` (import from `lib/mcp-auth.ts`). `withApiKeyAndCors` gains an optional `requiredScope` (default `'content:read'`).
- **CRUD:** existing portal routes gain PATCH (name/scopes/rate-limit) + soft-revoke (`active=false`, `revokedAt`). POST returns the raw key exactly once.
- **Portal UI:** new `app/portal/websites/[siteId]/developer/page.tsx` (table + create dialog with scope checkboxes + show-once modal + revoke), mirroring `McpApiKeysManager`.
- **Rate limiting:** reuse `checkRateLimit` (in-memory OK for Phase 1); headers on every v1 response; `Retry-After` on 429.
- **Scopes:** `content:read` (posts/pages/categories/tags/media/blocks/config/navigation/branding), `store:read` (products/product-categories), `content:write` (reserved). Default `['content:read']`.

## Phasing

- **Phase 1 (local; security fix)** — schema migration (drop raw key, add hash+preview); `hashApiKey` + hash-lookup; POST stores hash+preview, returns raw once; middleware enforces key-required + scope; portal developer page; PATCH + revoke.
- **Phase 2 (external: Redis)** — replace the in-memory limiter with Upstash sliding window (interface unchanged) for multi-region/horizontal scale.
- **Phase 3 (future)** — `content:write` routes behind the write scope, optionally with `requireCmsApproval`-style staging.

## Key decisions (ADR-style)

- **SHA-256, not bcrypt** — keys are 256-bit random, not passwords; no brute-force surface (consistent with `token-hash.ts`/`mcp-auth.ts`).
- **Gate v1, leave `app/api/public/**` open** — the public routes feed the platform's own SSR; gating them breaks rendering.
- **Reuse `hasScope` from `mcp-auth.ts`** (or lift to `lib/scopes.ts`) — scope syntax already defined/tested.
- **Soft-revoke** (`active=false` + `revokedAt`) — preserves audit; `lastUsedAt` shows prior use.

## Open questions

1. **Backfill vs invalidate** existing raw `api_keys` rows on migration — wipe-and-reissue is safer/simpler; backfill is friendlier if a key is in active use. Decide before generating the migration.
2. Expose `content:write` in the Phase 1 UI (no write routes yet) or hide until Phase 3?
3. Per-site key count cap (e.g. 10) before distributed rate limiting?
4. Formally deprecate `app/api/public/**` in favor of v1+key once stable?

## Verification plan

- Unit: `hashApiKey` round-trip; `validateApiKey` rejects unknown/expired/inactive; `checkRateLimit` allow/deny/reset.
- Integration: POST returns raw key once; GET shows preview only; revoke sets inactive.
- Integration: v1 posts with no key ⇒ 401; valid `content:read` ⇒ 200; key missing `store:read` ⇒ 403 on `/products`; over limit ⇒ 429 + `Retry-After`.
- E2E `@critical`: create key in UI → use in fetch → posts → revoke → fetch ⇒ 401.
- Security regression: `\d api_keys` confirms the raw `key` column is gone post-migration.
