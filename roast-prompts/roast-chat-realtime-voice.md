# Roast: Chat, Realtime & Voice — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
Three real-time capabilities bundled under one domain: (1) a visitor-facing embeddable web-chat widget with a unified agent inbox, backed by Postgres LISTEN/NOTIFY over SSE — no external pub/sub broker; (2) a Yjs CRDT collaborative editing layer for the visual post/deck/email editor, served by a standalone WebSocket service on Railway; and (3) a portal-side voice assistant that connects to OpenAI Realtime (WebRTC), can read/write CRM, tasks, and Company Brain, and includes an optional meeting-mode that captures shared-tab audio, mixes it with mic input, and auto-extracts decisions and tasks into the Brain review queue. The voice assistant is fully built but not yet mounted in the portal layout.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS — they want visitor chat, collaborative editing for their team, and an AI voice shortcut inside the portal without paying Intercom, Stream, and an AI assistant vendor separately.
- **End user:** For web chat: the agency's site visitors and the agency team replying from the inbox. For collab: multiple portal users editing content simultaneously. For voice: portal power users who prefer talking over typing.
- **Monetization:** Web chat and collab are part of the core SD subscription (table stakes for an all-in-one). Voice assistant is an AI-credit-metered add-on: session minting already gates on `checkAiPlanGate` + `hasCredits`; per-session audio-token accounting is the obvious next metering hook.

## The edge
- **Zero external broker for chat:** Postgres LISTEN/NOTIFY driving SSE means no Pusher/Ably bill and no fan-out service to operate — the infra story is one Postgres and one Railway Yjs pod, both already required for other reasons.
- **Collab is first-class on content the platform already owns:** Y.Doc keys map directly onto `posts.content`, `pitch_decks.slides`, and `email_campaigns.block_content` — the round-trip serialisation (`lib/realtime/doc-model.ts`) is SD-specific, not a generic add-on bolted onto someone else's editor.
- **MCP fan-out closes the human↔AI edit loop:** `lib/realtime/internal-publisher.ts` pushes full Y state to open editor sessions after any MCP mutation, so AI-written content appears live in the portal editor without a reload — a capability point tools can't match because they don't own the content model.
- **Meeting mode ties voice to Company Brain:** transcripts auto-land in the Brain meeting pipeline and produce decisions/tasks in the review queue — not just a recording, but structured operational output.
- **Voice mutations are two-phase confirmed:** HMAC-signed confirm tokens scoped to `(tool, args, userId, clientId)` prevent replay and prompt-injection attacks — a level of rigor most voice-AI demo projects skip.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Intercom (chat + inbox), Crisp (chat + canned replies + analytics), Stream (chat SDKs), Drift (conversational marketing), Twilio (programmable voice/messaging).
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
The voice assistant's meeting-mode-to-Brain pipeline is genuinely differentiated — but it assumes agencies will trust an AI voice assistant with CRM and task mutations inside their portal, and will tolerate a two-phase confirm UX, before the widget is even mounted or the env vars documented. The entire feature is built but ships zero to customers today; the council should attack whether the "build it all, ship none of it" posture reflects real market pull or speculative over-engineering.
