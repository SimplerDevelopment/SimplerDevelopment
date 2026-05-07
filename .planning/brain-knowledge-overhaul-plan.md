# Brain Knowledge Overhaul — Plan

Synthesis of 3 parallel review agents (UX/feature, backend, competitor research) for `/portal/brain/knowledge`.

## Diagnosis

Today the screen is a three-pane shell (list | editor | outline/backlinks/fields). Notes are grouped by hard-coded provenance tags (`Daily`, `Discoveries`, `Competitors`, etc.). The agents converged on these gaps:

- **No folder/tree hierarchy.** Users with 1000+ notes cannot create their own organization.
- **No fast jump-to-note.** No Cmd-K, no fuzzy search; load-more pagination only.
- **Hard delete is irreversible.** No trash, no archive, no audit-log-driven version history (even though `brain_audit_logs` exists).
- **Templates table is fully orphaned from the UI** (`brain_note_templates` only consumed by the daily cron).
- **Wiki-links not extracted on portal writes** — `brain_kb_links` is only populated by the migration script. Portal-authored notes never form edges, so the backlinks panel is empty for them.
- **No bulk operations**, no sort options, no view modes.
- **Hard-coded provenance grouping** disagrees with how power users in Bear/Obsidian/Capacities organize at scale.

Competitor research recommends a **hybrid**: Phase 1 = Bear-style nested tag tree (zero schema change) + omnibar + trash + saved searches; later phases add `parent_id` and supertags only if needed.

## Plan — what we ship tonight

Six independent units. Goal: ship a coherent, typesafe, tested v1.

### Backend (3 units)

**B1. Soft-delete + sort + bulk + history + wiki-link extraction.**
- Add `deletedAt` column to `brainNotes`; default-filter from list/get; new `POST /[id]/restore`; new `?trashed=true` query.
- Add `?sort=updated|created|title&order=asc|desc` to GET list.
- New `POST /api/portal/brain/knowledge/bulk` (delete-many, tag-add/remove, move-to-tag-folder, restore-many).
- New `GET /api/portal/brain/knowledge/[id]/history` (reads `brain_audit_logs`).
- New `lib/brain/extract-wikilinks.ts` (port the parser from `scripts/migrations/postcaptain/import-kb.ts`); call from `createNote`/`updateNote` to keep `brain_kb_links` populated.
- Drizzle migration: `deletedAt` column + GIN index on `brain_notes.tags` (the agents flagged this as a 5-figure-tenant cliff).

**B2. Templates CRUD + apply-on-create.**
- New `app/api/portal/brain/templates/route.ts` (GET/POST).
- New `app/api/portal/brain/templates/[id]/route.ts` (GET/PATCH/DELETE).
- New `app/api/portal/brain/knowledge/from-template/[id]/route.ts` (creates note with `applyTemplate`).
- Helper: `lib/brain/templates.ts` (CRUD wrappers; the engine already exists in `template.ts`).

### Frontend (3 units)

**F1. Bear-style nested-tag tree in `NoteListPane.tsx`.** Tags containing `/` (e.g. `kb/marketing/seo`) render as a disclosure-triangle tree. Bare tags stay flat. Pinned still shows on top. Adds: sort menu (updated/created/title), select-mode with checkboxes + bulk action bar, trash section toggle.

**F2. `CommandPalette.tsx` + Cmd-K hotkey.** Fuzzy match on title + recent-notes ring buffer (localStorage). Wired in `page.tsx`.

**F3. `NoteHistoryPanel.tsx` as 4th right-pane tab.** Reads `/api/portal/brain/knowledge/[id]/history` and renders an audit-log timeline. Plus: `TemplatesPicker.tsx` mounted next to the "+" button (opens a popover, calls `from-template/[id]`).

### Out of scope tonight

- Real `parent_id` hierarchy (Phase 2 — tag-tree first lets us see if it's even needed).
- Saved-search-as-sidebar-pin (Phase 3).
- Supertags (Phase 4).
- Mobile responsive shell (separate work — `react-resizable-panels` doesn't collapse on <640px).
- Virtualized list (only matters >1000 notes per tenant; not blocking).
- Graph view (needs viz lib + design pass).
- Inline image paste / drag-drop in markdown editor (separate).

## Dispatch order

Wave 1 (parallel, no shared files):
- B1 + B2 + F1 (each its own files; F1 only needs existing list endpoint)

Wave 2 (parallel, after Wave 1 lands):
- F2 (Cmd-K palette — needs F1 changes settled in NoteListPane)
- F3 (history panel + templates picker — needs B1's history endpoint and B2's templates API)

Final: typecheck, e2e write a smoke spec, commit on feature branch.
