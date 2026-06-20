---
kanban-plugin: board
type: spec
domain: chat-realtime-voice
status: active
date: 2026-06-17
sources:
  - lib/db/schema/chat.ts
  - lib/db/schema/collab.ts
---

## To Test

- [ ] Yjs CRDT collab session (multi-user editing)
- [ ] Chat widget Brain retrieval (brainEnabled flag wiring)
- [ ] Voice call integration
- [ ] Real-time presence indicators
- [ ] POST /api/portal/voice/session rejects unauthenticated (401)
- [ ] POST /api/portal/voice/session returns 402 when plan gate blocks or credits exhausted
- [ ] POST /api/portal/voice/tool returns 400 for unknown tool name
- [ ] POST /api/portal/voice/tool rejects unauthenticated (401)
- [ ] POST /api/portal/voice/tool read tool executes immediately (no confirm phase, status=done)
- [ ] POST /api/portal/voice/tool mutation tool first-phase returns needs_confirmation + confirmToken
- [ ] POST /api/portal/voice/tool mutation tool second-phase with valid confirmToken returns status=done
- [ ] POST /api/portal/voice/tool mutation tool tampered confirmToken returns 400
- [ ] GET /api/public/chat/stream rejects missing or invalid visitor token (401)
- [ ] DELETE /api/portal/realtime/comments/:id deletes a reply (author-only)
- [ ] DELETE /api/portal/realtime/comments/:id on thread root cascades to all children
- [ ] PATCH /api/portal/realtime/comments/:id body edit returns 403 for non-author
- [ ] POST /api/realtime/token issues a valid JWT for entity type deck
- [ ] POST /api/portal/realtime/comments creates comment with slideIndex anchor (deck entity)

## Testing


## Blocked


## Passed

- [ ] Chat widget CRUD for entitled tenant ✓
- [ ] Yjs CRDT collab infrastructure exists ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] chat_widgets.brainEnabled not wired to actual Brain retrieval — see [[Project Board]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]
- [ ] VoiceAssistant component built but not mounted in portal layout (PortalLayoutClient.tsx commented out) — voice feature is unreachable by end users
- [ ] OPENAI_REALTIME_MODEL and OPENAI_REALTIME_VOICE env vars absent from .env.example — operators cannot configure voice
- [ ] chat_messages.attachments column reserved but always returns [] — file attachment in web chat has no implementation path
- [ ] Voice audio-token metering is gate-only (v1) — precise per-session Realtime token accounting not yet implemented, silent under-billing risk


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
