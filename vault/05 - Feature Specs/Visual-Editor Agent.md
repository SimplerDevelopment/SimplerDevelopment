---
type: spec
domain: visual-editor
status: planned
date: 2026-06-10
sources:
  - app/api/portal/ai/chat/route.ts
  - lib/blocks/registry.ts
  - lib/ai/block-schemas.ts
  - lib/db/schema/cms.ts
  - components/portal/visual-editor/CLAUDE.md
  - lib/ai/CLAUDE.md
  - lib/ai/portal-tools/classifier.ts
  - lib/ai/brain-tools/classifier.ts
---

# Feature: Visual-Editor / Block-Authoring Agent

## Overview

A specialist sub-agent — the first domain specialist under the hub-and-spoke topology decided in [[ADR agent-topology-router-not-domain-mesh]] — dedicated to block-content authoring in the portal. When a tenant issues a natural-language instruction against a page ("add a testimonial section", "make the hero headline shorter and add a CTA"), the portal chatbot's intent router detects the edit-page intent and delegates to this agent. The agent reads the post's typed block JSON, reasons over the block schema, proposes a validated diff, and returns it for human approval before any write occurs. Audience: portal (client-facing).

## Why this domain earns a specialist agent

The ADR's bar: a sub-agent must carry what a tool call cannot — its own specialized system context, its own multi-step reasoning loop, or its own model routing. Block authoring clears every criterion.

**Multi-step reasoning loop.** A block-edit request is not a single tool call. The loop is: read `posts.content` block JSON → reason over the typed block schemas (`lib/blocks/registry.ts` (118), `lib/ai/block-schemas.ts` (623)) → mutate typed block JSON without breaking the "blocks are universal" invariant → validate the proposed patch against the registry → return the diff for approval. Each step is conditional on the previous; the loop cannot be flattened into a single tool invocation.

**Heavy specialized system context.** The agent must carry the block-authoring rules from `components/portal/visual-editor/CLAUDE.md` and `lib/blocks/CLAUDE.md`: blocks are UNIVERSAL (never client-specific), block type registration is lockstep (TS interface in `types/blocks/index.ts` + slug in `SLUG_TO_CATEGORY` + render component in `lib/visual-editor/registry.ts` + production renderer in `app/sites/`), postMessage protocol must not be bypassed, new behaviour goes in `_hooks/` not the god-file shells. Fitting this context into a single chatbot tool description would be unwieldy and would pollute every other portal interaction with irrelevant tokens.

**Existing evidence.** Three prior investments already signal that block authoring needs specialization: the `simplerdev-block-type` skill (lockstep registration scaffolding), the `block-orchestrator` / `block-implementer` agent pattern referenced in `CLAUDE.md` (audit-drive / one-fix workers), and the nested `components/portal/visual-editor/CLAUDE.md` itself (a specialized context document that exists precisely because the domain is too loaded to describe inline).

## Domain context

Read first: [[Visual Editor]], [[CMS & Blocks]].

Key invariants that constrain this feature:

