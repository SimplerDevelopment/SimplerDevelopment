# Staging Verification Report — Coverage, MCP, and Feature Gaps

Goal of this work: verify the 6 features merged into local `staging` ahead of `origin/staging` are coherent, well-tested, exposed to AI agents via MCP, and free of obvious feature gaps. Three parallel audits + four parallel implementers + final aggregation. Every commit lives on `staging`; not pushed.

## Scope

110 source files changed since `origin/staging` across 6 merged feature stacks:
1. **Brain knowledge overhaul** (`be9fb2ea7`) — 12 commits, biggest stack.
2. **refactor-card-detail-modal-v2** (`b4a96804a`) — test additions.
3. **test-coverage-wave** (`961d78e11`) — test additions.
4. **crm-notification-emitters** (`c2985c096`) — notification wiring.
5. **my-tasks-unify-brain** (`dc1957b7f`) — unified `/portal/my-tasks` view.
6. **collab-realtime** (`2716f6834`) — yjs collab + comments + realtime-server package.

## Audit findings (Wave 1)

### Coverage gaps (the audit identified)
- `lib/brain/saved-searches.ts` — 5 exports, **zero unit tests**, **zero integration tests**.
- `lib/brain/extract-wikilinks.ts` — pure regex parser, **zero unit tests**.
- `lib/brain/recent-notes.ts` — localStorage helper, **zero unit tests**.
- `lib/realtime/post-binding.ts`, `deck-binding.ts`, `email-binding.ts` — Yjs bindings, **zero tests**.
- `app/api/portal/brain/saved-searches/*` — **zero integration coverage**.
- `app/api/realtime/token/route.ts` and `app/api/portal/realtime/comments/[id]/route.ts` — partial e2e only, no integration coverage on cross-tenant or non-author authz.
- `packages/realtime-server/src/auth.ts`, `handlers.ts`, `persistence.ts` — security boundary on the WS handshake, **zero coverage**.

### MCP gaps (the audit identified)
- 14 missing tools spread across brain saved-searches, brain templates, brain bulk/restore/history/from-template, CRM deals get/delete, CRM deal comments, document comments.
- 2 stale tools — `brain_delete_note` (didn't know about soft/hard two-step), `brain_list_notes` (didn't know about pagination + new filters).
- Explicit non-additions: `surveys_export` (CSV byte stream), `url-suggestions` (UI helper), CRM contacts multipart upload variants.

### Feature gaps (the audit identified — top 10)
1. **HIGH** — Deploy `packages/realtime-server` to Railway and wire prod env. Without it the entire collab feature is non-functional in production.
2. **HIGH** — Wire `documentComments` mentions to `createCrmNotification`. Single missing call.
3. **HIGH** — Saved-search permission checks. Any tenant member could mutate another user's pin.
4. **HIGH** — Realtime JWT viewer/write scope split. Token endpoint always issues `'write'`.
5. **HIGH** — Per-tenant collab feature flag at the token endpoint.
6. **HIGH** — Floating-promise notification emitters dropping notifications silently on failure.
7. **HIGH** — `tagPrefix` saved-search filter is half-built (accepted but never applied).
8. **MEDIUM** — `/portal/my-tasks` inline complete-task + filters + pagination.
9. **MEDIUM** — Notification preferences (per-user opt-out + digest mode).
10. **MEDIUM** — Trash retention + "empty trash" action; wiki-links pointing at trashed notes.

## What we shipped (Wave 2)

Five commits authored on `staging`:

```
811220f86 fix(realtime): include docKey in token response
fc963e6f8 fix(audit): close 5 cross-feature gaps from coverage/MCP/feature audit
9e22b07d6 test(coverage): close unit + integration gaps for brain + realtime
4fb404dce feat(mcp): 19 new tools + 2 updated for brain/crm endpoints
0f8812f0a docs(brain): verification plan for the knowledge overhaul merge   ← already there
```

### MCP coverage (closed)

