# sd-chat-mobile — Gap Roadmap

_Generated 2026-06-17. Compares the mobile client against the portal's (`simplerdevelopment2026`) actual product intent and sequences the work to close the gap._

## The intent, in one line
The portal is an **all-in-one agency client-operations hub** whose defining feature is an **AI assistant that acts (read/write) across ~30 domains**, with a **human-in-the-loop approval queue** gating AI-authored writes. The mobile app today renders the *design* of that product but implements a small, mostly read-only slice of its *intent*.

Coverage today: **~5 of ~30 domains** (AI chat, Brain subset, Media, Approvals, Settings) — and several of those screens are still on mock data.

---

## Sequencing principle
Fix the **core value loop** before adding breadth. The assistant-acts → approve-on-phone loop (P0) is already 80% built on the client (`ToolUseCard`, `tool_call`/`tool_result` parsing, full approvals UI) and only blocked by the server. Unblocking it lights up the most product value per unit of work. Breadth (more domains) comes after the loop works and the existing surface is de-mocked.

Effort scale: **S** ≈ <1 day · **M** ≈ 2–4 days · **L** ≈ 1 week+ · **XL** ≈ multi-week.

---

## P0 — Make the assistant *do* things (the core value)

### P0.1 — Streaming tool-calling (portal Phase 4) · **L** · _portal-side_
**Gap:** `/api/portal/ai/chat/stream` is deliberately text-only; tools are disabled. The mobile assistant can talk but cannot create a deal, move a card, draft an email, book, or edit a note.
- Port the agentic loop from the non-streaming `/ai/chat` route: wire `PORTAL_TOOLS` + `executePortalTool`, handle multi-turn tool fan-out over SSE, emit `tool_call` / `tool_result` frames (the protocol the mobile client already parses).
- Reuse the existing credit deduction / plan-gate / BYOK / persistence plumbing already in the stream route.
- **Unblocks:** P0.2 and the entire approvals value loop (P0.3).
- **Dependency:** none — highest leverage item in the whole roadmap.

### P0.2 — Render tool activity in chat · **S** · _mobile-side_
**Gap:** client parses tool frames but the live path may not surface them richly.
- Verify `ToolUseCard` renders `tool_call`/`tool_result` inline as they stream; show in-progress → result states; collapse long outputs.
- **Dependency:** P0.1 emitting frames.

### P0.3 — Close the approval loop · **M** · _both_
**Gap:** mobile keys are minted `requireCmsApproval: false`, scopes `['*']`, so nothing the mobile user does ever creates a pending change. The fully-built approvals inbox only reflects external-agent activity.
- Decide the trust model: either mint mobile keys with `requireCmsApproval: true` for destructive scopes, or add a per-action confirm that routes writes through `mcpPendingChanges`.
- Verify the inbox/detail/bulk/history screens render real mobile-originated approvals end-to-end.
- **Dependency:** P0.1 (no writes to approve until the assistant can write).

### P0.4 — Push notifications + lock-screen approval · **L** · _both_
**Gap:** HANDOFF Tier 3, unstarted. This is what makes P0.3 compelling on mobile (approve a write from the lock screen).
- Expo push tokens → portal device registry; push on new pending-change; lock-screen approve/reject action.
- **Dependency:** P0.3.

---

## P1 — De-mock and harden the existing surface

### P1.1 — Replace mock data in primary screens · **M** · _mobile-side_
**Gap:** these still render `lib/mock/*`: `(tabs)/index.tsx` (chats), `(tabs)/brain.tsx`, `(tabs)/media.tsx`, `(tabs)/you.tsx`, `approvals/index.tsx`, `brain/suggestions.tsx`, `chat/[id].tsx`.
- Wire each to its existing typed query hook; keep mock only as Storybook/dev fallback.

### P1.2 — Credits & billing visibility · **S–M** · _both_
**Gap:** credits gate the assistant, but there's no mobile API or screen to view balance / ledger / top up. "Credits & usage" and "Stripe Billing" rows in the You tab lead nowhere.
- Add `lib/api/billing.ts` (balance, ledger); wire the credits screen + the in-chat `AI_CREDITS_EXHAUSTED` upsell to a real top-up flow.

### P1.3 — Settings rows that lead nowhere · **S** · _mobile-side_
**Gap:** Members, Invitations, Calendar sync, Google Workspace, Stripe Billing rows are decorative.
- Either wire to portal endpoints (team list/invite, integrations status) or hide until backed.

### P1.4 — Fix workspace switching · **S** · _portal-side_
**Gap:** HANDOFF Tier 1 — switching clients requires re-sign-in on the current branch (missing `/api/portal/api-keys/switch`). Rebase/cherry-pick from staging.

---

## P2 — Brain to full fidelity

### P2.1 — Add missing Brain entities · **M–L** · _both_
**Gap:** mobile Brain = notes/decisions/people/glossary/search/suggestions. Portal Brain also has **documents, meetings, tasks, goals, initiatives, org units, topics, playbooks, relationships graph, review queues, saved searches** — none browsable on mobile.
- Prioritize by client value: likely **tasks → meetings → documents → goals/initiatives** first. The `RelatedGraph` component and `meet-assistant` screen hint at intended scope.

---

## P3 — Domain breadth (one vertical at a time)

Each missing domain is a self-contained mobile vertical: list screen + detail + the relevant portal hooks. Sequence by how often a client needs it on the phone:

1. **CRM** (contacts/companies/deals/pipeline) — **L** — highest "run my business mobile" value.
2. **Projects / Kanban / Sprints** — **L** — board view, move cards, comment.
3. **Tickets / Support** — **M** — clients reply to support threads on the go.
4. **Booking** — **M** — view/manage appointments.
5. **Email campaigns**, **Surveys**, **Pitch decks**, **CMS/Posts**, **Storefront**, **Automations**, **Branding**, **Services**, **Hosting**, **Publishing**, **Experiments** — **M each**, lower mobile urgency (most are authoring-heavy, better on desktop; mobile = review/approve via P0.3).

> Note: P0.1 partially covers breadth "for free" — once the assistant can call any tool, a client can *ask* the assistant to do CRM/kanban/email work conversationally even before a dedicated screen exists. Dedicated screens are for browse/manage ergonomics the chat can't match.

---

## Out of scope / needs a product decision

- **Group chat with human participants.** README + mockups promise it; the portal has **no multi-participant human-chat schema** (`aiConversations` is strictly 1:1 user↔AI). This is either (a) cut from the mobile story, or (b) a net-new portal feature (XL: schema, realtime, presence). Decide before building any group-chat UI.

## Quick wins (do anytime)
- Bump the stream model from `claude-opus-4-7` to current (Opus 4.8 / Fable 5).
- Native follow-ups from HANDOFF Tier 2: audit export via `expo-file-system` + `Sharing`, voice/Whisper capture, native Supersede/glossary-edit modals.

---

## At-a-glance order
1. **P0.1** streaming tools (portal) → unblocks everything
2. **P0.2 / P0.3** render tools + close approval loop
3. **P0.4** push + lock-screen approval
4. **P1.1** de-mock core screens · **P1.2–1.4** billing/settings/workspace fixes
5. **P2** full Brain
6. **P3** domain breadth, CRM first
7. _decision:_ group chat in/out
