# MCP Tool Surface Audit — Context/Token Weight
**Date:** 2026-06-04  
**Scope:** `lib/mcp/` + external adapters (`lib/brain/`, `lib/branding/`, `lib/storefront/`, `lib/post-types/`)  
**Method:** grep-count + Python character/Zod-field analysis; no tool code was modified.

---

## 1. Real Tool Count

**Registered at runtime: 431 tools across 24 domain registrars.**  
**Locked in baseline test: 300 tools.** — a drift of **131 undeclared tools** (see §5).

The registration method is `server.registerTool(name, { title, description, inputSchema }, handler)` called directly or via `hasScope(...) && server.registerTool(...)`.  Five "stub" domain files in `lib/mcp/tools/` forward to feature-level adapters (brain, branding, storefront, post-types, approvals).

### Per-Domain Breakdown

| Domain | Tools (registered) | Tools (baseline) | Source file(s) | Src LOC |
|---|---|---|---|---|
| brain | **156** | 49 | `lib/brain/mcp-sdk-adapter.ts` | 5,630 |
| crm | 43 | 43 | `lib/mcp/tools/crm.ts` | 1,670 |
| cms | 42 | 35 | `lib/mcp/tools/cms.ts` | 2,216 |
| kanban | 39 | 32 | `lib/mcp/tools/kanban.ts` | 1,484 |
| storefront | 27 | 27 | `lib/storefront/mcp-sdk-adapter.ts` | 882 |
| email | 19 | 19 | `lib/mcp/tools/email.ts` | 843 |
| projects | 12 | 4 | `lib/mcp/tools/projects.ts` | 588 |
| pitch-decks | 12 | 10 | `lib/mcp/tools/pitch-decks.ts` | 966 |
| post-types | 13 | 13 | `lib/post-types/mcp-sdk-adapter.ts` | 559 |
| bookings | 10 | 10 | `lib/mcp/tools/bookings.ts` | 549 |
| team | 6 | 4 | `lib/mcp/tools/team.ts` | 312 |
| tickets | 6 | 6 | `lib/mcp/tools/tickets.ts` | 324 |
| surveys | 6 | 6 | `lib/mcp/tools/surveys.ts` | 392 |
| services | 5 | 5 | `lib/mcp/tools/services.ts` | 266 |
| automations | 5 | 5 | `lib/mcp/tools/automations.ts` | 259 |
| sprints | 4 | 4 | `lib/mcp/tools/sprints.ts` | 244 |
| billing | 4 | 6 | `lib/mcp/tools/billing.ts` | 205 |
| approvals | 4 | 4 | `lib/mcp/approvals.ts` | 1,193 |
| branding | 9 | 9 | `lib/branding/mcp-sdk-adapter.ts` | 299 |
| hosting | 2 | 2 | `lib/mcp/tools/hosting.ts` | 185 |
| integrations | 2 | 2 | `lib/mcp/tools/integrations.ts` | 224 |
| profile | 2 | 2 | `lib/mcp/tools/profile.ts` | 220 |
| ai | 2 | 2 | `lib/mcp/tools/ai.ts` | 169 |
| meta | 1 | 1 | `lib/mcp/tools/meta.ts` | 49 |
| **TOTAL** | **431** | **300** | — | **11,330 (tools only)** |

---

## 2. Token Weight Estimate

### Method
- **Description tokens:** sum of all description string lengths (chars / 4).  Threshold: strings >40 chars to filter out Zod `.describe()` field annotations vs tool-level descriptions.
- **Schema tokens:** count of Zod primitive calls (`z.string()/number()/boolean()/array()/object()/enum()/any()` etc.) × 8 tokens each (conservative average for a serialized JSON Schema property with type + optional + description).
- **Name + title tokens:** 431 tools × (5 + 4) = ~3,879.
- **Server instructions block:** ~80 tokens.
- Adds **BLOCKS_SCHEMA_TLDR** (1,083 chars / ~271 tokens) embedded inline in 2 tool descriptions (`posts_create`, `posts_update`).

### Totals

| Component | Value |
|---|---|
| Total description characters (>40 chars) | 67,995 |
| Total Zod schema calls | 1,874 |
| — |  — |
| Description tokens (~chars/4) | ~17,000 |
| Schema tokens (~z.calls × 8) | ~15,000 |
| Tool names + titles (~431 × 9) | ~3,900 |
| Server instructions | ~80 |
| **Grand total (all 431 tools)** | **~36,000 tokens** |

### Per-Domain Weight

