# Brain Phase 7 — Documents — HANDOFF

Authoritative deploy + ops doc for `feat/brain-documents`. Read this end-to-end
before merging the branch into `chore/brain-merge-resolution` (or staging /
main, depending on the rollup strategy in flight).

---

## 1. Summary

**Branch:** `feat/brain-documents` (off `chore/brain-merge-resolution` @ `e562d6345`)
**Worktree:** `/Users/dancoyle/simplerdevelopment/sd2026-brain-documents`
**Code root:** `simplerdevelopment2026/`
**Migration:** `drizzle/0126_brain_documents.sql`
**Status:** All 6 build commits + Wave 4 closing test/handoff commit pushed to
`origin/feat/brain-documents`. **PR is NOT yet opened — left for eyeball
review.** See the PR command at the bottom of this doc.

Branch divergence from `chore/brain-merge-resolution`:

| Wave | SHA | Subject |
|---|---|---|
| 1   | `0c2a991c7` | feat(brain): add documents + versions + required-reads + acknowledgments + links tables |
| 2a  | `42a70abc8` | feat(brain): documents backend — lib + REST + publish lifecycle + tests |
| 2b  | `311f30058` | feat(brain): document acknowledgments backend — required-reads + acks + compliance-report + tests |
| 2c  | `8adb8c86a` | feat(brain): MCP tools for documents + versions + acknowledgments (22 tools, token-budget compliant) |
| 3b  | `ae1eac359` | feat(brain-skills): add sd-brain-promote-to-document |
| 3a  | `139ebf424` | feat(brain): documents UI — library, detail, draft editor, reading queue + nav |
| 4   | _(closing)_ | test(brain): documents e2e spec + handoff doc |

---

## 2. What ships

- **UI surfaces:**
  - `/portal/brain/documents` — library list with status pills, category
    filter, owner filter, and a search input. Per-document detail at
    `/portal/brain/documents/[id]` renders the latest published body,
    version history, the `<DocumentRequiredReadsPanel>` with assign
    affordance, and the polymorphic links panel.
  - `/portal/brain/documents/new` — minimal "title-only" creation form
    that POSTs to `/api/portal/brain/documents` and routes the user to
    the draft editor.
  - `/portal/brain/documents/[id]/edit` — markdown editor for the
    current draft version with publish + archive controls.
  - `/portal/brain/documents/queue` — "My reading queue" — the current
    user's open + acknowledged required-reads, with an inline
    acknowledge affordance.
  - Sidebar nav: `Documents` + `My Reading Queue` entries surfaced
    under the Brain section.
- **MCP tools (22 new) —** slim-by-default with opt-in `include` flags
  (`body`, `versions`, `links`, `acknowledgments`), and compact
  write-echoes that return `{ id, status, currentDraftVersionId, ... }`
  rather than the full row. Registered via
  `lib/brain/mcp-sdk-adapter.ts` behind the existing `brain:read` /
  `brain:write` scope guards. Plus three dashboard counts on
  `brain_dashboard_summary`.
- **End-user skill (`.claude/skills/`):**
  - `sd-brain-promote-to-document` — interview-based promotion of an
    existing `brain_notes` row into a `brain_document`. Modes: (A)
    single note by id or search, (B) bulk promotion across a tag match
    or explicit id list. Calls `brain_documents_promote_from_note`
    once per source note and returns a per-doc approval link.

---

## 3. Relationship to other brain branches

Built **on top of** `chore/brain-merge-resolution` (which has decisions +
topics + initiatives + people + glossary already merged into a single
linear trunk). Phase 7 picks up every prior brain table and adds five
new ones (`brain_documents`, `brain_document_versions`,
`brain_document_required_reads`, `brain_document_acknowledgments`,
`brain_document_links`).

Polymorphic links from documents are typed as
`'topic' | 'initiative' | 'decision' | 'meeting' | 'glossary_term' | 'person'`
— **every link target type is available on the merged baseline**.
Polymorphism is resolved at the app layer (no FKs across the polymorphic
boundary) so adding a new entity type later is a one-line union edit + Zod
enum bump.

**No dependency on `feat/brain-playbooks`, `feat/brain-review-routing`,
or `feat/brain-automations-playbooks-bridge`.** This branch is independent
of those sibling tracks and can merge in any order relative to them. If
playbooks merge first, a future follow-up could expose documents as a
playbook step kind (e.g. "require all assignees to ack policy X"); that
hook does NOT exist yet in this branch.

---

## 4. Database migration — CRITICAL

**One new SQL file: `drizzle/0126_brain_documents.sql`.** Five tables:

