# Brain Knowledge Overhaul — Verification Plan

This plan walks through every shipped feature in the merge commit `be9fb2ea7` to confirm they work together. Each section has a short setup, the expected behavior, and a "red flag" list of failure signs.

The dev server is running in the worktree at **http://localhost:3000**. The merge is on local `staging` and not pushed.

## 0 — Pre-flight (5 min)

Run from `/Users/dancoyle/simplerdevelopment/simplerdevelopment2026`:

```sh
NODE_OPTIONS='--max-old-space-size=8192' bunx tsc --noEmit
bun run lint
scripts/test.sh --layer=unit --no-coverage           # expect 675/675
```

Then apply the two new migrations against staging DB (one at a time, eyeballing the SQL):
```sh
psql "$DATABASE_URL" -f drizzle/0070_sticky_sister_grimm.sql
psql "$DATABASE_URL" -f drizzle/0071_bent_weapon_omega.sql
```

Both are idempotent (`IF NOT EXISTS`). Re-running them is a no-op.

**Red flags:** any new tsc errors outside `tests/**`, lint regressions in `components/brain/**` or `lib/brain/**`, unit test failures, migration errors that aren't the existing brain_embeddings flake.

## 1 — Soft-delete + Trash + Restore  (golden path, 5 min)

Open `/portal/brain/knowledge`. Pick any note. Press the trash button.

**Expect:** the note disappears from the default list. Toast/error not raised.

Click the small "Trash" toggle in the search/filter row → list refreshes with `?trashed=true`. The deleted note is in the list. Hover row → see `restore` and `delete_forever` buttons.

Click `restore` → note returns to the active list. Click trash on it again, then while in Trash view click `delete_forever` → row disappears entirely (hard delete).

**Red flags:** 500 error in Network tab on DELETE, the row stays visible after first DELETE (means `deletedAt` not set), the row reappears after `delete_forever` (cascade not running), or `restore` produces 404.

## 2 — Bulk select + actions  (5 min)

Click the select-mode icon (looks like a checkbox in the toolbar). Each note row gets a checkbox. Select 3-5 notes.

Floating action bar at bottom of left rail shows: `Tag`, `Move`, `Delete`, `Cancel`.

- **Tag** → pick "add" → enter `bulk-test`. Confirm tag landed on each row (open a note, see new tag in metadata strip). Test "remove" too.
- **Move** → pick a tag-prefix folder (e.g. `kb/test`). Confirm the selected notes now appear under that folder in the tree.
- **Delete** → confirms and soft-deletes each. Trash view should show all of them.
- **Cancel** clears selection.

**Red flags:** bulk endpoint returns 500 (network tab), `data.updated` count doesn't match selection size, foreign-tenant safety failure (the tenant safety code returns the foreign id in `failed[]` — verify by attempting via API curl with cross-tenant ids, or just trust the integration test: `tests/integration/api/brain/knowledge-extras.test.ts` has explicit cross-tenant assertions).

## 3 — Sort menu + nested tag tree  (3 min)

In the left rail, the search row has a small `tune` icon. Click → sort popover.

- Toggle Updated → Created → Title and Asc/Desc. List re-orders. Check Network: each click hits `?sort=…&order=…`.
- Refresh the page. Sort persists (localStorage `brain.knowledge.list.sort`).

In the tag drawer (label icon), pick a tag like `kb/marketing/seo`. Tree view shows it nested with disclosure carets. Click an outer node to collapse. Reload page → collapse state persists (`brain.knowledge.list.collapsed`).

**Red flags:** sort param ignored (list always in updatedAt order), tree-build crashes on tags with multiple `/`, collapse state not persisted.

## 4 — Cmd-K command palette + Recent  (2 min)

Anywhere in `/portal/brain/knowledge`, press **Cmd-K** (Mac) or **Ctrl-K**. Modal opens.

- Empty query: "Recent" section shows the last few notes you've opened. Quick actions section shows "New note" / "Open zen mode" (if a note is selected).
- Type a fragment of an existing note title. Top-10 fuzzy results stream in (debounced 150 ms).
- ↑/↓ navigates rows. Enter opens. Esc closes.
- Type `>` first to filter the actions list.

