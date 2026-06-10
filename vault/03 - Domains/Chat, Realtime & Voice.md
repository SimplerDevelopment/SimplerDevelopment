---
type: domain-map
domain: chat-realtime
status: active
date: 2026-06-09
sources:
  - lib/chat/
  - lib/realtime/
  - packages/realtime-server/
---

# Domain: Chat, Realtime & Voice

Three related but distinct real-time capabilities: (1) a visitor-facing embeddable web chat widget with an agent inbox, (2) a Yjs CRDT collaboration layer for the visual editor, and (3) an OpenAI Realtime API voice assistant for portal users.

## Purpose

- **Chat**: Allows site visitors to open a live conversation via an embedded widget. Portal agents reply from a unified inbox. Postgres LISTEN/NOTIFY drives SSE to both sides; no external pub/sub broker required.
- **Realtime collab**: Synchronises Y.Doc state (blocks, slides) across concurrent editors in the visual editor. A standalone Yjs WebSocket server (`packages/realtime-server/`) runs on Railway; the Next.js app never handles WebSocket upgrades for collab.
- **Voice**: Portal users speak to an OpenAI Realtime (WebRTC) assistant that can read/write CRM, tasks, and Company Brain. Tool execution is gated by portal role and a server-signed confirm token for mutations.

## Key entry points

| File | Role |
|---|---|
| `lib/chat/realtime.ts` | Postgres NOTIFY publisher + LISTEN subscriber helpers (SSE backend) |
| `lib/chat/token.ts` | HMAC-signed visitor ephemeral tokens (24h TTL) |
| `lib/chat/rate-limit.ts` | In-memory sliding-window rate limiter (10 msgs / 10s per visitor) |
| `lib/realtime/client.ts` | Browser `RealtimeClient` class + `useRealtimeDoc` / `useLocalAwareness` hooks |
| `lib/realtime/doc-model.ts` | Yjs data model — `EntityType`, `docKey`, `blocksToYArray`, `slidesToYArray` |
| `lib/realtime/internal-publisher.ts` | MCP fan-out: builds Y update from current DB state, POSTs to `/internal/apply` |
| `lib/realtime/comments-broadcast.ts` | Awareness-piggyback broadcast for document comment events |
| `lib/realtime/use-comments.ts` | React hook: fetch/thread/optimistic-CRUD for `document_comments` |
| `lib/voice/tools.ts` | Curated tool set for the voice assistant (search_brain, CRM, tasks) |
| `lib/voice/confirm-token.ts` | HMAC-signed two-phase confirm token for voice mutations (5m TTL) |
| `packages/realtime-server/src/server.ts` | Standalone Yjs WebSocket server; deployed on Railway |
| `packages/realtime-server/src/auth.ts` | JWT handshake verification (docKey-bound, 5m TTL) |
| `packages/realtime-server/src/persistence.ts` | Debounced Postgres snapshot flushing (2s) |

## Data model

Two schema modules in `lib/db/schema/`:

**`lib/db/schema/chat.ts`** — visitor web chat
- `chat_widgets` — one per site (`siteId` unique), stores greeting, position, color, `brainEnabled` flag (schema-only for now)
- `chat_conversations` — keyed by `clientId`, tracks `visitorId` (localStorage UUID), `status` (`open|assigned|closed`), `assignedUserId`
- `chat_messages` — append-only; `authorKind` is `visitor|agent|system`; `attachments` JSON column reserved

**`lib/db/schema/collab.ts`** — document collaboration
- `document_comments` — threaded, anchor-aware comments on `post|deck|email` entities; `anchor` JSON (`blockId`, `slideIndex`, `x/y`, `fieldPath`); keyed by `clientId`
- Y.Doc snapshots are NOT stored in a separate table; `packages/realtime-server` writes back directly to `posts.content`, `pitch_decks.slides`, `email_campaigns.block_content`

## API surface

### Chat routes (Next.js)

