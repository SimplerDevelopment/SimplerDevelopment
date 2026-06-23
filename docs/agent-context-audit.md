# Agent Context Audit — Findings & Recommendations

Produced 2026-05-20 alongside the `feat/agent-context-optimization` branch.

This is a read-only audit of how skills, CLAUDE.md, and agent infrastructure are configured for `simplerdevelopment2026`. No destructive changes are proposed here — recommendations are for follow-up PRs.

---

## 1. Skill duplication between `~/.claude/skills/` and `.claude/skills/`

### Confirmed duplicates (identical SKILL.md content)

These 10 skills live in BOTH locations and are byte-identical right now:

- `html-render-block`
- `sd-build-html-embed`
- `sd-create-booking-page`
- `sd-create-deck`
- `sd-create-email`
- `sd-create-page`
- `sd-create-survey`
- `sd-create-website`
- `sd-init`
- `sd-learn`

Loose files duplicated:

- `CLIENT_QUICKSTART.md` (both)
- `SD_DESIGN_PRINCIPLES.md` (both)

### Project-only (correct — these are SD2026-specific)

- `feature-integrator`, `sd-edit-page`, `simplerdev-block-type`, `simplerdev-feature-scaffold`, `simplerdev-mcp-token-budget`, `simplerdev-mcp-tool`, `simplerdev-ui-scaffold`, `simplerdev-visual-editor`, `site-migration`
- Loose: `CLIENT_SAFE_MANIFEST.md`, `MORNING_BRIEF.md`, `SD_SKILLS_RUNBOOK.md`

### User-only (correct — cross-project tooling)

- `connect-kb`, `draft-blog-post`, `graphify`, `huashu-design`, `research-competitor`, `sync-kb`, `video-ingest`, `visual-compare`
- Loose: `frontend-design.md`, `last30days.md`

### Risk

While the duplicates are identical *today*, there is no defined source of truth. Any future edit to one location leaves the other stale. The skill-loader will pick *something* deterministically, but contributors editing the "wrong" copy will produce silent inconsistency.

### Recommended follow-up (separate PR)

**Option A — make the project version the source of truth** (recommended):
1. Delete the user-global copies for the 10 sd-* skills + the two loose .md files.
2. Symlink: `ln -sfn $(pwd)/.claude/skills/<name> ~/.claude/skills/<name>` for each.
3. Document the policy in root `CLAUDE.md` ("SD-* skills are project-scoped; symlink into ~/.claude/skills/ for global trigger").

**Option B — leave as-is + add a CI guard** that fails the build if checked-in `.claude/skills/sd-*` drifts from a tagged "user-global" snapshot. Heavier. Not recommended.

This work is OUT OF SCOPE for the `feat/agent-context-optimization` branch — captured here for a future PR.

---

## 2. Skill discoverability for AI clients

The portal MCP exposes ~250 tools (`mcp__claude_ai_SimplerDevelopment__*`). Combined with ~25 project skills and ~30 user-global skills, an agent's tool list is huge. The progressive-disclosure model (skill frontmatter is small; body loads on demand) handles this, but a few items would help further:

- The skill descriptions are already strong (each has explicit "Use when the user says X, Y, Z" triggers). Good.
- A small number have empty/minimal descriptions in the system-reminder dump — `simplerdev-ui-scaffold`, `simplerdev-feature-scaffold`, `sd-create-deck`, `sd-edit-page`, `excalidraw-diagram`, `frontend-design:frontend-design`, `security-review`. Recommend filling these in for better routing.

---

## 3. Nested CLAUDE.md coverage (after this PR)

Added in this PR:

- `app/portal/CLAUDE.md`
- `lib/blocks/CLAUDE.md`
- `lib/mcp/CLAUDE.md`
- `lib/db/CLAUDE.md`
- `components/portal/visual-editor/CLAUDE.md`
- `tests/CLAUDE.md`

Suggested follow-up additions (not in this PR):

- `app/admin/CLAUDE.md` — admin panel invariants (less urgent — fewer files than portal)
- `app/sites/CLAUDE.md` — block production renderer, public-facing routes
- `lib/brain/CLAUDE.md` — knowledge graph / RAG specifics (currently in `BRAIN.md` at root, ~20k; would benefit from a slim nested pointer)
- `lib/crm/CLAUDE.md` — pipelines/deals/contacts conventions
- `workers/CLAUDE.md` — email-inbound + any worker conventions
- `scripts/CLAUDE.md` — common scripts + naming conventions

---

## 4. God files (for follow-up refactor PRs)

Files >1500 lines in the main code paths. Each is a context-window tax every time it's read:

| File | Lines |
|---|---|
| `lib/mcp/tools/cms.ts` | 2184 |
| `components/portal/visual-editor/BlockContentEditor.tsx` | 2018 |
| `components/brain/NoteListPane.tsx` | 1943 |
| `components/portal/visual-editor/HtmlRenderEditor.tsx` | 1694 |
| `components/booking-app/src/components/BookingSystem.tsx` | 1671 (vendored — skip) |
| `lib/mcp/tools/crm.ts` | 1670 |
| `lib/brain/mcp-sdk-adapter.ts` | 1544 |
| `components/blocks/visual/block-settings/panels/SectionsPanel.tsx` | 1499 |
| `lib/mcp/tools/kanban.ts` | 1458 |
| `app/portal/tools/pitch-decks/[id]/page.tsx` | 1412 |

Recommendation: split each into 4–6 sub-modules by feature/section. Target <600 lines per file. Each split is its own PR — these are too risky as a batch.

---

## 5. Repo-root debug artifacts

CLAUDE.md correctly warns about repo-root debug PNGs (`audit-verify-*.png`, `edit-*.png`, `editor-*.png`) and `_tmp-*.cjs`. The current `.gitignore` covers all of these (`*.png` rule + explicit `_tmp-*` + `editor-snapshot.md` + `audit-verify-*`). Verified by inspection: no tracked stale debug files exist.

This PR adds explicit `/edit-*.png` and `/editor-*.png` patterns for symmetry with CLAUDE.md (redundant but self-documenting).

---

## 6. Memory hygiene

Auto-memory under `~/.claude/projects/<project>/memory/` contains 13 entries. All currently relevant. No action.

---

## 7. Vendored apps with own node_modules

`components/booking-app`, `extension/`, `workers/email-inbound`, `packages/sdk` each carry their own `node_modules`. This pollutes `find`/`wc -l` results across the repo — the repo "appears" to be 1.5M lines when actually it's ~357k of authored code.

Recommendation: either bun workspaces or a top-level `.gitattributes` / `.searchignore`. Out of scope for this PR.