Open the zen page (click `open_in_full` icon in editor header). Cmd-K still works there.

**Red flags:** no debounce (Network spam on every keystroke), Recent never populates (check `localStorage.brain.knowledge.recent`), palette captures Cmd-K when typing inside contenteditable input incorrectly.

## 5 — Templates picker + Manage page  (5 min)

In the left rail, the "+" button is a split-button: primary = create blank, chevron = open templates popover.

If no templates exist yet: chevron → "No templates yet, [Manage templates →]". Click the link → navigates to **/portal/brain/templates**.

On Manage Templates:
- "+ New template" creates blank.
- Fill: name, body with `{{userName}}`, trigger=manual, defaultTags=["test-tpl"].
- Save → list updates, Try-it button appears.
- Click "Try it" → creates a note and navigates to its editor. Body has `{{userName}}` substituted with the actual user. Tags include `test-tpl` plus a `from_template:N` tracker.

Edit the template name. Save. Confirm 409 inline error if you rename to a name that already exists.

Delete the template (button on the form). Confirm gone from list.

**Red flags:** Manage page 404s (nav link broken), 500 instead of 409 on dup name (the templates.ts `err.cause.code` fix is the safety net here — pre-existing bug fixed in commit 4f73ba26b), Try-it doesn't substitute variables, templates picker on the "+" button doesn't refresh after a new template is created.

## 6 — Saved searches  (5 min)

Apply some filters: search "discovery", pinned-only on, sort by created/desc. The `bookmark_add` icon lights up next to the search row.

Click it → inline form opens. Name = "Discovery digest". Pick an icon. Choose Personal scope. Save.

The Saved section above the tag tree now lists "Discovery digest". Reset filters (the Clear button). Click "Discovery digest" → all filters re-apply, including sort. The row gets a highlight indicating "current view matches".

Hover the row → `more_horiz`. Rename it to "Discovery — week". Delete it. Confirm gone.

Toggle to Team scope on a new pin. Confirm a small "team" badge appears.

**Red flags:** filters don't re-apply (deep-equal match logic broken), saved-search list doesn't refresh after create/rename/delete, scope toggle doesn't actually save (check Network → POST body `scope: 'shared'` should be userId=null on the row).

## 7 — Note history panel  (2 min)

Open any note. Right pane → click `history` tab (4th tab, alongside outline/backlinks/fields).

**Expect:** a timeline of audit-log entries. At least: a "Created" row when the note was first created. After editing the title and waiting for autosave, an "Updated" row appears.

**Red flags:** 404 (means cross-tenant guard misfiring — the recently-fixed bug — verify by trying a foreign id directly via curl: `/api/portal/brain/knowledge/<foreign-id>/history` should be 404 not 200), empty results (means audit logging not running on writes — check `lib/brain/notes.ts:logAudit`), or all rows showing "system" actor (means actorId not threaded).

## 8 — Wiki-link extraction + Backlinks  (3 min)

Create note A titled "VerificationTarget". Create note B with body containing `[[VerificationTarget]]`. Wait 1.5s for autosave.

Open note A → Backlinks tab. Note B should appear.

**Red flags:** Backlinks pane stays empty (means `extractAndSyncWikiLinks` not wiring into createNote/updateNote — pre-existing bug fixed in this overhaul). Check `brain_kb_links` table: should have a row with `from_note_id = B.id, to_note_id = A.id`.

## 9 — Image paste + drop in editor  (2 min)

In the editor, take a screenshot (Cmd-Ctrl-Shift-4 on Mac to clipboard). Paste with Cmd-V.

**Expect:** an `![uploading:…]` placeholder appears at cursor immediately. Within ~1s it gets replaced with `![filename](https://…media-proxy-url…)`. The image renders in the preview pane.

Drag a different image file from Finder onto the editor. Same flow.

If the upload endpoint fails: placeholder becomes `![upload failed: name]()` so the user can clean up.

