# Roast V2: Chat, Realtime & Voice — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

**V2 pivot summary (council-prescribed):** Unbundle and sequence. The prior brief pitched three surfaces as one cohesive "real-time module" — that framing is abandoned. This V2 treats them as three independent shipping decisions with different timelines and risk profiles, re-leads the edge on the MCP-fan-out + Brain coupling that no competitor in the agency-OS space can replicate, and carries one hard-gated legal blocker (meeting-mode consent) as an explicit GO-LIVE BLOCKER, not a roadmap item.

---

## The idea

**Module headline — the one uncopyable thing:** MCP fan-out pushes live Y.Doc/collab state into open editor sessions after any agent mutation, and voice sessions write structured output directly into the Company Brain review queue. The bare real-time transport is not unique — Webflow shipped MCP→live-canvas WebSocket sync in Feb 2026. What no competitor (GoHighLevel $297/mo, Intercom, Webflow) replicates is the **compound**: agent mutations fanned out live *and* routed into a Company Brain / CRM review queue, which requires co-owning the content model, the real-time layer, the Brain, and the agent surface simultaneously. The transport is table-stakes; the Brain coupling is the moat. Everything else in this module is sequenced beneath that anchor.

Three real-time capabilities, now sequenced independently:

**(1) SHIP NOW — Chat inbox + Yjs collab editor (core subscription).**
A visitor-facing embeddable web-chat widget with a unified agent inbox, backed by Postgres LISTEN/NOTIFY over SSE (no external broker). Plus a Yjs CRDT collaborative editing layer for the visual post/deck/email editor, served by a Railway WebSocket service. Both are production-ready. Together they are a bundled retention layer: the chat inbox absorbs the Intercom seat for agencies already living in SD (a cost-saver, not a feature-parity replacement — canned replies, CSAT, and analytics parity do not yet exist), and the Yjs collab layer replaces Stream SDKs with a first-party CRDT implementation that maps directly onto SD's block schema.

**(2) BETA, NOT BUILD — Voice assistant (closed beta, no meeting-mode).**
A portal-side voice assistant that connects to OpenAI Realtime (WebRTC), reads/writes CRM, tasks, and Company Brain, and uses HMAC-signed two-phase confirm tokens that bind the exact `(tool, args, user, client)` tuple — blocking arg-tampering between the confirm card and execution, and preventing the model from self-confirming (only a server-minted token for that exact call is accepted). These are stateless 5-min-TTL tokens, not a replay or prompt-injection defense. The widget is fully built. Go-to-market posture: mount it behind a feature flag, open a flat AI-credit closed beta to 3–5 power-user agencies, and let real sessions — not theory — decide whether two-phase confirm is friction or a trust primitive.

**(3) GATE/CUT — Meeting-mode (blocked until compliance gap is closed).**
The shared-tab audio capture + mic-mix + Brain-extraction pipeline exists in code but is not exposed to any customer. See Constraints — this is a hard GO-LIVE BLOCKER, not a backlog item.

---

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS — they want visitor chat, collaborative editing, and an AI voice shortcut without paying Intercom, Stream, and an AI assistant vendor separately.
- **End user:** For chat: agency site visitors and team members replying from a unified inbox. For collab: multiple portal users editing content simultaneously. For voice: portal power users who prefer talking over typing.
- **Monetization:**
  - Chat and collab are part of the core SD subscription — bundled add-ons that absorb the Intercom seat and Stream license for agencies already living in SD. The retention pitch is cost-absorption (not feature-parity replacement): a mid-sized agency paying Intercom Growth ($75/seat × 5) + Stream ($499/mo) + one AI assistant tool ($50+/mo) saves $1k+/mo by consolidating into SD. That saving is real without claiming inbox parity on surfaces (canned replies, CSAT, analytics) that do not yet exist.
  - Voice assistant is an AI-credit-metered add-on: `checkAiPlanGate` + `hasCredits` already gate session minting; per-session audio-token accounting is the next metering hook. Closed-beta pricing is flat credit draw, no seat charge — letting usage data set the rate.

---

## The edge

**Lead claim — MCP-fan-out routed into a Brain/CRM review surface (the compound no competitor ships).**
`lib/realtime/internal-publisher.ts` pushes full Y state to open editor sessions after any MCP mutation, so AI-authored content appears live in the portal editor without a reload. **V1 is last-writer-wins** — the agent's write is authoritative and in-flight peer edits to the same array are overwritten; a true CRDT merge of agent and human edits is deferred (do not pitch this as a "closed collaborative edit loop" yet). The bare WebSocket transport is not unique either — Webflow shipped MCP→live-canvas sync in Feb 2026. What requires co-owning the real-time layer, the block schema, the Brain, and the agent surface simultaneously — which only SD does — is the *compound*: that live fan-out terminating in a Company Brain / CRM review queue rather than just a canvas.