| Route | Auth | Description |
|---|---|---|
| `POST /api/public/chat/start` | none | Creates conversation, issues visitor token |
| `POST /api/public/chat/messages` | visitor token | Appends visitor message, triggers NOTIFY |
| `GET /api/public/chat/stream` | visitor token | SSE stream for `chat_conv_${id}` channel |
| `GET /api/portal/chat/conversations` | NextAuth | Inbox listing (filter by status/assignee) |
| `GET/PATCH /api/portal/chat/conversations/[id]` | NextAuth | Conversation detail + status/assign |
| `GET/POST /api/portal/chat/conversations/[id]/messages` | NextAuth | Agent reply, triggers NOTIFY on both channels |
| `GET /api/portal/chat/inbox-stream` | NextAuth | SSE stream for `chat_inbox_${clientId}` channel |
| `GET/POST/PATCH /api/portal/chat/widgets/[id]` | NextAuth | Widget config CRUD |

### Realtime collab routes (Next.js)

| Route | Auth | Description |
|---|---|---|
| `POST /api/realtime/token` | NextAuth | Issues 5-min JWT for the Yjs WebSocket server |
| `GET/POST /api/portal/realtime/comments/[id]` | NextAuth | Document comments CRUD |
| `GET /api/portal/realtime/comments` | NextAuth | Comment listing for an entity |

### WebSocket topology

```
Browser                Next.js App               packages/realtime-server (Railway)
  |                        |                               |
  |-- POST /api/realtime/token (NextAuth) -->              |
  |<-- { token, wsUrl } -------------------------          |
  |                                                        |
  |-- WS wss://<REALTIME_HOST>/<docKey>?token=... ------> |
  |<-- Yjs sync (y-websocket protocol) <----------------> |
  |                                                        |
MCP / internal publisher:                                  |
  |-- POST <REALTIME_INTERNAL_URL>/internal/apply ------> |
     (X-Internal-Secret header, base64 Y update body)
```

The Next.js app never upgrades WebSocket connections for collab. All browser-to-Y-doc traffic goes directly to the Railway service. The `NEXT_PUBLIC_REALTIME_URL` env var controls what URL the browser connects to (`ws://localhost:3030` in dev).

### Voice routes (Next.js)

| Route | Auth | Description |
|---|---|---|
| `POST /api/portal/voice/session` | NextAuth (write) | Mints OpenAI Realtime client secret; bakes tool list server-side |
| `POST /api/portal/voice/tool` | NextAuth | Executes a voice tool; two-phase confirm for mutations |

## MCP tools

No dedicated MCP tools for chat or voice. The realtime collab domain has an **indirect** MCP hook via `lib/realtime/internal-publisher.ts`: after any MCP post/deck/email mutation, `publishEntityFromDb` re-reads the entity and pushes the full Y state to `/internal/apply` so open editor sessions update live. The env vars `REALTIME_INTERNAL_URL` and `REALTIME_INTERNAL_SECRET` gate this; both must be set or publishes silently skip (MCP writes still succeed).

## UI surfaces

| Surface | Path | Notes |
|---|---|---|
| Embeddable visitor chat widget | `app/widget/chat/page.tsx` + `app/widget/chat/chat-bootstrap.tsx` | Rendered in an iframe on public sites |
| Portal inbox list | `app/portal/inbox/page.tsx` | SSE-driven via `/api/portal/chat/inbox-stream` |
| Portal inbox conversation | `app/portal/inbox/[id]/page.tsx` | Agent reply UI |
| Portal chat widget settings | `app/portal/inbox/widgets/[id]/page.tsx` | Widget config editor |
| Voice assistant | portal-wide | Browser WebRTC to OpenAI; tools relayed through `/api/portal/voice/tool` |

Document comments UI lives inside the visual editor (`components/portal/visual-editor/`) rather than a standalone page.

## Tests & gates

**Coverage floor**: `lib/chat/**/*.ts` — 70% lines/statements/functions, 60% branches (same tier as billing/ai/esign). Defined in `vitest.config.ts`; currently informational (enforcement blocked by vitest 4.0.18 integration-coverage issue — see `tests/CLAUDE.md`).

**Unit tests** (all in `tests/unit/`):
- `chat-realtime.test.ts`, `chat-token.test.ts`, `chat-rate-limit.test.ts`
- `realtime-doc-model.test.ts`, `realtime-bindings.test.ts`, `realtime-internal-publisher.test.ts`, `realtime-internal-publisher-extra.test.ts`, `realtime-use-comments.test.tsx`
- `voice-confirm-token.test.ts`, `voice-tools.test.ts`, `voice-live-meeting-adapter.test.ts`, `use-realtime-voice-coverage.test.ts`
- `app-widget-chat-bootstrap.test.tsx`, `api-portal-ai-chat-route.test.ts`, `api-portal-realtime-comments-route.test.ts`, `api-realtime-token-and-posts-id-route.test.ts`