**Red flags:** placeholder never resolves (upload endpoint mismatch — see `app/api/portal/media/upload/route.ts` response shape), preventDefault swallows non-image paste (you can't paste plain text), or multiple concurrent uploads clobber each other (means the placeholder-token uniqueness is broken).

## 10 — Mobile responsive shell  (3 min)

Resize the window to <768px wide (or use DevTools device emulation, e.g. iPhone 14).

**Expect:** the three-pane PanelGroup is replaced with a tab-switcher. Bottom nav with three icons: list, edit_note, view_sidebar. iOS safe-area padding on the nav.

- Click List → see the rail.
- Pick a note → auto-switches to Editor tab.
- Click Side → outline/backlinks/fields/history tabs work as in desktop.
- The CodeMirror state, scroll position, and side sub-tab choice all persist as you switch (panes are mounted-but-hidden).

Cmd-K still works.

**Red flags:** PanelGroup squishes instead of switching to tab shell (means the `useIsNarrow` hook isn't firing or the breakpoint is off), state lost when switching tabs (panes are unmounting — check the `block`/`hidden` toggle), bottom nav clipped by iOS home indicator.

## 11 — Zen-mode parity  (2 min)

In the IDE editor, click the `open_in_full` icon → opens `/portal/brain/knowledge/[id]`.

**Expect:** the zen page now has the **same** action buttons (pin, delete) and the **same** collapsible metadata strip (tags, confidentiality, source URL, attachment) as the IDE editor. Pinning + tagging + deleting all work.

**Red flags:** any of those features missing (means the `NoteActionButtons` / `NoteMetaStrip` extraction didn't get used in zen page), or behavior diverges between zen and IDE (means the shared-component refactor was lossy).

## 12 — End-to-end integration tests  (10 min)

```sh
# Bring up local Postgres 17 (via Homebrew if not already)
./scripts/start-local-db.sh

DATABASE_URL="postgresql://$USER@localhost:5432/simplerdev_test" \
DATABASE_URL_TEST="postgresql://$USER@localhost:5432/simplerdev_test" \
NODE_OPTIONS='--max-old-space-size=4096' \
npx vitest run --project=integration-api tests/integration/api/brain/knowledge.test.ts

# Then the new extras spec:
DATABASE_URL="postgresql://$USER@localhost:5432/simplerdev_test" \
DATABASE_URL_TEST="postgresql://$USER@localhost:5432/simplerdev_test" \
NODE_OPTIONS='--max-old-space-size=4096' \
npx vitest run --project=integration-api tests/integration/api/brain/knowledge-extras.test.ts
```

**Expect:** 18/18 + 42/42 in isolation.

If you run them together as `tests/integration/api/brain/knowledge.test.ts tests/integration/api/brain/knowledge-extras.test.ts`, expect ONE flake on the bulk-hard-delete test caused by the pre-existing pgvector / `brain_embeddings` infrastructure issue (also affects `brain-tasks` tests on staging). Not a regression.

**Red flags:** any test fails in isolation, or new test failures in `knowledge.test.ts` (the soft-delete contract update is the only intended change there).

## 13 — E2E spec smoke (optional, 5 min)

The new `tests/e2e/brain-knowledge.spec.ts` exercises 6 flows via API. It needs the dev server + a seeded DB.

```sh
scripts/test.sh --layer=e2e --tag=@brain --no-coverage
```

**Expect:** all `@brain` e2e tests pass.

## Rollback plan

If anything in production-adjacent looks wrong:

```sh
git -C simplerdevelopment2026 reset --hard be9fb2ea7^
```

That returns staging to the pre-merge head (`b76dea044`). The two migrations (`0070_*`, `0071_*`) are idempotent additive — they do not need rollback unless you also want the `deleted_at` column gone. To remove:

```sql
DROP TABLE IF EXISTS brain_saved_searches;
DROP INDEX IF EXISTS brain_notes_tags_gin_idx;
DROP INDEX IF EXISTS brain_notes_client_active_idx;
ALTER TABLE brain_notes DROP COLUMN IF EXISTS deleted_at;
```

## What to ship after verification

1. Push staging to origin (`git push origin staging`) — your call, per your no-push-to-main rule.
2. Optionally PR `staging` → `main` if the rest of the staging delta is also ready.
3. Apply migrations 0070 + 0071 to the production database (idempotent, safe).