- `posts.content` is `{ blocks: Block[], version: "1.0" }` (defined in `lib/db/schema/cms.ts` (407)). The `Block` type lives in `types/blocks/index.ts`.
- Blocks are UNIVERSAL — never client-specific. The agent must refuse any instruction that would invent a client-specific block type.
- Block type registration is lockstep. Adding or mutating a block type touches `types/blocks/index.ts`, `lib/blocks/registry.ts`, `lib/visual-editor/registry.ts`, and `app/sites/` in concert. The agent proposes diffs only against existing registered block types; it does not scaffold new ones (that is `simplerdev-block-type`'s job).
- AI is never the source of truth (`lib/ai/CLAUDE.md`). All agent output flows through human review before persisting.
- Tenancy: every read and write is scoped to `siteId` / `clientId`. The agent inherits the authenticated tenant context from the chatbot's session.

## User stories

- As a portal client, I want to describe a page edit in natural language so that I do not need to locate and manually manipulate block JSON.
- As a portal client, I want to review the agent's proposed change as a diff before it is applied so that I remain in control of my content.
- As a portal developer, I want block-edit instructions routed to a specialist agent so that the chatbot's general tool loop is not burdened with 600+ lines of block-schema context on every request.

## Requirements

### Must have

- Given a `postId` and a natural-language instruction, read `posts.content`, reason over the registered block schemas, and return a proposed typed block-JSON diff.
- Validate the proposed diff against `lib/blocks/registry.ts` and `lib/ai/block-schemas.ts` server-side before returning it. Never trust raw model output as valid block JSON.
- Require human approval before calling the persist step. AI output is a proposal, not a write.
- Scope all reads and writes to the authenticated tenant's `siteId` / `clientId`. Run `bun test:tenancy` after any data-access change.
- Refuse instructions that would create client-specific block types. Respond with an explanation and the list of registered universal types.
- Integrate as a delegation target for the portal chatbot (`app/api/portal/ai/chat/route.ts` (309)): when the chatbot's intent classifier detects an "edit my page" intent, it delegates to this agent rather than invoking raw block CRUD tools.

### Nice to have

- Model routing: simple edits (change text in an existing block) stay on Haiku; structural changes (add/remove/reorder blocks) route to Sonnet — matching the Brain agent's classifier pattern (`lib/ai/brain-tools/classifier.ts`).
- RAG over approved/existing blocks for the active site to guide style consistency (separate from the registry schema, which covers type validity but not style).
- Streaming diff preview in the visual editor UI.

## Technical design

### Database changes

No new tables required for v1. Block content is already persisted as JSON in `posts.content` (`lib/db/schema/cms.ts` (407)). Approval state (pending diff) is held in memory for the duration of the conversation turn; if persistence is needed later, an `ai_block_proposals` table would be appropriate (out of scope for v1).

### API changes

Two options are under evaluation (see Open questions). The likely v1 shape is an agent handler at `app/api/portal/ai/block-agent/route.ts` (to be created), mirroring the Brain agent's route shape (`app/api/portal/brain/agent/route.ts`). It receives a `{ postId, instruction, conversationId }` payload, runs the loop, and returns `{ success: true, data: { diff, summary, requiresApproval: true } }` using the standard `{ success, data | error }` envelope.

Tenancy: `siteId` / `clientId` resolved from the authenticated session via `lib/active-client.ts` + site-resolver middleware, identical to other portal API routes.

### Portal / Admin UI

v1 exposes the diff as structured JSON returned to the chatbot widget (`components/portal/AIChatWidget.tsx`). A human-readable summary accompanies it. The chatbot widget renders an approval card ("Apply these changes?") before calling the persist step.

The visual editor integration (surfacing the diff as an inline preview in the editor iframe) is desirable but deferred — it requires a new postMessage event type and changes to `BlockContentEditor.tsx` (2018-line god file). Any such change must be made via subagent only, per the god-file rules in `components/portal/visual-editor/CLAUDE.md`.

### Public site / blocks

Blocks are universal — this agent never touches per-client rendering. Production block rendering lives in `app/sites/[domain]/[[...slug]]/`, not here. The agent reads and proposes changes to `posts.content` only.

### MCP exposure

Not planned for v1. Block-edit delegation is an internal portal concern. External MCP clients that need to edit blocks already use `posts_update` in `lib/mcp/tools/cms.ts`. If an MCP-facing block-authoring tool is needed later, use `simplerdev-mcp-tool` to scaffold it in lockstep.

## Specialized context and tools

**System context the agent carries:**

- Block-authoring rules from `components/portal/visual-editor/CLAUDE.md` and `lib/blocks/CLAUDE.md`
- The block schema reference from `lib/ai/block-schemas.ts` (623 lines) and `lib/blocks/registry.ts` (118 lines)
- The "blocks are universal" invariant and the block-type registration lockstep contract
- The tenant's current site context (active block types, current page blocks)

**Tools the agent needs:**

| Tool | Purpose | Data source |
|---|---|---|
| `read_post_content` | Fetch `posts.content` for a given `postId`, scoped to `siteId` | `lib/db/schema/cms.ts` — `posts` table |
| `list_block_types` | Return registered block type slugs + schemas | `lib/blocks/registry.ts`, `lib/ai/block-schemas.ts` |
| `validate_block_patch` | Run server-side validation of a proposed block-JSON patch against the registry | `lib/blocks/registry.ts` |
| `apply_block_patch_draft` | Write the validated patch to `posts.content` with `published: false` (draft), only after approval | `posts` table via portal posts API |

**Pipeline shape:** reuse the Brain agent's classify → loop → ground pattern where it fits. A complexity classifier (matching `lib/ai/portal-tools/classifier.ts` (83 lines)) runs first to select Haiku vs Sonnet. The loop cap matches the Brain agent (8 iterations / 20 tool calls). A groundedness check is optional for v1 but recommended once real tracing lands.

## Scaffolds to use

- `simplerdev-feature-scaffold` for the route + handler boilerplate and E2E test scaffold.
- Do NOT use `simplerdev-block-type` here — this agent consumes existing block types; it does not register new ones.
- Do NOT use `simplerdev-visual-editor` for the agent itself — use it only if subsequent work touches the visual editor shell.

## Validation plan

Per [[06 - Validation/Gate Picking|Gate Picking]]:

- **Unit:** classifier routing (Haiku vs Sonnet), block-patch validation logic, tenancy scoping of `read_post_content` and `apply_block_patch_draft`. Coverage floor: 70% on `lib/ai` (per `lib/ai/CLAUDE.md` and `tests/CI-GATES.md`).
- **Integration:** end-to-end agent loop with a seeded post and block schema; verify the diff matches expected structure; verify `published` is not flipped without an explicit approve call.
- **Tenancy regression:** `bun test:tenancy` after any data-access change — the read and write tools must be `siteId`-scoped.
- **E2E golden path:** `bun test:critical` before declaring done.

## Topology fit

The portal chatbot (`app/api/portal/ai/chat/route.ts` (309)) is the hub. This agent is its first spoke. The wiring is:

1. Chatbot receives user message.
2. Intent router (to be built — see ADR consequences, "intent router" item) classifies the request as `block-edit`.
3. Chatbot delegates to this agent (HTTP call to `app/api/portal/ai/block-agent/route.ts` [to be created] or an internal function call — see Open questions).
4. Agent runs its loop and returns a diff + approval prompt.
5. Chatbot relays the approval card to `AIChatWidget`.
6. On approval, chatbot calls `apply_block_patch_draft`.

This is the hub-and-spoke pattern specified in [[ADR agent-topology-router-not-domain-mesh]]: the chatbot loads only this agent's tool subset + context when a block-edit intent is detected, rather than carrying the full block schema on every turn.

## Open questions

1. **Own route vs internal function?** Own HTTP route (`/api/portal/ai/block-agent`) vs a tool on the chatbot that internally runs the loop? The route approach matches the Brain agent's shape and gives clean observability boundaries. The internal-function approach avoids an extra HTTP hop and simplifies auth. Decision needed before implementation starts.

2. **RAG over approved blocks?** Does the agent need RAG over the site's existing approved/published blocks for style consistency, or is the registry schema (type validity) sufficient for v1? The registry answers "is this valid JSON" but not "does this fit the page's visual style." Deferring RAG to v2 is the safer bet until the tracing gap is resolved.

3. **Diff surface in the visual editor UI?** How does the approved diff surface in the editor? Option A: chatbot widget only (approval card, text summary). Option B: a new postMessage event type (`BLOCKS_PREVIEW_PATCH`) that renders the diff inline in the iframe before commit. Option B requires touching `BlockContentEditor.tsx` (god file, 2018 lines) via subagent — more valuable UX, higher implementation cost. Decision needed before UI work begins.

## Prerequisites / blockers

**Blockers to start:**

- The portal chatbot **intent router** (listed in [[ADR agent-topology-router-not-domain-mesh]] consequences) must exist before this agent can receive delegated requests. The complexity classifier shipped 2026-06-10 (`lib/ai/portal-tools/classifier.ts`) is the first step; intent routing is the next.

**Blockers to ship:**

- **Real tracing** (`lib/ai/brain-tools/tracer.ts` is a stdout shim — see [[Building Custom Agents — Principles]] §7). The ADR records this as a prerequisite before any multi-agent topology is added. The shim is a single-swap-point; no code change is needed until the Sentry backend lands. Until then, the agent can be built and tested, but it must not be enabled in production.
- **Intent router accuracy baseline.** Tool-selection accuracy and latency must be measured on the router before delegation to this sub-agent is enabled, per the ADR.

## Related

- [[ADR agent-topology-router-not-domain-mesh]] — the decision that promotes this domain to a specialist agent and defines the hub-and-spoke topology
- [[Building Custom Agents — Principles]] — principles this agent's design must satisfy (system context, tools, loop, observability, cost)
- [[Visual Editor]] — domain map; key files, schema, postMessage protocol, god-file warnings
- [[CMS & Blocks]] — block types, `types/blocks/index.ts`, `lib/blocks/registry.ts`
- [[Unify AI Tool Surfaces]] — parallel work on tool-surface consolidation; this agent's tools should align with whatever single-source emerges
- [[Company Brain & AI]] — the Brain agent is the reference implementation this agent's pipeline should mirror