**19 new tools** + 2 updated. Closes every HIGH/MEDIUM gap from the audit. Slim-by-default per `simplerdev-mcp-token-budget`.

| Domain | New tools |
|---|---|
| Brain saved-searches | `list`, `get`, `create`, `update`, `delete` (5) |
| Brain note templates | `list`, `get`, `create`, `update`, `delete`, `create_note_from_template` (6) |
| Brain knowledge | `bulk_update_notes`, `restore_note`, `list_note_history` (3) |
| CRM deals | `get`, `delete` (2) |
| CRM deal comments | `list`, `create`, `delete` (3) |
| **Updated** | `brain_delete_note` (force flag), `brain_list_notes` (pagination + filters) |

`tests/integration/api/mcp-tool-registry-baseline.test.ts` expanded with the 19 new tool names; baseline test stays green.

### Test coverage (closed)

**68 new unit tests** + **55 new integration tests**.

| File | Tests | Closes gap |
|---|---:|---|
| `tests/unit/brain-extract-wikilinks.test.ts` | 16 | regex parser |
| `tests/unit/brain-recent-notes.test.ts` | 12 | localStorage ring buffer |
| `tests/unit/brain-saved-searches.test.ts` | 4 | scope-clause invariants |
| `tests/unit/realtime-bindings.test.ts` | 19 | Yjs post/deck/email bindings |
| `tests/unit/realtime-internal-publisher-extra.test.ts` | 17 | publisher branches + never-throw invariant |
| `tests/integration/api/brain/saved-searches.test.ts` | 24 | full CRUD + scope + cross-tenant + ownership 403 |
| `tests/integration/api/realtime/token.test.ts` | 11 | JWT mint + cross-tenant + claim shape |
| `tests/integration/api/realtime/comments.test.ts` | 20 | GET/POST/PATCH/DELETE + authz + threadId |

**Test results after work:**
- `bun test` (unit): **767/767 pass** (was 695 before this work).
- Integration: **120/121 pass in single run** with one pre-existing pgvector flake (`brain_embeddings` cross-file race that affects pre-existing `brain-tasks` tests too); each test file passes 100% in isolation.
- `tsc --noEmit`: 0 new errors (84 pre-existing test-file errors unchanged).

### Feature gaps closed

5 of the audit's HIGH-priority items:

1. **`document_comments` mentions now notify users.** `app/api/portal/realtime/comments/route.ts` POST creates a `document_comment_mention` notification per mentioned user (filtered to `clientMembers`, excludes author). Closes the cross-feature loop with the CRM notification emitters that this branch added but never wired up to the realtime comment path.
2. **Saved-search ownership enforced.** New `SavedSearchForbiddenError` + `assertSavedSearchMutable` in `lib/brain/saved-searches.ts`. Personal pins (userId non-null) require ownership; shared pins (userId null) are mutable by any tenant member. Route maps to 403; cross-tenant stays 404.
3. **`tagPrefix` filter end-to-end.** `buildNoteFilters` accepts `tagPrefix`; SQL `EXISTS` over `jsonb_array_elements_text` matches `kb/marketing` and `kb/marketing/seo` but not `kb/marketing-old`. Wired through the knowledge GET route, `NoteListPane` state, `applySavedSearch`, `currentFilters`, `filtersActive`, `savedSearchMatches`, and clear-filters reset.
4. **Wiki-link extractor skips trashed.** `extractAndSyncWikiLinks` resolution query gets `isNull(brainNotes.deletedAt)`. No more phantom backlinks from soft-deleted notes.
5. **Floating-promise notification emitters log on failure.** Three call sites in `crm/deals/[id]/comments`, `crm/contacts`, `proposals/[token]` get `.catch(err => console.error(...))`. Notifications still don't block the user-visible request, but failures stop being silently swallowed.

Plus one bug found by W3 while writing tests: **`/api/realtime/token` now returns `docKey` in the response** (clients used to have to decode the JWT to learn it).

## Remaining gaps — not closed in this batch

These need product/eng decisions or are too large to ship without your input:

