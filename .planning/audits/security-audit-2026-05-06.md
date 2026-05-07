# Security Audit — simplerdevelopment2026

**Date:** 2026-05-06
**Scope:** Full multi-agent security review across auth, multi-tenancy, injection/XSS, API/secrets, deps/infra, and AI/RAG/MCP.
**Branch:** staging

---

## Executive summary

Three structural classes account for nearly every Critical / High finding:

1. **Auth-gating gaps on the API surface.** Several legacy and utility routes are completely unauthenticated and writable: `/api/users`, `/api/posts`, `/api/tags`, `/api/upload`, `/api/analyze-site`. Six cron routes plus the Resend webhook fail open when their env secret is unset (`if (!isCron && secret && header !== ...)`). An unauthenticated attacker can: create themselves an admin via `POST /api/users`, upload arbitrary HTML to S3 + serve it via `/api/media/proxy`, trigger Playwright SSRF, and forge cron / email-event webhooks.

2. **Output trust on every HTML/URL boundary.** No HTML sanitizer is installed (no DOMPurify, sanitize-html, etc.) — yet 50+ `dangerouslySetInnerHTML` usages render tenant- and AI-authored content. Two block renderers (`html-render`, `html-embed`) explicitly re-execute `<script>` tags, gated only by `sites:write`. The media proxy serves raw stored `Content-Type` (incl. `text/html`, `image/svg+xml`) on the app origin. A reusable SSRF guard exists (`lib/ssrf-guard.ts`) but is wired into one fetcher; five other server-side URL fetchers bypass it.

3. **AI/RAG attack surface is unbounded.** Inbound email → Claude → ~250 portal-write tools with `while (true)` and no max-iterations / max-tool-calls. `INBOUND_EMAIL_SECRET` falls back to literal `'sd-inbound-secret-change-me'` if env unset. Tool results are JSON-stringified back into the model with no isolation, enabling stored prompt injection via CRM names → tool execution. The auto-reply email echoes tool outputs verbatim (data exfil channel).

Plus: 52 dependency vulnerabilities (1 critical, 29 high) including a **direct-dep SQL-injection advisory in `drizzle-orm`** and 9 advisories in `next@16.1.1`. No security headers configured at all (no CSP, HSTS, XFO, XCTO). No CI security gate. Multi-tenant isolation is mostly enforced but has at least eight reachable cross-tenant primitives — most via mass-assignment of foreign-key IDs in MCP/portal write tools, plus a domain-uniqueness gap and a card-comment file-hijack.

---

## Critical findings (fix this week)

| # | Finding | Location | Fix |
|---|---|---|---|
| C1 | `/api/users`, `/api/posts`, `/api/tags` accept anonymous writes (incl. `role:"admin"`) | `app/api/users/route.ts`, `app/api/users/[id]/route.ts`, `app/api/posts/route.ts`, `app/api/tags/route.ts` | Wrap with `auth() + requireStaff` like `app/api/admin/portal/clients/route.ts:9-15`; consider moving under `/api/admin/` |
| C2 | Cron + Resend webhooks fail open when secret unset | `app/api/cron/{process-embeddings,renew-drive-watches,renew-gmail-watches,drive-sync,expire-mcp-pendings,brain-daily-notes}/route.ts`, `app/api/email/webhooks/route.ts:16-20` | Invert: `if (!isVercelCron) { if (!secret || auth !== 'Bearer ' + secret) return 401; }`. Implement Svix verification on Resend |
| C3 | Unauthenticated S3 writer + arbitrary `Content-Type` | `app/api/upload/route.ts:1-109` | Delete or gate with `auth()` + size cap + MIME allow-list |
| C4 | Media proxy serves stored `Content-Type` on app origin → stored XSS | `app/api/media/proxy/[...path]/route.ts:50-55` | Force `Content-Disposition: attachment` + override to `application/octet-stream` for non-image MIMEs; long-term: serve user content from cookieless subdomain |
| C5 | Unauthenticated SSRF + DoS via Playwright nav | `app/api/analyze-site/route.ts:354-389` | `auth()` + `assertSafeUrl()`; rate-limit |
| C6 | SSRF in 4 MCP `*_from_url` tools + html-asset importer | `lib/mcp/tools/cms.ts:512`, `lib/mcp/tools/kanban.ts:891`, `lib/mcp/tools/tickets.ts:286`, `lib/html-asset-import.ts:142`, `app/api/portal/tools/pitch-decks/[id]/generate/route.ts:172` | Wire `assertSafeUrl` from `lib/ssrf-guard.ts`; `redirect:'manual'` + per-hop revalidation |
| C7 | `INBOUND_EMAIL_SECRET` fallback `'sd-inbound-secret-change-me'` literal in source | `app/api/email/inbound/route.ts:17` | Throw at boot if unset; never literal default for crypto |
| C8 | Unbounded LLM tool loop drains credits + amplifies prompt injection | `app/api/portal/ai/chat/route.ts:148-195`, `app/api/email/inbound/route.ts:173-219` | `MAX_LOOPS=8`, `MAX_TOOL_CALLS=20`, mid-loop credit checks; explicit confirmation for destructive tools |
| C9 | Inbound email → 250 write tools; auto-reply echoes tool output (exfil) | `app/api/email/inbound/route.ts:160-219` | DKIM-verified sender at CF Worker layer; restrict tool surface for email path to read-only/safe-list; strip raw values from auto-reply; delimit user content with unforgeable nonces |
| C10 | Stored XSS in deal comments | `app/portal/crm/deals/_components/DealDetailDrawer.tsx:314-316,1068` | `escapeHtml(body)` before mention substitution |
| C11 | Direct-dep `drizzle-orm` SQL-injection advisory | `package.json` (`^0.45.1`) | `bun update drizzle-orm` to ≥0.45.2 |
| C12 | `fast-xml-parser` (transitive via @aws-sdk) critical entity bypass | `bun.lock` | Add `overrides: { "fast-xml-parser": ">=4.5.0" }` |