1. `brain_documents`
2. `brain_document_versions`
3. `brain_document_required_reads`
4. `brain_document_acknowledgments`
5. `brain_document_links`

Vercel does not run migrations on deploy, and staging-Preview talks to
**switchyard** (separate testing DB), not metro. Per
`feedback_sd2026_release_hand_migrate.md`, **the first time prod (metro)
sees this migration is when an operator hand-applies it via psql.** If
you merge staging→main without applying this file, every
`/portal/brain/documents` + `/portal/brain/documents/queue` route 500s
on missing tables.

```bash
# From simplerdevelopment2026/:
PG18=/usr/local/Cellar/postgresql@18/18.3/bin
$PG18/psql "$METRO_DATABASE_URL" -f drizzle/0126_brain_documents.sql
```

The file uses `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
patterns where Drizzle-kit emits them, so re-application is safe
(statements emit `NOTICE: relation already exists, skipping`).

Order is `brain_documents → brain_document_versions →
brain_document_required_reads → brain_document_acknowledgments →
brain_document_links` (versions + required_reads depend on documents;
acks depend on versions + required_reads; links depend on documents).
The SQL file declares them in that order.

---

## 5. Verification post-apply

Smoke checks after hand-applying the migration to metro:

```sql
\d brain_documents
\d brain_document_versions
\d brain_document_required_reads
\d brain_document_acknowledgments
\d brain_document_links
```

Each should show the columns documented in `lib/db/schema/brain.ts`. Key
unique indexes to confirm:

- `brain_documents_client_slug_idx` on `(client_id, slug)`
- `brain_document_versions_doc_version_idx` on `(document_id, version_number)`
- `brain_document_required_reads_doc_target_idx` on `(document_id, target_type, target_id)`
- `brain_document_acks_doc_version_person_idx` on `(document_id, version_id, person_id)`
- `brain_document_links_doc_entity_idx` on `(document_id, entity_type, entity_id)`

Then authenticated against any client tenant:

```bash
curl -s -b "$COOKIE" "$BASE/api/portal/brain/documents?limit=1" | jq
# Expected: { "success": true, "data": { "items": [], "limit": 1, "offset": 0 } }

curl -s -b "$COOKIE" "$BASE/api/portal/brain/document-acks?status=all&limit=1" | jq
# Expected: { "success": true, "data": { "items": [], "acknowledgments": [], "personId": <int|null> } }
```

Empty `items` arrays are correct — no client has any documents until a
user creates one (no built-in seed pack in v1).

---

## 6. Rollback

If a critical bug surfaces and the tables must come out, drop in this
exact order (reverse dependency):

```sql
DROP TABLE IF EXISTS brain_document_acknowledgments;
DROP TABLE IF EXISTS brain_document_required_reads;
DROP TABLE IF EXISTS brain_document_links;
DROP TABLE IF EXISTS brain_document_versions;
DROP TABLE IF EXISTS brain_documents;
```

Audit-log rows the lib wrote
(`brain_audit_logs.entity_type = 'brain_document'`) are orphaned but
harmless — keep them or `DELETE FROM brain_audit_logs WHERE entity_type
= 'brain_document'` separately.

App code referencing these tables will throw on import. The corresponding
revert is `git revert` on the merged PR commit.

---

## 7. Known follow-ups (priority order)

- **P2 — OrgUnitPicker not wired in the required-reads panel.**
  `<DocumentRequiredReadsPanel>` uses a plain `<select>` populated from
  `/api/portal/brain/org-units?as=flat` for the org-unit branch; the
  person branch already uses `<PersonPicker>`. Future PR: lift the
  shared org-unit picker (when one exists — `chore/brain-cleanups`
  ships a partial one) into this panel for consistency with the
  decision form.
- **P2 — `brain_list_notes` does not support a `tagPrefix` filter.**
  `sd-brain-promote-to-document`'s bulk mode handles this by falling
  back to `search` when the user gives a prefix-like value, then
  asking the user to confirm the candidate list before promoting. A
  cleaner long-term fix is to add `tagPrefix` to the MCP schema +
  underlying lib query.
- **P2 — Documents list endpoint returns no `total`.** The route at
  `/api/portal/brain/documents` returns `{ items, limit, offset }`
  only. The library page infers `hasNext` from
  `items.length === pageSize`, which is correct but cheap. Adding a
  `COUNT(*) OVER ()` window or a separate `?count=true` flag would
  enable an exact "Showing 23 of 47" footer in the library UI.
- **P3 — Markdown renderer in the document detail view is plain.** The
  current renderer is a minimal first-pass. A follow-up could swap in
  `react-markdown` + `remark-gfm` so tables, task-lists, and footnotes
  render correctly.

---

## 8. Out of scope (deliberately deferred)

The following are intentionally NOT shipped in this branch and are NOT
follow-ups for this branch's PR — they are separate work:

- Required-read reminder notifications (email or Slack) for pending /
  overdue acknowledgments. The data layer captures everything needed
  (assignedAt, dueAt, ack status); the messenger is not wired.
- Document signature / e-sign workflow. Acknowledgments record
  `acknowledgmentNote` + actor + timestamp but do NOT capture a
  signed-PDF artifact or third-party e-sign provider integration.
- Document templates by category. v1 starts every document from an
  empty draft. A future PR could ship `brain_document_templates`
  (SOP / policy / guide skeletons) and a "Start from template" flow
  alongside the "Promote from note" flow.
- Document import from external sources (Notion pages, Google Docs,
  Confluence, etc.). The promote-from-note flow covers internal
  `brain_notes` ingestion; external connectors are out-of-scope.

---

## 9. Test gate results (Wave 4)

Run from `simplerdevelopment2026/`:

| Gate | Result | Notes |
|---|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit` | **81 errors — delta 0** vs Wave 1 baseline (81). | All pre-existing; **zero** errors in `tests/e2e/brain-documents.spec.ts` — the only file Wave 4 added. |
| `bun run lint` | Pre-existing baseline (637 errors / 2959 warnings, all from earlier code). New file `tests/e2e/brain-documents.spec.ts` introduces **zero new errors and zero new warnings**. | Confirmed via `grep brain-documents.spec lint.out` — no matches. |
| `npx vitest run --project=unit brain-documents brain-document-acks` | **2 files / 30 tests / 0 failures.** | Matches Wave 2 expectations: documents 20/20 + document-acks 10/10 = 30/30. |
| `bun test:tenancy` | **Refused to start — env-blocked.** | Pre-existing: `DATABASE_URL_TEST or DATABASE_URL must be set for integration-api tests`. No `.env.local` provisioned on this worktree. Re-run on a worktree with the seed env. |
| `bun test:critical` | **Refused to start — env-blocked.** | Same root cause: requires a dev server bound to a seeded test DB. The E2E spec at `tests/e2e/brain-documents.spec.ts` is tagged `@brain` (not `@critical`); when env is restored, select with `npx playwright test --grep @brain-documents`. |

