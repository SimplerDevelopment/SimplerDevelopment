---
type: adr
domain: chat-realtime
status: accepted
date: 2026-06-25
sources:
  - packages/realtime-server/src/server.ts
  - packages/realtime-server/src/auth.ts
  - packages/realtime-server/src/persistence.ts
  - packages/realtime-server/src/handlers.ts
  - packages/realtime-server/src/doc-shared.ts
  - packages/realtime-server/Dockerfile
  - packages/realtime-server/railway.toml
  - app/api/realtime/token/route.ts
  - lib/realtime/client.ts
  - lib/realtime/internal-publisher.ts
  - components/portal/visual-editor/CollaborationProvider.tsx
  - app/portal/tools/pitch-decks/[id]/_components/DeckCollaborationProvider.tsx
  - app/portal/email/campaigns/[id]/_components/EmailCollaborationProvider.tsx
---

# ADR: Host Yjs realtime collaboration as a standalone Railway service

## Status

Accepted — dev environment deployed and smoke-tested (2026-06-25). Staging and production services not yet provisioned.

## Context

SimplerDevelopment needs real-time collaborative editing (multiple concurrent users on the same document) for three entity types: posts (visual editor), pitch decks (deck editor), and email campaigns (email campaign editor). The chosen CRDT library is **Yjs** with the standard **y-websocket** sync protocol, which requires a long-lived WebSocket server that keeps in-memory `Y.Doc` instances alive per open document.

The platform's existing infrastructure is:
- **Next.js app on Vercel** — the app/portal/api layer
- **Postgres on Railway** — the primary data store; `posts.content`, `pitch_decks.slides`, and `email_campaigns.block_content` are the source-of-truth columns
- **MCP server** — stateless Streamable-HTTP; exposes portal tools to AI clients and agents

Three hosting approaches were evaluated.

## Decision

**Run the Yjs WebSocket/CRDT layer as a standalone long-lived Node.js service in the existing Railway project, self-hosted with the `ws` package and `y-protocols`, persisting Y.Doc snapshots back to the existing Postgres columns.**

The implementation lives in `packages/realtime-server/` — a separate Node package deployed as its own Railway service (see `packages/realtime-server/Dockerfile` and `packages/realtime-server/railway.toml`). The three-process topology:

1. **Next.js app (Vercel)** — issues short-lived 5-minute JWTs via `app/api/realtime/token/route.ts` (signed with `REALTIME_JWT_SECRET`). Resolves `clientId` tenancy and a read/write scope at token-issue time (portal role `viewer` = read-only; all other roles = write). The Next app handles **no WebSocket traffic** for collab.

2. **`packages/realtime-server/`** — standalone Node `ws` server. Maintains one in-memory `Y.Doc` per `(entityType, entityId)` pair. Validates the JWT in `packages/realtime-server/src/auth.ts` (the URL room path must equal the token's `docKey` claim). Relays peer updates via the y-websocket sync + awareness protocol in `packages/realtime-server/src/handlers.ts`. Debounce-flushes a Postgres snapshot every 2 s via `packages/realtime-server/src/persistence.ts`.

3. **Postgres** — remains the canonical source of truth. `posts.content`, `pitch_decks.slides`, and `email_campaigns.block_content` are what the realtime server writes back to; the in-memory Y.Doc is the live ephemeral layer on top.

**MCP/agent write fan-out:** `lib/realtime/internal-publisher.ts` POSTs the current DB state to the realtime-server's privileged `/internal/apply` endpoint, guarded by an `X-Internal-Secret: <REALTIME_INTERNAL_SECRET>` header. This makes agent-authored changes appear live in any open editor without a page refetch. V1 tradeoff: the publisher sends the full desired array state (full-replace, not a CRDT diff) — agent writes are authoritative; in-flight peer edits to the same array lose.

**Feature flag via env presence:** if `REALTIME_JWT_SECRET` is unset in the Next app, `POST /api/realtime/token` returns `503 REALTIME_NOT_CONFIGURED`. Clients treat this as collab simply being off; editors fall back to non-collaborative mode without errors.

## Consequences

**Easier:**
- Postgres stays the source of truth. Losing in-memory Y.Docs on a redeploy is a minor UX disruption (clients reconnect and re-sync), not data loss.
- Full control of tenancy and auth: `clientId` scoping and the read/write permission model are enforced at token-issue time in our own Next.js route, not delegated to a third party.
- No per-seat or per-connection cost; scales with the Railway plan.
- Reuses the existing Railway + Postgres footprint — no new vendor, no new billing account.
- The feature is safely off in any environment that omits `REALTIME_JWT_SECRET`; collab can be provisioned per-environment incrementally.

**Harder / accepted trade-offs:**
- **Every environment** (dev, staging, production) needs its own realtime-server Railway service, with matching `REALTIME_JWT_SECRET`, `REALTIME_INTERNAL_SECRET`, `NEXT_PUBLIC_REALTIME_URL`, and `REALTIME_INTERNAL_URL` env vars configured in the Next app. Currently only the dev environment is provisioned.
- The v1 `/internal/apply` is full-state-replace, not a CRDT merge. Agent writes are authoritative — in-flight human edits to the same Y.Array lose. Acceptable for v1 where agent writes are rare and intentionally authoritative; a proper CRDT diff path is a future revision.
- Operating the WebSocket server (monitoring, crash recovery, resource limits) falls to us, not a managed service.

**Operational gotcha — Railway `$PORT` binding (commit `002ee4d2`):**

Railway injects the public-facing port as the `PORT` env var at runtime — not a fixed port number. The realtime-server initially bound only `REALTIME_PORT` and ignored `PORT`, so Railway's healthcheck probed the wrong port and the first deploy reported "service unavailable" despite the process listening correctly. Fixed in `packages/realtime-server/src/server.ts` by reading `process.env.PORT ?? process.env.REALTIME_PORT ?? 3030`. **Rule for future Railway-deployed services: always bind `$PORT` first.**

## Alternatives considered

**Alternative A — Run inside the Next.js app on Vercel:**

Vercel serverless functions are request-scoped and time-limited. They cannot hold a long-lived WebSocket connection open between requests, and in-memory `Y.Doc` state cannot survive across invocations. The y-websocket protocol requires a persistent, stateful server. This alternative is architecturally impossible on the Vercel serverless runtime.

**Alternative B — Hosted CRDT provider (Liveblocks / PartyKit / Hocuspocus Cloud):**

Rejected on three grounds: (1) introduces a new vendor and per-connection or per-seat pricing at a stage where usage is uncertain; (2) delegates tenancy and auth enforcement to a third party rather than enforcing `clientId` scoping ourselves at JWT-issue time; (3) requires treating the hosted provider as source of truth or building a sync bridge between it and the existing Postgres columns — those columns (`posts.content`, `pitch_decks.slides`, `email_campaigns.block_content`) are deeply integrated with MCP tools, revision history, and public renderers and must remain authoritative.

## Related

- Domain map: [[Chat, Realtime & Voice]]
- Consumers: [[Visual Editor]] · [[Pitch Decks]]
- Package: `packages/realtime-server/` (Dockerfile + railway.toml)