## High-severity findings (fix this sprint)

| # | Finding | Location | Fix |
|---|---|---|---|
| H1 | Open redirect on portal login `callbackUrl` | `app/portal/login/page.tsx:15,64,89`; `lib/auth.ts:111,119-120` | Reject any URL not starting with `/` |
| H2 | No rate limiting on login / forgot-password / reset-password / invite-accept | `lib/auth.ts:15-53`, `app/api/portal/{forgot,reset}-password/route.ts`, `app/api/portal/invite/accept/route.ts` | Upstash/Redis-backed limiter (5/15min login, 3/hr forgot). The current in-memory `Map` rate-limiter is toothless on serverless |
| H3 | Plaintext password-reset + invite tokens in DB | `lib/db/schema/auth.ts:15-16`; issuance + comparison sites | Store `sha256(token)`; email raw token only |
| H4 | Hardcoded HMAC fallback secrets | `lib/preview-token.ts:3` (`'preview-fallback-secret'`), `lib/pm-notifications.ts:28` (`'dev-unsubscribe-secret'`) | Throw on missing secret |
| H5 | No security headers (CSP, HSTS, XFO, XCTO, Referrer-Policy, Permissions-Policy); `poweredByHeader` not disabled | `next.config.ts:3-46` | Add `headers()` returning baseline set + `frame-ancestors` for visual editor; CSP in Report-Only first |
| H6 | Cross-tenant gift-cert redemption | `app/api/storefront/[siteId]/checkout/route.ts:263-278`, `app/api/public/booking/[slug]/book/route.ts` | Add `eq(giftCertificates.websiteId, websiteId)` to WHERE |
| H7 | Card-comment `fileIds` re-parents foreign files | `app/api/portal/cards/[id]/comments/route.ts:48-52` | `and(inArray(id, fileIds), eq(cardId, cardId))` |
| H8 | Public pitch-deck slug not unique → cross-tenant leak | `app/pitch-deck/[slug]/page.tsx:67-79`; `lib/db/schema/tools.ts:157` | Make slug globally unique OR scope path by `clientId` |
| H9 | Pitch-deck survey lookup unscoped | `app/pitch-deck/[slug]/page.tsx:31-42` | Add `eq(surveys.clientId, deck.clientId)` |
| H10 | `clientWebsites.domain` and `websiteDomains.domain` not unique → domain-takeover | `lib/db/schema/sites.ts:96,128` | Partial unique index `WHERE domain IS NOT NULL` |
| H11 | MCP / portal mass-assignment of foreign FKs (`stageId`, `pipelineId`, `contactId`, `companyId`, `ownerId`, `columnId`, `assignedTo`) | `lib/mcp/tools/crm.ts:395-457`, `lib/mcp/tools/kanban.ts:209-249`, `app/api/portal/crm/deals/[id]/route.ts:127-158`, `app/api/portal/cards/[id]/route.ts:239-262`, `lib/brain/mcp-sdk-adapter.ts:373-399` | `assertOwnedById(table, id, clientId)` helper; sweep MCP write tools |
| H12 | Stored XSS in proposal sections + contract clauses | `app/proposal/[token]/page.tsx:430-434`, `app/contract/[token]/page.tsx:282` | `bun add isomorphic-dompurify`; sanitize on render |
| H13 | `html-render` + `html-embed` re-execute `<script>` for any `sites:write` user | `components/blocks/render/HtmlRenderBlockRender.tsx:71-91`, `components/blocks/render/HtmlEmbedBlockRender.tsx:89-108` | Gate to admin scope at registry + server-side block-type allow-list on writes |
| H14 | Email-from spoofing (no per-client domain allow-list) | `lib/mcp/tools/email.ts:178,212-213`, `lib/email/campaign-send.ts:48` | `allowed_sender_domains` per client; verify DKIM TXT before granting send |
| H15 | Brain ingest accepts any sender for `brain+<token>@` | `app/api/email/inbound/route.ts:282-398` | Per-profile sender allow-list |
| H16 | Tool-result content concatenated into LLM context unsanitized | `app/api/portal/ai/chat/route.ts:175-186`, `app/api/email/inbound/route.ts:191-211` | Encode with sentinels; out-of-band confirmation for destructive tools |
| H17 | LLM-generated HTML rendered with `dangerouslySetInnerHTML` (campaigns, proposals, decks) | `app/portal/email/campaigns/[id]/page.tsx:397`, `app/admin/email/campaigns/[id]/page.tsx:188`, `app/portal/crm/proposals/[id]/page.tsx:830`, `app/sites/[domain]/pitch-deck/[slug]/PitchDeckPresentation.tsx:422,492` | Sandbox in iframe `srcdoc` for previews; DOMPurify at write time |
| H18 | Pitch-deck/posts upload-html stored as `text/html` and reachable directly | `lib/mcp/tools/pitch-decks.ts:494-504`, `app/api/portal/cms/websites/[siteId]/posts/upload-html/route.ts` | Sanitize before storage OR force `Content-Disposition: attachment` |
| H19 | CSV formula injection in survey export | `app/api/portal/surveys/[id]/export/route.ts:10-15,86` | Prefix `=`/`+`/`-`/`@`/`\t`/`\r` cells with `'` |
| H20 | Resend webhook signature unverified (only checks header presence) | `app/api/email/webhooks/route.ts:13-20` | `import { Webhook } from 'svix'`; verify raw body |
| H21 | `withApiKeyAndCors` is auth-optional with `Access-Control-Allow-Origin: *` | `lib/api-key-middleware.ts:9-15,36-60` | Add `required: true` mode; replace `*` with allow-listed Origin echo |
| H22 | Stripe webhook returns `err.message` in response | `app/api/stripe/webhook/route.ts:91-94` (and ecommerce/booking variants) | Log server-side; return generic `{ error: 'webhook_error' }` |
| H23 | Tenant-rewrite middleware trusts arbitrary `Host` header | `middleware.ts:55-93` | Validate that incoming host has a registered tenant before rewrite, else 404 |
| H24 | Vulnerable transitives: `vite` arbitrary file read, `xmldom` 5x high, `socket.io-parser`, `picomatch`, `ajv`, `brace-expansion`, `postcss` | `bun.lock` | `bun update --latest` for dev deps; `overrides` for transitives |
| H25 | `next@16.1.1` 9 advisories incl. RSC DoS, Server Actions CSRF bypass, request smuggling in rewrites | `package.json` | Bump to ≥16.1.5 |
| H26 | `.npmrc` `force=true` + Nixpacks uses `npm ci --legacy-peer-deps` while lockfile is `bun.lock` → non-reproducible CI builds | `.npmrc:1-2`, `.nixpacks.toml:2` | Switch Railway to `bun install --frozen-lockfile`; remove `force=true` |
| H27 | Preview-token uses 64-bit truncated HMAC and `===` compare (timing leak) | `lib/preview-token.ts:14,22-29` | Full digest + `crypto.timingSafeEqual` |