---

## 10. The PR command

Run this once eyeballed (NOT now — Wave 4 stops at push):

```bash
gh pr create \
  --base chore/brain-merge-resolution \
  --head feat/brain-documents \
  --title "feat(brain): documents + versions + required-reads + acks (Phase 7)" \
  --body "$(cat <<'EOF'
## Summary
- New `brain_documents` / `brain_document_versions` /
  `brain_document_required_reads` / `brain_document_acknowledgments` /
  `brain_document_links` schema (`drizzle/0126_brain_documents.sql`).
- Document library + draft editor + reading queue at
  `/portal/brain/documents` + `/portal/brain/documents/queue`.
- 22 new MCP tools (document CRUD, version edit/publish/archive, link
  CRUD, required-read assign / list / remove, acknowledge,
  compliance-report, promote-from-note) + 3 dashboard counts.
- `sd-brain-promote-to-document` end-user skill — converts existing
  brain notes into versioned documents (single or bulk).

## Migration
**Operator must hand-apply `drizzle/0126_brain_documents.sql` against
metro BEFORE this merges to main.** See
`.planning/brain-documents/HANDOFF.md` §4. The migration is idempotent
(`IF NOT EXISTS` guards) so re-application is safe.

## Test plan
- [ ] Apply `drizzle/0126_brain_documents.sql` against metro; verify
      `\d brain_documents` succeeds.
- [ ] Smoke `GET /api/portal/brain/documents?limit=1` returns
      `{success:true, data:{items:[]}}`.
- [ ] Smoke `GET /api/portal/brain/document-acks?status=all&limit=1`
      returns `{success:true, data:{items:[], acknowledgments:[]}}`.
- [ ] Create a document via `/portal/brain/documents/new`, edit the
      draft body, publish v1; verify status flips to `published` and
      the body renders on the detail page.
- [ ] Assign a required-read to yourself (person target); verify the
      doc appears on `/portal/brain/documents/queue`; acknowledge;
      verify the compliance-report partition shows you in
      `acknowledgedPersonIds`.
- [ ] `bun test:critical --grep @brain-documents` once a local DB is up.

## Known follow-ups
See HANDOFF §7. Top three: (P2) wire OrgUnitPicker into the
required-reads panel, (P2) add `tagPrefix` filter to `brain_list_notes`,
(P2) extend the documents list endpoint to return `total` for accurate
pagination footers.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
