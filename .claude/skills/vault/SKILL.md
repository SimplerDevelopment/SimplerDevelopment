---
name: vault
description: Read from and write to the project's Obsidian vault (vault/ at repo root) — the canonical home for domain maps, ADRs, feature specs, validation playbooks, and ops runbooks. Use when planning a feature ("check the vault", "read the domain map"), recording a decision ("log this ADR", "add to the vault"), writing a spec, or running the post-ship completion ritual. Also use when the user says /vault.
---

# Vault — read/write conventions

The vault at `vault/` is the canonical project knowledge base. It is tracked in git and consumed by BOTH Obsidian (human) and agents (plain markdown). `.planning/` is frozen — never add files there.

## Map

| Section | Holds | When you touch it |
|---|---|---|
| `vault/02 - Architecture/` | System-level design (route trees, tenancy, auth, data model, MCP, deployment, agent harness) | Read before cross-cutting work; update when architecture changes |
| `vault/03 - Domains/` | One map per feature domain | **Read before planning any feature; update after shipping one** |
| `vault/04 - Decisions/` | ADRs | Write when a non-obvious choice is made |
| `vault/05 - Feature Specs/` | Feature planning (new canon; replaces `.planning/`) | Write when planning; update `status` draft → accepted → shipped |
| `vault/05 - Feature Specs/Project Board.md` | **Kanban board — the project status source of truth** (lanes: Backlog → Planned → In Progress → Validating → Shipped) | ALWAYS: add a card when planning starts; move it as status changes; keep lane ↔ spec `status` in sync |
| `vault/06 - Validation/` | Playbooks: gate-picking, e2e, tenancy, coverage, QA | Read when deciding what to run/test |
| `vault/07 - Operations/` | Runbooks: deploy, env, crons, migrations | Read before ops work |
| `vault/08 - Templates/` | Templater templates per note type | Copy structure when creating notes |
| `vault/01 - Daily Logs/`, `vault/09 - Archive/` | Optional logs; links into frozen `.planning/` | Rarely |

Section indexes (`00 - *.md`) carry **static link lists for agents** (Dataview blocks are for Obsidian only — agents must maintain the static lists when adding notes).

## Reading protocol (planning/developing/validating)

1. Feature work → read the relevant `vault/03 - Domains/<X>.md` FIRST (it lists key files, schema, routes, MCP tools, tests, gotchas — cheaper than re-deriving from code).
2. Cross-cutting question → `vault/02 - Architecture/`.
3. "Which tests do I run?" → `vault/06 - Validation/Gate Picking.md`.
4. Don't trust blindly: notes carry `date` frontmatter; if old and the area churned, verify key claims against code and fix the note while you're there.

## Writing protocol

- Copy the structure from the matching template in `vault/08 - Templates/`.
- Frontmatter is mandatory: `type` (domain-map|adr|spec|playbook|runbook|architecture|log), `domain` (slug), `status`, `date` (today), `sources` (repo paths used).
- **Every repo path in a `code span` must exist** — `scripts/check-doc-drift.ts` scans `vault/02` and `vault/03` at pre-commit and fails on dead paths. Verify with `test -f` before writing. Line-count annotations like `` `file.tsx` (1504) `` are also drift-checked (±10%).
- Add the new note to its section index's static list.
- Wikilinks (`[[Note Name]]`) connect related notes; link domain maps ↔ ADRs ↔ specs.
- Commit as `docs(vault): <what>`.

## Completion ritual (after shipping a feature)

1. Update the touched Domain Map (new files, routes, tables, gotchas discovered).
2. If a non-obvious choice was made: write an ADR (test: "would the next agent need the WHY?").
3. If the feature had a spec: set its `status: shipped`.
4. Delegate the writing to the `vault-librarian` agent when the change is mechanical; do it inline when judgment is needed.

## Anti-rules

- Never duplicate CLAUDE.md rules, claude-mem episodic history, or docs/ guides — link to them.
- Never add files to `.planning/`.
- Never delete a note because it's stale — fix it or mark `status: superseded` with a link to the replacement.