| Domain | Tools | Desc chars | Z.calls | ~Tokens | Tokens/tool |
|---|---|---|---|---|---|
| brain | 156 | 28,406 | 754 | 15,246 | 98 |
| cms | 42 | 6,996 | 157 | 3,005 | 72 |
| pitch-decks | 12 | 4,254 | 62 | 1,559 | 130 |
| crm | 43 | 3,891 | 219 | 2,724 | 63 |
| kanban | 39 | 3,256 | 92 | 1,550 | 40 |
| email | 19 | 2,668 | 71 | 1,235 | 65 |
| storefront | 27 | 2,242 | 123 | 1,544 | 57 |
| post-types | 13 | 1,886 | 62 | 967 | 74 |
| bookings | 10 | 1,409 | 103 | 1,176 | 118 |
| branding | 9 | 750 | 55 | 627 | 70 |
| surveys | 6 | 1,287 | 44 | 673 | 112 |
| projects | 12 | 1,428 | 24 | 549 | 46 |
| automations | 5 | 548 | 26 | 345 | 69 |
| integrations | 2 | 568 | 1 | 150 | 75 |
| services | 5 | 449 | 10 | 192 | 38 |
| team | 6 | 467 | 10 | 196 | 33 |
| tickets | 6 | 293 | 19 | 225 | 38 |
| sprints | 4 | 287 | 17 | 207 | 52 |
| profile | 2 | 218 | 7 | 110 | 55 |
| billing | 4 | 214 | 5 | 93 | 23 |
| approvals | 4 | 396 | 8 | 163 | 41 |
| hosting | 2 | 232 | 2 | 74 | 37 |
| ai | 2 | 189 | 3 | 71 | 36 |
| meta | 1 | 334 | 0 | 83 | 83 |

**Brain alone accounts for ~42% of total definition weight** (15,246 of ~36,000 tokens).

---

## 3. Leanness Findings

### 3a. Heaviest Individual Tool Definitions

Ranked by combined weight (description chars/4 + Zod calls × 8):

| Rank | Tool | Domain | Desc chars | Z.calls | Est. tokens |
|---|---|---|---|---|---|
| 1 | `decks_replace_slides` | pitch-decks | 1,381 | 7 | ~401 |
| 2 | `decks_create` | pitch-decks | 807 | 13 | ~306 |
| 3 | `decks_add_slide` | pitch-decks | 753 | 8 | ~252 |
| 4 | `brain_classify_notes` | brain | 491 | 6 | ~170 |
| 5 | `brain_apply_classifications` | brain | 478 | 9 | ~191 |
| 6 | `brain_glossary_bulk_import` | brain | 330 | 19 | ~234 |
| 7 | `posts_create` | cms | ~1,300* | 10 | ~387 |
| 8 | `posts_update` | cms | ~1,300* | 12 | ~421 |
| 9 | `brain_decisions_update` | brain | 323 | 12 | ~177 |
| 10 | `bookings_create`/`update` | bookings | ~300 | 15 | ~195 |

\* `posts_create` and `posts_update` embed `BLOCKS_SCHEMA_TLDR` (1,083 chars) as a template literal interpolation, making each description ~1,300+ chars total — the largest single-tool description in the CMS domain.

### 3b. Bloated/Verbose Descriptions

**pitch-decks (`decks_replace_slides`, `decks_create`, `decks_add_slide`):** All three embed near-identical inline styling guidelines: "use `heading` blocks with `level`, pair with uppercase eyebrow, populate hero blocks (title + subtitle + description + ctaText/ctaLink), apply `style` for hierarchy." This guidance is repeated verbatim or near-verbatim across all three tools (~800–1,400 chars each). A shared `DECK_AUTHORING_GUIDE` constant (like `BLOCKS_SCHEMA_TLDR`) would cut ~1,800 chars.

**`posts_create` / `posts_update`:** Embed the entire `BLOCKS_SCHEMA_TLDR` constant (1,083 chars) inline. This is a reasonable design choice (the TLDR exists exactly for this), but it means 2 × 271 = 542 tokens of block guidance in every session even if the user never touches posts. Moving this to a resource (like `BLOCKS_SCHEMA_REFERENCE`) or pointing to `blocks://schema` by reference would reduce per-session overhead.

**`posts_upload_html_zip`:** 545-char description listing specific file extensions, size limits, and index-priority rules. This is operational detail that could live in a linked resource or be trimmed to the 2-line essential.