**Supporting claims:**

- **Zero external broker for chat:** Postgres LISTEN/NOTIFY over SSE means no Pusher/Ably bill and no fan-out service to operate. The infra story is one Postgres and one Railway Yjs pod — both already required for other reasons. Cost structure advantage is permanent, not temporary.
- **Collab is first-class on content the platform already owns:** Y.Doc keys map directly onto `posts.content`, `pitch_decks.slides`, and `email_campaigns.block_content`. The round-trip serialisation (`lib/realtime/doc-model.ts`) is SD-specific — not a generic add-on bolted onto an external editor. Switching cost is real.
- **Voice mutations are two-phase confirmed:** HMAC-signed confirm tokens scoped to `(tool, args, userId, clientId)` make each mutating call tamper-evident — they block arg-widening between the confirm card and execution and prevent the model self-confirming. They are stateless 5-min-TTL tokens, so they are explicitly **not** a replay or prompt-injection defense (injection happens upstream, on args the token validates as legitimate); the honest claim is "no silent AI writes — every mutation is a server-bound, tamper-evident, human-confirmed action," which most voice-AI implementations still skip. Whether agencies experience the confirm step as safety or friction is what the closed beta tests.
- **Brain coupling makes voice operationally useful, not just convenient:** Decisions and tasks from voice sessions land in the Brain review queue as structured output — not a transcript file, not a Notion doc. This is a retention argument GoHighLevel and Intercom cannot match because they don't own a Brain.

---

## Constraints

- Solo founder / tiny team; SD is a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must credibly absorb the cost of tools agencies already pay for — Intercom seats and Stream licenses — without overclaiming feature parity on surfaces (canned replies, CSAT, analytics) that do not yet exist. GoHighLevel ($297/mo all-in-one competitor) is the primary bundle comparison; Intercom is a cost-displacement story, not a replacement story.
- Time-to-first-dollar and maintainability by a tiny team both matter. Four real-time surfaces simultaneously is a maintenance overhead the prior brief underweighted.

**GO-LIVE BLOCKER — Meeting-mode consent/disclosure/quarantine gap (not yet closed):**
The shared-tab audio capture path captures third-party audio and routes it through OpenAI with no user consent flow, no explicit disclosure, and no Brain-write quarantine/human-review gate. This violates two-party-consent statutes in CA, FL, IL, and at least 11 other US states, and is non-compliant with GDPR Art. 6 (lawful basis). A solo founder cannot absorb a wiretap claim. Meeting-mode is **disabled in production and not marketed** until three concrete engineering+legal items are closed: (1) an explicit consent + disclosure UI that fires before any audio capture starts; (2) a Brain-write quarantine layer that routes meeting extractions to a human-review gate before committing them as decisions/tasks; (3) a legal sign-off on the consent language. This is committed, scoped work — not deferred indefinitely — but it gates the feature, not the other two legs.

---

## Roast it on two lenses

1. **Earns its place in the suite?** Does the sequenced approach (ship collab+chat now, beta voice, gate meeting-mode) represent a coherent retention play — or is splitting one "module" into three timelines a sign of unfocused scope? Does the MCP-fan-out claim hold up under scrutiny, or is it a capability nobody asked for?

2. **Could it stand alone? (Expected answer: No.)** No standalone ambition — bundled retention layer. The edge on every surface derives entirely from co-owning the block schema, the Brain, and the agent surface. Unbundled, Postgres SSE is a cost trick anyone copies; Yjs collab is a library; voice-to-CRM is a demo. The real competitor on the bundle is GoHighLevel at $297/mo, and the only durable answer is the MCP-fan-out + Brain coupling the council should pressure-test for depth, not the standalone case.

---

## Riskiest assumption to pressure-test

**De-risked posture (from prior council findings):**
The prior version's riskiest assumption — "the all-in-three bundle is coherent as a single product decision" — is resolved: it isn't, and the brief no longer pitches it that way.

**Current riskiest assumption:**
Agencies will adopt a two-phase confirm UX for voice-driven CRM and task writes — treating it as a trust signal rather than friction that kills the interaction. This has never been tested with a real user. The closed beta exists precisely to answer it. If confirm-step friction is too high, the voice assistant collapses to a read-only portal query tool; if agencies lean into it, it becomes a defensible "safe AI hands on my live data" pitch no competitor ships.

**Secondary assumption to attack:**
The Yjs collab editor's switching-cost argument assumes agencies edit content collaboratively in practice — not just aspirationally. If real session data from the Yjs pod shows low concurrent-user counts, the "lock-in" claim deflates. The voice-to-Brain coupling is the stronger retention argument; confirm the collab editor earns its Railway pod cost before the full suite goes to market.