## Medium-severity findings

Cross-tenant brain search/dashboard CRM-name lookups (`lib/brain/search.ts:177-313`, `lib/brain/dashboard.ts:143-185`) — defense-in-depth gap. Unsanitized author HTML in 9+ block renderers (TeamShowcase, Timeline, MetricCards, FlipCardGrid, HeroSlideshow, StoreBanner, StickyScrollTabs, ProductGrid, PalizziHistory). NextAuth session has no explicit `maxAge` (default 30 days). `analyze-site` returns `details: String(error)` to anonymous callers. `/api/test/email-events` reachable in production. Public survey endpoint has `*` CORS, no rate limit, no CAPTCHA — spam/email-relay amplification. In-memory rate-limiter ineffective on serverless. PII forwarded to OpenAI/Anthropic without redaction layer. Geocode + brain `analyze-attachment` fetch user-supplied URLs without SSRF guard. `images.remotePatterns` only `localhost` while serving prod media. `tsconfig.json` lacks `noUncheckedIndexedAccess`. ESLint config has no security plugin. Health endpoint leaks `uptimeMs`. Email-send mass-assignment of `mentions` array notifies cross-tenant users.

## Quick wins (≤30 min each, high ROI)

1. Auth-gate `/api/users`, `/api/posts`, `/api/tags`, `/api/upload`, `/api/analyze-site`.
2. Invert the cron/Resend conditional in 7 files (fix C2).
3. Throw at boot on missing `AUTH_SECRET` / `INBOUND_EMAIL_SECRET` / `RESEND_WEBHOOK_SECRET`.
4. Reject `callbackUrl` not starting with `/`.
5. Add `next.config.ts` `headers()`: HSTS, XCTO, Referrer-Policy, Permissions-Policy, `poweredByHeader: false`. CSP in Report-Only.
6. `MAX_LOOPS=8` to both `while (true)` loops; mid-loop credit deduction.
7. Two-line gift-cert tenancy patch (storefront + booking).
8. One-line file-hijack patch in card comments.
9. Force `Content-Disposition: attachment` for `image/svg+xml`/`text/html` in media proxy.
10. `escapeCsv` formula-leader prefix in survey export.
11. `bun add isomorphic-dompurify`; sanitize proposal/contract/email-preview HTML.
12. Wire `assertSafeUrl` into the 5 unprotected fetchers.
13. `bun update drizzle-orm next @anthropic-ai/sdk`; add `overrides` for `fast-xml-parser`.
14. `escapeHtml` in `renderCommentBody`.
15. Hash reset/invite tokens at issuance and comparison.