**`brain_classify_notes`:** 491-char description explaining `dryRun:true` behavior and output shape in prose that largely duplicates what the schema communicates. The `dryRun` default and return-shape belong in `.describe()` annotations on the schema fields, not in the top-level description.

### 3c. Near-Duplicate Tools

**Artifact link/unlink/toggle/list (kanban + crm — 8 tools, ~4 × 2 domains):**  
These four tools (`*_artifact_link`, `*_artifact_unlink`, `*_artifact_toggle_pin`, `*_artifacts_list`) are registered identically in both `kanban.ts` and `crm.ts`, with descriptions that differ only in substituting "kanban card" for "CRM deal." The descriptions, input schemas, and return shapes are otherwise verbatim copies. This pattern also exists in `projects.ts` (3 new tools: `projects_artifacts_list`, `projects_artifact_link`, `projects_artifact_toggle_pin`, `projects_artifact_unlink` — 4 more). Total: 12 artifact-link tools across 3 domains with ~95% shared semantics.

**Fork pattern (cms, surveys, email, pitch-decks — 4 tools):** `posts_fork`, `surveys_fork`, `email_campaigns_fork`, `decks_fork` are all simple duplicate-row operations with near-identical tiny descriptions and schemas (`id: z.number()`). Not a weight problem (they're lean), but a surface-count contributor.

**`brain_list_*` read tools (topics, org_units, people, glossary, etc.):** 20+ brain read tools follow an identical pattern: `{ limit?, offset?, search? }` with a 1-sentence description. Each is correct but they accumulate weight by volume.

### 3d. Domains with Unusually High Tool Counts

- **brain (156 tools):** By far the largest domain — 52% of all registered tools. It functions as a sub-application (knowledge base, CRM read-layer, org chart, glossary, playbooks, documents, decisions, topics, people, goals, initiatives). Each sub-area is a legitimate feature but brain's surface is larger than the next 3 domains combined. **Importantly, 107 of these 156 tools are not in the baseline test** (see §5).
- **crm (43 tools):** The second largest, but well within reason for a full CRM. Descriptions are consistently terse (~100–130 char avg).
- **cms (42 tools):** Spans posts, media, nav, block templates, sites custom code. Reasonable scope; two tool descriptions are heavy (see above).
- **kanban (39 tools):** Rich feature set (labels, checklists, assignees, blockers, comments, time-log, artifacts, templates, recurrences, sprint proposals). 7 tools not in baseline.

### 3e. Description Style Consistency

Style is **mixed**:
- CRM, kanban, storefront, billing, sprints, ai: consistently terse (1–2 sentences, typically 80–140 chars). Model style.
- Pitch-decks: verbose prescriptive guidance embedded in descriptions (appropriate for AI-authoring tools, but over-indexed).
- Brain adapter: bimodal — 100 tools are lean (1-sentence), ~15 are verbose (300–491 chars each, embedding behavioral rules).
- CMS: terse for CRUD, verbose for upload/template/nav tools.

---

## 4. Response-Side Tooling vs. This Audit (Important Distinction)

`lib/mcp/projections.ts` and `lib/mcp/rollup.ts` govern what data is echoed back in **tool responses** — slim/full post projections, deck projections, campaign projections, `include*` opt-in flags. These are well-designed and reduce response token weight.

The `simplerdev-mcp-token-budget` skill (`docs/skills/`) audits response echoes.

**This audit is orthogonal:** it measures the **tool definition side** — the names, descriptions, and Zod input schemas that every connected client receives at session initialization, before any tool is called. Both axes matter; they are independent.

---

## 5. Critical Finding: Baseline Test Drift

The baseline integration test (`tests/integration/api/mcp-tool-registry-baseline.test.ts`) locks the expected set to **300 tool names** and asserts zero extras. The actual runtime surface is **431 tools** — a gap of **131 tools**. The test is currently failing (or the extra tools are being suppressed by scope guards not present in the test's `'*'` context — but the test uses `'*'` scope, so they should all register).

**Domains with unlocked (untracked) tools:**

| Domain | Count | Example tools |
|---|---|---|
| brain | 107 | `brain_initiatives_*`, `brain_goals_*`, `brain_decisions_*`, `brain_topics_*`, `brain_people_*`, `brain_org_units_*`, `brain_glossary_*`, `brain_playbooks_*`, `brain_documents_*` |
| cms | 7 | `media_upload_presign`, `media_register`, `sites_publish_custom_code`, `nav_update`, `nav_publish`, `nav_publish_all`, `block_templates_publish` |
| kanban | 7 | `kanban_card_templates_*`, `kanban_propose_sprint`, `kanban_recurrences_*` |
| projects | 8 | `project_members_*`, `projects_artifacts_*`, `projects_propose_artifact_link` |
| pitch-decks | 2 | `decks_publish_slide`, `decks_publish_all` |

These tools were added in multiple recent feature merges (`feat/brain-*`, several cms/kanban features) without updating the baseline. The baseline must be updated to re-engage its safety function.

---

## 6. Recommendations (Unapplied)

### R1 — Update the baseline test (blocking, zero-risk)
Add the 131 missing tool names to `EXPECTED_TOOLS` in `tests/integration/api/mcp-tool-registry-baseline.test.ts`. The test currently fails silently (or is being skipped) on main. This restores the safety harness before any further tool additions.  
**File:** `tests/integration/api/mcp-tool-registry-baseline.test.ts`  
**Effort:** ~30 min mechanical edit.

### R2 — Extract a `DECK_AUTHORING_GUIDE` constant for pitch-deck descriptions (~1,800 chars / ~450 tokens saved)
The identical 4-rule styling guide embedded in `decks_replace_slides`, `decks_create`, and `decks_add_slide` should be extracted to a `DECK_AUTHORING_TLDR` constant in `lib/mcp/blocks-schema.ts` (alongside `BLOCKS_SCHEMA_TLDR`). Each description then references it via template interpolation. Saves ~1,800 chars of duplication; the guide itself only needs to live once.  
**File:** `lib/mcp/blocks-schema.ts`, `lib/mcp/tools/pitch-decks.ts`  
**Effort:** ~20 min; changes 3 tool descriptions + 1 constant.

### R3 — Move `BLOCKS_SCHEMA_TLDR` inline injection to a resource pointer for `posts_create`/`posts_update` (~542 tokens saved in non-CMS sessions)
`posts_create` and `posts_update` embed 1,083 chars of `BLOCKS_SCHEMA_TLDR` in their descriptions, costing ~271 tokens each every session. Replace with a shorter pointer: `"See blocks://schema resource for block field reference."` The full TLDR is already served via the `blocks://schema` resource (on-demand). This saves ~542 tokens for any client not actively creating posts.  
**File:** `lib/mcp/tools/cms.ts` (lines ~222, ~286)  
**Effort:** ~10 min; changes 2 description strings.  
**Trade-off:** Clients that ignore resources and rely on the description alone lose the inline hint. Acceptable given the resource is registered and discoverable.

### R4 — Consider a `brain:advanced` scope split for the 107 new brain tools (~42% of total weight)
The 107 unlocked brain tools (playbooks, documents, org chart, glossary, decisions, topics, goals, initiatives) represent advanced sub-systems that most clients will not need in every session. Registering them under a narrower scope (e.g., `brain:docs`, `brain:org`, `brain:ops`) would let standard integrations receive only the core 49 brain tools, cutting brain's contribution from ~15,246 to ~5,000 tokens and overall session weight from ~36k to ~26k tokens.  
**Files:** `lib/brain/mcp-sdk-adapter.ts`, auth/scope definitions  
**Effort:** Medium; requires scope-guard changes across ~107 tool registrations + client key config.  
**Trade-off:** Existing integrations using `'*'` scope see no change; narrower-scoped keys gain leaner sessions.

### R5 — Trim verbose `brain_classify_notes` / `brain_apply_classifications` descriptions (~180 tokens saved)
Both descriptions embed behavioral rules (dryRun semantics, routing logic, confidence thresholds) that could be expressed more concisely. The `dryRun` parameter behavior (491 chars of description) belongs in `.describe()` annotations on the `dryRun` schema field, not the tool description. Same for `minConfidence` in `brain_apply_classifications`.  
**File:** `lib/brain/mcp-sdk-adapter.ts` (lines ~1178, ~1262)  
**Effort:** ~15 min; changes 2 description strings + adds field-level `.describe()` annotations.

---

## Summary Table

| Finding | Tokens affected | Risk | Effort |
|---|---|---|---|
| R1 Baseline test drift (131 tools) | Safety/process | Low | 30 min |
| R2 Deck authoring guide duplication | ~450 | Low | 20 min |
| R3 `BLOCKS_SCHEMA_TLDR` pointer swap | ~542 | Low | 10 min |
| R4 Brain scope split | ~10,000 | Medium | Days |
| R5 Brain verbose classify descs | ~180 | Low | 15 min |
