---
type: spec
domain: agentic
status: proposed
date: 2026-06-29
sources:
  - simplerdevelopment-agents/src/mastra/index.ts
  - simplerdevelopment-agents/src/mastra/mcp/sd-mcp.ts
  - simplerdevelopment-agents/src/mastra/agents/brain-agent.ts
  - simplerdevelopment-agents/src/mastra/agents/portal-assistant.ts
  - simplerdevelopment-agents/src/run-portal.ts
  - simplerdevelopment-agents/src/run-brain.ts
  - lib/mcp-auth.ts
  - lib/db/schema/auth.ts
  - lib/db/schema/audit.ts
  - lib/mcp/server.ts
  - app/api/mcp/route.ts
  - lib/ai/mastra/brain-agent.ts
  - app/api/portal/brain/agent-mastra/route.ts
---

# Feature: Multi-Tenant Agents Service

## Overview

Turn the standalone `simplerdevelopment-agents/` Mastra service into a **multi-tenant sub-service of the main app**: the app invokes it over Railway's private network, passing a short-lived, single-tenant token per request; the agents service forwards that token to the app's MCP, so every tool call resolves to exactly the right `clientId`. The agents process holds **no long-lived tenant secrets** and stays stateless w.r.t. tenancy.

This was provisioned as a separate Railway service (`agents`) precisely so long-running / timeout-prone agent loops don't run inside Vercel/serverless request limits. The app already runs the *same* agents in-process (`lib/ai/mastra/brain-agent.ts`) and is already per-tenant there — the separate service's only justification is dedicated long-running runtime, so this spec must preserve that as the reason-to-exist.

## Decisions locked (2026-06-29 → grilled 2026-06-30)

