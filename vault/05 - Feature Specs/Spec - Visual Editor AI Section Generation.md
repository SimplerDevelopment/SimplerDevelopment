---
type: spec
domain: editor
status: proposed
date: 2026-06-22
sources:
  - components/portal/visual-editor/CLAUDE.md
  - types/visual-editor.ts
  - lib/visual-editor/protocol.ts
  - lib/visual-editor/useVisualEditorParent.ts
  - lib/blocks/registry.ts
  - lib/blocks/CLAUDE.md
  - types/blocks/index.ts
  - lib/ai/block-schemas.ts
  - lib/ai/resolve-client-key.ts
  - lib/ai/plan-gate.ts
  - lib/ai-credits.ts
  - lib/ai/audit.ts
  - app/api/portal/cms/websites/[siteId]/posts/[postId]/route.ts
---

# Feature: Visual Editor In-Canvas AI Section Generation

## Overview

Add an "AI Generate Section" action to the visual editor: a natural-language prompt → an AI provider call constrained by the block registry schema → validated block JSON inserted into the live editor at the chosen position, without a full save/reload.

## Domain context

Read first: [[Visual Editor E2E Audit]] + `components/portal/visual-editor/CLAUDE.md`. The editor is an iframe/parent split: the parent (`useVisualEditorParent.ts`) owns the authoritative block array and pushes it to the iframe via `BLOCKS_UPDATE`; the iframe signals intent back (notably `ADD_BLOCK_AFTER` carrying `afterBlockId`). Block definitions: `lib/blocks/registry.ts` (`BUILT_IN_BLOCK_TYPES`, ~62 types); machine-readable JSON schemas already exist in `lib/ai/block-schemas.ts` (`BUILT_IN_SCHEMAS` with typed properties/required/enumValues) — the constraint surface for the prompt. AI calls follow `checkAiPlanGate` → `resolveClientApiKey` → Anthropic SDK → `deductCredits` (platform source only) + `recordAiUsage`; existing generation routes (branding copy, block restyle) establish the pattern.

## Problem

Users must know which block types exist and hand-compose multi-block sections. There's no path from intent ("a pricing section with three tiers") to populated blocks; the schema knowledge lives only in code.

## Goal

A user opens an inline prompt in the editor, describes a section, and receives a valid, immediately-editable set of blocks inserted at the right position — no leaving the editor, no manual save.

## Design

### UI entry point

A "Generate with AI" button on the existing between-blocks insertion row fires `ADD_BLOCK_AFTER` with `{ trigger: 'ai' }` (new optional field — no new message type). The parent opens a parent-side overlay (`AiSectionPanel.tsx` + `useAiSectionGenerate.ts`): prompt textarea, optional block-category filter, Generate button, loading state.

### API route — `POST /api/portal/cms/websites/[siteId]/posts/[postId]/ai-section`

Body `{ prompt, afterBlockId, allowedTypes? }` → `{ blocks, tokensUsed }`. Sequence: auth/tenant resolve (sibling PUT route pattern) → `checkAiPlanGate` (402) → credit check (402) → `resolveClientApiKey` → build a system prompt injecting `BUILT_IN_SCHEMAS` (filtered; exclude `email-*`/`post-content`/client-specific) → call `claude-sonnet-4-6` in **tool_use** mode (one tool `generate_blocks` with the block-union input schema → forces structured JSON, temp 0, max 4096) → extract → validate → `deductCredits` + `recordAiUsage` → return.

### Validation/repair — `lib/ai/validate-generated-blocks.ts`

Parse → must be array; drop unknown `type`; check required props from `BUILT_IN_SCHEMAS[type]`, fill safe defaults (empty string / first enum) or drop; assign fresh `crypto.randomUUID()` ids (don't trust AI ids); re-number `order` from 0; empty ⇒ `{code:'NO_VALID_BLOCKS'}`; hard cap 12 blocks.

### Insertion (parent hook)

Splice returned blocks into the parent's live `blocks` at `afterBlockId` (null = append), re-number `order`, `sendToIframe(BLOCKS_UPDATE,...)` (existing mutation path — no new message), select the first inserted block, mark the post dirty (joins normal autosave; no forced PUT).

### Accounting

`deductCredits(clientId, tokensUsed*RATE, 'ai_section_gen', postId)`; `recordAiUsage({clientId, source, tokens})`. BYOK ⇒ skip deduct, still meter.

## Phasing

- **Phase 1 (local; AI provider is the only external dep)** — validate-generated-blocks + the API route + `trigger:'ai'` payload field + the hook + panel.
- **Phase 2 (local)** — SSE streaming partial blocks with skeletons; block-type filter chips; prompt history (localStorage).
- **Phase 3** — multi-turn refinement ("make the hero darker", needs server-side conversation context); auto image-picker for placeholder image blocks.

## Key decisions (ADR-style)

- **tool_use over freeform JSON** — guarantees parseable structured output; no fences/prose.
- **Insertion via BLOCKS_UPDATE, not a new message** — the parent owns the array; the full-array push is the existing pattern; avoids touching the 2000-line iframe `BlockContentEditor`.
- **Dirty-state, no forced save** — generation reversible until save; avoids autosave races.
- **Exclude client-specific block types** (not in `BUILT_IN_SCHEMAS`) from generation.

## Open questions

1. Inject existing post blocks as context for style-matching? (Latency/token cost — defer to Phase 2.)
2. Confirm the per-token deduction rate constant in `lib/ai-credits.ts`.
3. Is `claude-sonnet-4-6` allowed on Starter-with-BYOK, or does this need a new `ai_section_gen` plan-gate key?
4. Confirm the iframe ignores unknown `ADD_BLOCK_AFTER` fields (backward-compat for `trigger`).

## Verification plan

- Unit: validate-generated-blocks (valid; unknown type dropped; missing-required repaired; empty ⇒ error; >12 truncated).
- Integration: route with a mocked Anthropic client — gating blocks unauth; deduct called for platform, skipped for BYOK; response shape.
- E2E `@critical`: open editor → Generate → prompt → ≥1 block appears in canvas → post dirty → save → persisted in `posts.content`.
- Tenancy: 403 when `siteId` belongs to another client.