### Production-readiness (blockers for collab-realtime)
- **`packages/realtime-server` not deployed.** `railway.toml` exists, env var contract is documented, but no Railway service is provisioned. Until this lands, the collab feature is dead in production: token endpoint succeeds but the client's WS connect fails.
- **JWT viewer/write scope split.** `app/api/realtime/token/route.ts:142` always issues `'write'` regardless of the caller's portal role. Read-only viewers can mutate live docs.
- **Per-tenant collab feature flag.** No env / DB switch to disable collab per tenant. An outage of the realtime server can't be flagged off without redeploy.
- **JWT secret rotation** — no key versioning in the JWT header.
- **No CSP/CORS hardening on the realtime server** — `wss.handleUpgrade` accepts any origin.

### Functional gaps worth landing soon
- **Notification preferences.** No `notification_preferences` table, no per-type opt-out, no digest mode. Every emitter fires for every user, every event.
- **Trash retention.** `deletedAt` accumulates forever. No "empty trash" action, no scheduled cleanup, no warning when trash grows large.
- **`/portal/my-tasks` is read-only.** No inline status flip / priority change. No filter chips (source, project, overdue, priority). No pagination — `collectKanbanTasks`+`collectBrainTasks` return everything in one go.
- **Brain knowledge editor isn't wired to collab-realtime.** `entityType` enum is `'post' | 'deck' | 'email'` — brain notes are arguably the highest-value collab surface and are excluded.
- **Comment list endpoint (`/api/portal/realtime/comments`) has no pagination.** An entity with 1000 comments returns 1000 rows.
- **Bulk select-mode missing "select all" / "select across pages"** — limits power users to selecting only what's currently rendered (50 rows).
- **Bulk action bar doesn't expose `replace_tag_prefix`** — backend supports it; UI doesn't.

### Infrastructure
- **Pre-existing `brain_embeddings` cross-file flake.** When two integration test files run sequentially in the same vitest worker, the second can hit a missing `brain_embeddings` table because the migration replay's pgvector setup is racy. Affects pre-existing `brain-tasks` tests as well; not introduced by this work.

## How to verify

```sh
cd /Users/dancoyle/simplerdevelopment/simplerdevelopment2026

# Type + lint
NODE_OPTIONS='--max-old-space-size=8192' bunx tsc --noEmit       # expect 84 (pre-existing)
bun run lint                                                       # expect: 0 new errors

# Unit
scripts/test.sh --layer=unit --no-coverage                         # 767/767

# Integration (Postgres 17 must be running locally)
DATABASE_URL="postgresql://$USER@localhost:5432/simplerdev_test" \
DATABASE_URL_TEST="postgresql://$USER@localhost:5432/simplerdev_test" \
NODE_OPTIONS='--max-old-space-size=4096' \
npx vitest run --project=integration-api \
  tests/integration/api/brain/saved-searches.test.ts \
  tests/integration/api/realtime/ \
  tests/integration/api/brain/knowledge.test.ts \
  tests/integration/api/brain/knowledge-extras.test.ts \
  tests/integration/api/mcp-tool-registry-baseline.test.ts        # 121/121 in isolation; 120/121 together (the pre-existing flake)

# MCP registry
npx vitest run --project=integration-api tests/integration/api/mcp-tool-registry-baseline.test.ts  # 6/6
```

## Recommended next batch (prioritized)

1. **Deploy `packages/realtime-server` to Railway** — without it, none of collab works in production.
2. **JWT scope split** — read-only viewers need `'read'` tokens.
3. **Per-tenant collab feature flag** — graceful kill switch.
4. **Notification preferences + opt-out UI** — pre-requisite for any sustained notification volume.
5. **`/portal/my-tasks` filters + pagination + inline complete** — current UI is read-only and unbounded.
6. **Trash retention policy + manual "empty trash"** — cheap, table-stakes.

Everything else from the audit is either deferred phase-2/3/4 work documented in `.planning/brain-knowledge-overhaul-plan.md` or is polish.