- **Architecture:** separate token-forwarding service (not in-process-only, not hybrid).
- **Tenant credential:** short-lived minted token per call (reuse `oauth_access_tokens` infra), not a long-lived per-tenant key.
- **Q1 Token mint:** add an internal M2M mint helper — extract `lib/oauth/issue.ts` → `mintInternalAccessToken({clientId,userId,scopes,resource,ttl})` that inserts one `oauth_access_tokens` row via `generateAccessToken()` (`lib/oauth/server.ts:41`), **no refresh token**, audience-bound (`resource`) to the agents service, backed by a seeded system `agents` `oauth_clients` row. Reuses the existing `resolveOAuthToken` validation path unchanged. **TTL sized to max run (~30 min)** — not 5 min — so it can't expire mid-run; re-mint-on-401 in the agents `fetch` wrapper is the upgrade path if runs ever exceed the bound. Do NOT reuse the interactive `/oauth/token` route (PKCE/consent/refresh = wrong shape).
- **Q2 Cutover:** **long-running jobs only** through the service in v1; keep the fast in-process path (`lib/ai/mastra/brain-agent.ts`) for short interactive chat. Full consolidation deferred to [[Unify AI Tool Surfaces]].
- **Q3 Response mode:** **single blocking generate** (generous timeout), result persisted by the caller. No streaming in v1.
- **Q4 Build:** pin a minimal **`railway.toml` (nixpacks)** in `simplerdevelopment-agents/` — explicit bun install, `mastra build` (verify needed) + `mastra start`, healthcheck. **Remove the stray `package-lock.json`** so only `bun.lock` drives installs.
- **Q5 Failure:** treat runs as **background jobs — fail + retry via the cron/queue trigger** with backoff; log to audit/run-history. **No silent in-process fallback** (long jobs can't run there). Re-mint-on-401 upgrade path.
- **Q6 First workload:** **`brainAgent` workflow, cron/job-triggered** is the v1 vertical slice (wire + tenancy-test end-to-end on the heaviest flow). `portalAssistant` stays in-process for now.
- **Invariant:** the app mints the token bound to the **authenticated session's `clientId`** before calling agents — the agents service never selects/overrides `clientId`. No cross-tenant key, ever.

## Domain context

Read first: [[Agentic OS Audit Trail]] / Agentic OS notes. Invariants from the code trace:

- **App MCP tenancy is token-derived and must not change.** `app/api/mcp/route.ts:37` → `resolvePortalFromRequest` (`lib/mcp-auth.ts:133`). `sd_mcp_…` keys resolve via `resolvePortalApiKey` (`lib/mcp-auth.ts:48-85`) against `portal_api_keys.keyHash` → NOT-NULL `clientId` FK (`lib/db/schema/auth.ts:81-100`). `sd_oauth_…` tokens resolve via `resolveOAuthToken` (`lib/mcp-auth.ts:92`) against `oauth_access_tokens` (`lib/db/schema/audit.ts:72-85`, has `clientId` NOT NULL + `resource` for RFC 8707 audience binding + `expiresAt`). Every tool handler scopes `WHERE clientId = ctx.client.id` and the audit wrapper logs `ctx.client.id` + `ctx.keyId` (`lib/mcp/server.ts:75-85`). **One token = one tenant. This invariant is the whole design — do not add a cross-tenant key.**
- **Agents MCP client is currently single-tenant + static.** `simplerdevelopment-agents/src/mastra/mcp/sd-mcp.ts:19-31` builds one module-level `MCPClient` with a static `requestInit` bearer (`SD_MCP_API_KEY`). Both `brain-agent.ts` and `portal-assistant.ts` share it.
- **Agents server has NO inbound auth today.** It's stock `mastra start` on port 4111 (`package.json`), exposing `POST /api/agents/:id/generate` + `/api/workflows/:id/run`, completely open. Making it private + authenticated is a **hard requirement** of this work, not optional.
- **Agents are on-demand.** One trigger → one `generate`/workflow run, no loop/queue (`src/run-portal.ts:29`, `src/run-brain.ts:19-20`).
- **`@mastra/mcp@1.12.0` natively supports per-request auth** via `HttpServerDefinition.fetch: MastraFetchLike` `(url, init, requestContext) => Response` — the third arg is the same `RequestContext` passed to `agent.generate(msg, { requestContext })`. No workaround needed.
- **Tenancy gate:** `bun test:tenancy` after any data-access change; this touches token issuance + cross-service auth → also security-sensitive (stays on Opus, not delegated).

## Problem

The agents service can only ever act as one `clientId` (one static `SD_MCP_API_KEY`), and is unauthenticated and unwired from the app. It cannot serve multiple tenants, and exposing it as-is would be an open RCE-adjacent surface (any reachable caller runs any agent against whatever tenant the static key maps to).

## Goal

- The main app invokes the agents service per user request, carrying that user's tenant identity.
- Each agent → MCP call carries a short-lived token scoped to exactly that tenant; the app's MCP resolves `clientId` unchanged.
- The agents service is reachable **only** by the app (private network + internal shared secret); it holds no long-lived tenant secret.
- Tenancy regression suite (`bun test:tenancy`) stays green; no cross-tenant data path is introduced.

## Proposed approach

### 1. App-side: short-lived token minting (security-sensitive — Opus)
Add a helper that, given an authenticated session (→ `clientId`, `userId`, scopes), mints a short-lived `sd_oauth_…` token in `oauth_access_tokens` (audience-bound to the agents `resource`, ~5 min `expiresAt`, minimal scopes for the invoked agent). **Open question for grill:** does an issuance helper already exist (OAuth `/token` path) or must we add a first-class internal-mint function?

### 2. App-side: agents client (`lib/ai/agents-client.ts`)
POST to `${SD_AGENTS_URL}/api/agents/:id/generate` (or `/workflows/:id/run`) over the private network with:
- `X-Internal-Secret: <SD_AGENTS_INTERNAL_SECRET>` (proves caller is the app),
- body carrying `requestContext: { token: <minted tenant token> }`.
Wire the existing brain surface (`app/api/portal/brain/agent-mastra/route.ts`) to call the service for long-running work (keep in-process for short interactive calls per the "hybrid is out, but the in-process agent stays as the short-path" note — **grill:** confirm cutover scope).

### 3. Agents-side: inbound auth middleware (`src/mastra/index.ts` server config)
Reject any request without a valid `X-Internal-Secret`; extract the tenant token from the request and place it into Mastra `RequestContext`. Service must refuse to start without `SD_AGENTS_INTERNAL_SECRET` set.

### 4. Agents-side: per-request MCP token (`src/mastra/mcp/sd-mcp.ts`)
Swap static `requestInit` → `fetch: MastraFetchLike`; read `requestContext.get('token')` and set `Authorization: Bearer <token>` per call. Remove the hard dependency on a static `SD_MCP_API_KEY` (keep only as an optional local/dev/CLI fallback).

### 5. Railway wiring (mirrors the realtime pattern already shipped)
- `agents`: pin `PORT=4111`; add generated `SD_AGENTS_INTERNAL_SECRET`; **no public domain** (private only). Drop/empty `SD_MCP_API_KEY`.
- `app`: `SD_AGENTS_URL = http://${{agents.RAILWAY_PRIVATE_DOMAIN}}:${{agents.PORT}}`, `SD_AGENTS_INTERNAL_SECRET = ${{agents.SD_AGENTS_INTERNAL_SECRET}}`.

## Open questions — RESOLVED (grilled 2026-06-30)

All six resolved; see **Decisions locked** above. (Q1 internal M2M mint helper + ~30min TTL · Q2 long-running only · Q3 blocking · Q4 railway.toml nixpacks · Q5 fail+retry · Q6 brainAgent workflow first.)

Remaining implementation-level TBDs (decide in-build, not blocking):
- Exact scopes granted to the seeded `agents` `oauth_client` and per-run token (least-privilege for the brain workflow's tool set).
- Which cron/queue actually fires the brainAgent job (reuse the durable workflow-run drainer vs a dedicated cron).
- Whether `mastra start` requires a preceding `mastra build` step in the Railway build.

## Build phases

**Status (2026-06-30, branch `feat/multi-tenant-agents`):** P1 ✅ (`lib/oauth/issue.ts` — no migration, idempotent self-seed; 4 unit tests) · P2 ✅ (`lib/ai/agents-client.ts`; 3 unit tests) · P3 ✅ (`server.middleware` in `simplerdevelopment-agents/src/mastra/index.ts`) · P4 ✅ (`sd-mcp.ts` static→`fetch` per-request token) · **P4b** ✅ (softened `sdTools()` gate for multi-tenant mode) · P5 ✅ (`simplerdevelopment-agents/railway.toml` + removed `package-lock.json`) · P7 ✅ (`app/api/cron/brain-agent-per-tenant/route.ts` + `vercel.json` entry; iterates clients, gates `isBrainEntitled`, mints as `clients.userId`, read-only scope). New app code typechecks clean; 7 unit tests green. **Remaining:** P6 Railway env (4 vars, needs `railway login`) · runtime-verify `requestContext.token` reaches `sdMcp.listTools()` on a live stack · `bun test:tenancy` in CI (local DB port conflict blocked it; branch adds only new files, modifies no existing tenant route) · commit + PR.

1. **App — token mint** (Opus, security): extract `lib/oauth/issue.ts`, seed `agents` system `oauth_client`, `mintInternalAccessToken` (~30min TTL, audience-bound, no refresh). Unit-test TTL/scope/audience.
2. **App — agents client** (Opus): `lib/ai/agents-client.ts` — private-network POST with `X-Internal-Secret` + `requestContext.token`; blocking; fail+retry semantics.
3. **Agents — inbound auth** (Opus, security): middleware in `src/mastra/index.ts` verifying `SD_AGENTS_INTERNAL_SECRET`, token → `RequestContext`; refuse start without the secret.
4. **Agents — per-request MCP token** (Sonnet, mechanical): `sd-mcp.ts` `requestInit` → `fetch: MastraFetchLike` reading `requestContext.get('token')`; drop static `SD_MCP_API_KEY` (dev fallback only).
5. **Agents — build pin** (Sonnet, mechanical): `railway.toml` + remove `package-lock.json`.
6. **Railway wiring** (Opus): pin `agents.PORT=4111`, gen `SD_AGENTS_INTERNAL_SECRET`, set `app.SD_AGENTS_URL`/`SD_AGENTS_INTERNAL_SECRET`, drop `agents.SD_MCP_API_KEY`; no public domain for agents.
7. **Wire brainAgent job** (Opus): cron/queue trigger → mint → agents-client → persist result; fail+retry.
8. **Gates:** `bun test:tenancy` + round-trip integration (app→agents→MCP resolves correct `clientId`) + `bun test:critical`.

## Test / gate plan

- `bun test:tenancy` (token→clientId path, no cross-tenant leak).
- Unit: token mint (TTL/scope/audience), `fetch` injection picks the right token from context, inbound middleware rejects missing/forged secret.
- Integration: app→agents→MCP round trip resolves correct `clientId`.
- `bun test:critical` before declaring done.

## Out of scope (v1)

- Per-tenant separate agents deployments (this design serves all tenants from one process — that's the point).
- The stubbed long-running queue/loop (agents stay on-demand).