**Integration tests** (in `tests/integration/`):
- `api/portal/chat/agent-reply.test.ts`, `api/portal/chat/conversations.test.ts`
- `api/public/chat/chat-flow.test.ts`, `api/public/chat/stream.test.ts`
- `api/realtime/comments.test.ts`, `api/realtime/token.test.ts`

**E2E** (in `tests/e2e/`):
- `web-chat.spec.ts`, `realtime-collab.spec.ts`, `portal-ai-chat.spec.ts`, `portal-ai-chatbot-lifecycle.spec.ts`

## Cross-domain dependencies

- **Visual Editor** (`components/portal/visual-editor/`, `app/portal/websites/[siteId]/posts/[id]/edit`): the primary consumer of `lib/realtime/client.ts` and `lib/realtime/comments-broadcast.ts`. The visual editor mounts `useRealtimeDoc` and wires `useCommentsRealtime` through the Yjs awareness channel.
- **CMS & Blocks** (`lib/blocks/`, `posts.content`): Y.Doc root key `"blocks"` maps directly to the `Block[]` array stored in `posts.content`. `lib/realtime/doc-model.ts` owns the round-trip serialisation.
- **Company Brain & AI** (`lib/ai/`): voice `search_brain` tool proxies to `GET /api/portal/brain/search`. Chat widget has a `brainEnabled` column on `chat_widgets` for future AI-first-line integration.
- **CRM** (`lib/crm/`): voice tools `list_open_deals`, `search_contacts`, `create_contact` proxy to CRM REST routes.
- **AI credits / plan gate** (`lib/ai/`): voice session minting checks `checkAiPlanGate` + `hasCredits` before issuing an OpenAI client secret.

## Invariants & gotchas

- **Separate Postgres connection for LISTEN**: `lib/chat/realtime.ts` allocates its own `postgres-js` client (`max:1, idle_timeout:0`) rather than sharing the Drizzle pool. The Drizzle pool is `max:1`; sharing it would park the only connection on LISTEN and starve all queries.
- **Rate limiter is in-memory**: `lib/chat/rate-limit.ts` will not share state across multiple Next.js instances. Upgrade to Redis when horizontal scaling is needed.
- **Realtime server is NOT in this Next.js process**: it is a separate Node.js service deployed on Railway. `REALTIME_JWT_SECRET` is shared between both. A 503 from `POST /api/realtime/token` (code `REALTIME_NOT_CONFIGURED`) means `REALTIME_JWT_SECRET` is unset; the client should treat collab as disabled.
- **MCP writes are authoritative (full-replace)**: `publishEntityFromDb` sends the entire Y state, not a diff. In-flight human edits to the same Y.Array lose to an MCP write. Intentional v1 tradeoff.
- **Voice tool execution requires both phases for mutations**: `requiresConfirm:true` tools return `needs_confirmation` on first POST; the widget must send back `confirmToken` for the second POST. The token is HMAC-bound to the exact `(tool, args, userId, clientId)` tuple; tampered args will fail verification.
- **Y.Doc entity types**: only `post`, `deck`, and `email` are valid; the JWT's `docKey` claim is validated against this set in `packages/realtime-server/src/auth.ts`.
- **All chat tables are tenancy-scoped by `clientId`**. Run `bun test:tenancy` after any chat data-access change.

## Planning notes

- `brainEnabled` on `chat_widgets` is schema-only — AI first-line replies (Company Brain answering before a human) are not yet wired.
- `attachments` on `chat_messages` is a JSON column reserved for future file support; always returns `[]`.
- Voice metering is gate-only (v1): precise per-session audio-token accounting from `response.done` is documented as a follow-on.
- Y.Doc nested-key conflict resolution is last-write-win at field level. Upgrading hot keys (e.g. rich-text `props.body`) to `Y.Text` is a future revision that will not break the wire format.

## Related

[[Visual Editor]], [[CRM]], [[Company Brain & AI]], [[CMS & Blocks]]