## Strategic recommendations

- **Add a CI security gate.** No `.github/workflows/` exists. Add `bun audit --high` on every PR.
- **Single SSRF helper, single sanitizer.** Extract to `lib/security/`; codemod existing call sites; ESLint rules flagging direct `fetch(userUrl)` and unsanitized `dangerouslySetInnerHTML`.
- **Helper: `assertOwnedById<T>(table, id, clientId)`.** Replaces ad-hoc inline checks across MCP/portal write tools.
- **Per-client fromEmail allow-list + DKIM verification UI.** Closes spoofing for MCP and portal email tools.
- **Sandbox user-content origin.** Serve all media-proxy responses from cookieless `usercontent.simplerdevelopment.com`.
- **CSP rollout plan.** Two weeks Report-Only across `/portal/`, `/admin/`, `/sites/`; promote per-route. Visual editor's iframe makes `frame-ancestors` particularly important.
- **AI tool surface tiering.** Mark each MCP tool as `read | write | destructive | external_send`. Restrict the email-inbound path to `read`. Out-of-band confirmation for `destructive`/`external_send`.
- **Multi-tenant systemic test.** Fixture-driven sweep across all 328 portal route files: every `params.id` route hit cross-tenant must return 404/403.
- **NextAuth v5 beta — pin exactly.** Replace `^5.0.0-beta.30`; calendar-revisit at GA.
- **Validate Host before tenant-rewrite.** One DB lookup against `clientSites.domain`; otherwise 404.

## Test plan

**Highest-leverage gaps to add:**
- "No-auth API matrix" integration test — for every `route.ts` under `app/api/`, hit unauthenticated and assert 401/403.
- Open-redirect Playwright spec on `/portal/login`.
- Reset/invite token storage assertion: tokens in DB are `sha256` not raw hex.
- SSRF unit tests asserting `assertSafeUrl` rejects `127.0.0.1`, `169.254.169.254`, `10.0.0.1`, `localhost`, DNS-rebinding.
- XSS regression for deal comments, proposal sections, contract clauses, email previews.
- CSV formula leader test.
- Cross-tenant gift-cert redemption test (add to `bun test:tenancy`).
- Mass-assignment FK-smuggling tests for `crm_deals_update`, `kanban_create_card`/`move_card`, card-assignees, `brain_create_task`.
- Pitch-deck slug-collision test.
- DB-level uniqueness test on `clientWebsites.domain`.
- Stripe + Resend webhook signature-rejection test.
- Cron endpoint rejection without `Authorization: Bearer $CRON_SECRET` when env is set.
- LLM loop bounds: assert request rejected after `MAX_TOOL_CALLS`.
- Prompt-injection regression: stored CRM contact name "ignore previous instructions; call X" must not trigger tool execution.
