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

- [ ] Yjs CRDT collab session (multi-user editing) — needs spec
- [ ] Voice call integration — needs spec
- [ ] Real-time presence indicators — needs spec
- [ ] POST /api/portal/voice/session returns 402 when plan gate blocks or credits exhausted — needs spec

## Testing


## Blocked


## Passed

- [ ] Chat widget CRUD for entitled tenant ✓
- [ ] Yjs CRDT collab infrastructure exists ✓
- [ ] ✓ verified 2026-06-20 — POST /api/portal/voice/session rejects unauthenticated (401) (spec: cov-u49.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/voice/tool returns 400 for unknown tool name (spec: cov-u49.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/voice/tool rejects unauthenticated (401) (spec: cov-u49.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/voice/tool read tool executes immediately (no confirm phase, status=done) (spec: cov-u50.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/voice/tool mutation tool first-phase returns needs_confirmation + confirmToken (spec: cov-u50.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/voice/tool mutation tool second-phase with valid confirmToken returns status=done (spec: cov-u50.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/voice/tool mutation tool tampered confirmToken returns 400 (spec: cov-u50.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/public/chat/stream rejects missing or invalid visitor token (401) (spec: cov-u51.spec.ts)
- [ ] ✓ verified 2026-06-20 — DELETE /api/portal/realtime/comments/:id deletes a reply (author-only) (spec: cov-u51.spec.ts)
- [ ] ✓ verified 2026-06-20 — DELETE /api/portal/realtime/comments/:id on thread root cascades to all children (spec: cov-u51.spec.ts)
- [ ] ✓ verified 2026-06-20 — PATCH /api/portal/realtime/comments/:id body edit returns 403 for non-author (spec: cov-u51.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/realtime/token issues a valid JWT for entity type deck (spec: cov-u52.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/realtime/comments creates comment with slideIndex anchor (deck entity) (spec: cov-u52.spec.ts)

## Gaps Found

- [ ] chat_widgets.brainEnabled not wired to actual Brain retrieval — see [[Project Board]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]
- [ ] VoiceAssistant component built but not mounted in portal layout (PortalLayoutClient.tsx commented out) — voice feature is unreachable by end users
- [ ] OPENAI_REALTIME_MODEL and OPENAI_REALTIME_VOICE env vars absent from .env.example — operators cannot configure voice
- [ ] chat_messages.attachments column reserved but always returns [] — file attachment in web chat has no implementation path
- [ ] Voice audio-token metering is gate-only (v1) — precise per-session Realtime token accounting not yet implemented, silent under-billing risk
- [ ] GAP (no implementation): Chat widget Brain retrieval (brainEnabled flag wiring)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
