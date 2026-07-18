# components/brain — Agent Notes

UI components for the Company Brain (knowledge IDE): notes, decisions, documents, glossary, playbooks, topics, initiatives, and people.

> Token budget: keep this file <80 lines.

## What lives here

- **Three-pane knowledge IDE:** `NoteListPane.tsx` (left rail), `NoteEditorPane.tsx` (center), `NoteOutlinePanel.tsx` / `NoteBacklinksPanel.tsx` (right). These are composed by `app/portal/brain/` page routes.
- **Entity cards/forms:** `DecisionCard.tsx`, `DocumentCard.tsx`, `GlossaryTermCard.tsx`, `InitiativeCard.tsx`, `PersonCard.tsx`, `PlaybookCard.tsx` — each maps to a Brain entity type.
- **Graph/tree views:** `NoteGraphView.tsx`, `TopicTree.tsx`, `TagTreemapView.tsx`, `OrgUnitTree.tsx`.
- **Shared utilities:** `MarkdownEditor.tsx` (CodeMirror-backed), `markdown-autocomplete.ts`, `initiatives-shared.ts`, `playbooks-shared.ts`.
- **Playbook runner:** `PlaybookRunStepper.tsx` / `PlaybookStepEditor.tsx` / `PlaybookStepGraph.tsx`.

## Load-bearing invariants

- **All data access is via `fetch` to `/api/portal/brain/**`** — no MCP calls from these components. Brain MCP tooling lives in `lib/mcp/`; the portal UI is REST-only.
- **Auto-save pattern:** `NoteEditorPane` debounces saves 1500 ms after last keystroke via a `AUTOSAVE_DELAY_MS` constant. Any component that edits a brain entity should follow the same debounce-then-`fetch PATCH` pattern, not fire on every keystroke.
- **Tag hierarchy:** `/`-delimited tags produce nested folders in `NoteListPane`. The `Untagged` sentinel and pinned-notes section are layout invariants — don't flatten them.
- **`onSaved` / `onEditorReady` callback contracts:** `NoteEditorPane` exposes these so the parent shell (not this component) can coordinate list refresh and outline scrolling. Keep that inversion — these components don't own cross-pane state.

## God-file warning

Do NOT `Read` this into the main thread — spawn an `Explore` subagent first:

- `components/brain/NoteListPane.tsx` (2140) — search + tag tree + sort + bulk-select + trash tab; 2140 lines. A targeted `Read` with `limit:` + `offset:` is acceptable for surgical edits.

## Pointers

- Brain API routes: `app/api/portal/brain/` (knowledge, topics, decisions, documents, glossary, playbooks, initiatives, people)
- Brain lib types: `lib/brain/types.ts`, `lib/brain/topics.ts`
- Portal page routes that compose these components: `app/portal/brain/`
- Brain MCP tools (server-side, separate from this UI): `lib/mcp/CLAUDE.md`
