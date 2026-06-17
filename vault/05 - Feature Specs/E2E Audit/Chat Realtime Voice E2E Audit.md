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

## Testing


## Blocked


## Passed

- [ ] Chat widget CRUD for entitled tenant ✓
- [ ] Yjs CRDT collab infrastructure exists ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] chat_widgets.brainEnabled not wired to actual Brain retrieval — see [[Project Board]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
