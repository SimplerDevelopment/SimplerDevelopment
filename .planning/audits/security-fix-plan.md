# Security Fix Plan — simplerdevelopment2026

Companion to `security-audit-2026-05-06.md`. Organizes fixes into waves so they can be parallelized without edit conflicts.

## Wave 1 — Quick wins, low blast radius (parallel, ~11 agents)

Each unit owns a non-overlapping set of files. Each agent: edits, runs `tsc --noEmit`, reports back concisely.

| # | Unit | Files (owned exclusively) | Audit refs |
|---|---|---|---|
| W1.1 | **Cron + Resend fail-open invert** | `app/api/cron/process-embeddings/route.ts`, `app/api/cron/renew-drive-watches/route.ts`, `app/api/cron/renew-gmail-watches/route.ts`, `app/api/cron/drive-sync/route.ts`, `app/api/cron/expire-mcp-pendings/route.ts`, `app/api/cron/brain-daily-notes/route.ts`, `app/api/email/webhooks/route.ts` | C2, H20 |
| W1.2 | **Auth-gate legacy/utility routes** | `app/api/users/route.ts`, `app/api/users/[id]/route.ts`, `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`, `app/api/tags/route.ts`, `app/api/upload/route.ts`, `app/api/analyze-site/route.ts` | C1, C3, C5 |
| W1.3 | **Token hashing + migration** | `lib/db/schema/auth.ts`, `app/api/portal/forgot-password/route.ts`, `app/api/portal/reset-password/route.ts`, `app/api/portal/invite/accept/route.ts`, `app/api/portal/team/route.ts`, new Drizzle migration | H3 |
| W1.4 | **Open redirect + session.maxAge** | `lib/auth.ts`, `app/portal/login/page.tsx` | H1, M (session) |
| W1.5 | **SSRF guard wiring (non-kanban)** | `lib/mcp/tools/cms.ts`, `lib/mcp/tools/tickets.ts`, `lib/html-asset-import.ts`, `app/api/portal/tools/pitch-decks/[id]/generate/route.ts`, `lib/brain/analyze-attachment.ts` | C6 |
| W1.6 | **Inbound email hardening** | `app/api/email/inbound/route.ts` only (boot assert + MAX_LOOPS) | C7, C8 (inbound), C9 partial |
| W1.7 | **Chat MAX_LOOPS + boot asserts (other secrets)** | `app/api/portal/ai/chat/route.ts`, `lib/preview-token.ts`, `lib/pm-notifications.ts` | C8 (chat), H4, H27 |
| W1.8 | **Cross-tenant batch A** | `app/api/storefront/[siteId]/checkout/route.ts`, `app/api/public/booking/[slug]/book/route.ts`, `app/api/portal/cards/[id]/comments/route.ts` | H6, H7, mentions |
| W1.9 | **Cross-tenant batch B + assertOwnedById helper + kanban SSRF** | `lib/security/assert-owned.ts` (new), `lib/mcp/tools/crm.ts`, `lib/mcp/tools/kanban.ts` (FK + SSRF), `lib/brain/mcp-sdk-adapter.ts`, `app/api/portal/crm/deals/[id]/route.ts`, `app/api/portal/cards/[id]/route.ts` | H11, C6 (kanban) |

**W1.9 actual completion status:**
- ✅ `lib/security/assert-owned.ts` created with `assertStageInClient`, `assertPipelineInClient`, `assertContactInClient`, `assertCompanyInClient`, `assertColumnInProject`, `assertProjectInClient`, `assertUserVisibleToClient`, `filterUserIdsVisibleToClient` + `OwnershipError`.
- ✅ `app/api/portal/crm/deals/[id]/route.ts` PUT — FK validation wired for stageId/pipelineId/contactId/companyId/ownerId.
- ✅ `lib/mcp/tools/kanban.ts` `kanban_card_attach_file_from_url` — SSRF guard wired.
- ⏳ Deferred to W2.11: MCP `crm_deals_update`, `crm_deals_move_stage` FK validation in `lib/mcp/tools/crm.ts`.
- ⏳ Deferred to W2.11: MCP `kanban_create_card`, `kanban_move_card` `columnId` validation in `lib/mcp/tools/kanban.ts`.
- ⏳ Deferred to W2.11: `brain_create_task` ownerId validation in `lib/brain/mcp-sdk-adapter.ts`.
- ⏳ Deferred to W2.11: `app/api/portal/cards/[id]/route.ts` `replaceCardAssignees` — filter assignedTo to `filterUserIdsVisibleToClient`.
| W1.10 | **XSS quick fixes** | `app/portal/crm/deals/_components/DealDetailDrawer.tsx`, `app/api/portal/surveys/[id]/export/route.ts`, `app/api/media/proxy/[...path]/route.ts` | C10, H19, C4 |
| W1.11 | **Drizzle bump + audit report** | `package.json`, `bun.lock`, run `bun audit` | C11 |

**Files touched in Wave 1, all unique to one unit. No conflicts.**

After Wave 1: run `tsc --noEmit`, `bun test:tenancy`, `bun test:critical`. Commit per unit (one-feature-per-PR convention) onto `staging`.

## Wave 2 — Bigger / breaking changes (sequential, with user review)

These need user judgment because they could break consumers, require new env vars, or are migrations.

- W2.1 **Resend Svix verification + RESEND_WEBHOOK_SECRET enforcement** — needs `bun add svix` and prod env. (W1.1 already inverts the conditional.)
- W2.2 **Security headers in `next.config.ts`** — HSTS/XCTO/Referrer/Permissions-Policy + `poweredByHeader: false`. CSP in Report-Only first.
- W2.3 **Stripe/email webhook generic error responses** — could mask debugging.
- W2.4 **Domain-uniqueness migrations** — `clientWebsites.domain`, `websiteDomains.domain`, `pitchDecks.slug` partial-unique indexes; backfill collisions.
- W2.5 **DOMPurify integration** — `bun add isomorphic-dompurify`; sanitize proposal/contract/email-preview/pitch-deck preview rendering.
- W2.6 **`html-render` / `html-embed` admin gating** — requires capability decision.
- W2.7 **Tenant-rewrite Host validation** — middleware change, might break local dev hosts.
- W2.8 **Drizzle/Next/Anthropic-SDK major bumps** — local-test required, not a config-only fix.
- W2.9 **`.npmrc` + `.nixpacks.toml` switch to `bun install`** — Railway redeploy needed.
- W2.10 **API-key middleware: `required` mode + Origin allow-list** — touches every consumer of `withApiKeyAndCors`.
- W2.11 **Wire `assert-owned` helpers into remaining MCP tools** — `crm_deals_update`, `crm_deals_move_stage`, `kanban_create_card`/`move_card`, `brain_create_task`, `replaceCardAssignees`. (Helper exists; just needs sweep.)
- W2.12 **fast-xml-parser override** — pinning `>=4.5.0` resolves to 5.2.5 which still has GHSA-m7jm-9gc2-mpf2. Investigate AWS SDK upgrade path or pin to a specific patched 4.x version.

## Wave 3 — Architectural / longer-term

- Rate limiting (Upstash) for auth + email + MCP + survey endpoints.
- Inbound-email tool tiering (read-only safe-list + DKIM-verified at CF Worker + auto-reply scrubbing).
- Cookieless `usercontent.simplerdevelopment.com` subdomain for media proxy.
- CSP enforce mode (after 2 weeks Report-Only).
- AI tool tiering (`read | write | destructive | external_send`) + per-tool rate limit.
- CI security gate (`.github/workflows/security.yml` running `bun audit --high`).
- ESLint security plugin + `noUncheckedIndexedAccess`.
- Per-client fromEmail allow-list + DKIM verification UI.
- Multi-tenant systemic test sweep across all 328 portal routes.
- Per-tenant brain ingest sender allow-list.

## Wave 4 — Test additions (parallel, after Wave 1)

- No-auth API matrix integration test.
- Open-redirect Playwright spec.
- Token-hashing storage assertion.
- SSRF unit tests for `assertSafeUrl`.
- XSS regression for deal comments + proposals + contracts.
- CSV formula leader unit test.
- Cross-tenant gift-cert + FK smuggling tests (extend `bun test:tenancy`).
- Pitch-deck slug-collision test.
- Stripe/Resend webhook signature-rejection tests.
- LLM loop bound test.
