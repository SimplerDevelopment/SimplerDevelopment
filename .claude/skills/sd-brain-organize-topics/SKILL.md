---
name: sd-brain-organize-topics
description: Build or reorganize the Company Brain topic taxonomy. Two modes — (A) import: turns existing note tags into a hierarchical topic tree via brain_topics_import_from_tags (dry-run first, then commit on user confirmation), (B) manual: builds a topic tree from scratch via brain_topics_create. Also supports rename, move, merge, and bulk-attach. Use when the user says 'organize my topics', 'set up my topic tree', 'import my tags as topics', 'clean up my brain tags', 'build a taxonomy', 'add a topic for X', 'merge these topics', 'rename this topic'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-organize-topics

Build or reorganize the Company Brain topic taxonomy. Topics are a hierarchical cross-cutting tag system — every brain entity (note, meeting, task, decision, relationship-overlay) can be attached to one or more topics, and topics organize into a tree so "all hiring decisions" works whether they're filed under `/operations/hiring/engineering` or `/operations/hiring/sales`.

This skill picks one of three modes based on intent, runs the appropriate MCP calls, and returns the updated tree + portal URL.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed.
2. **Confirm brain entitlement.** Topics live behind the `brain:write` scope. If unavailable, stop with the same message as `sd-brain-record-decision`.
3. **Read `.sd/learnings.md`** — apply `## Active rules`. Topic taxonomy rules accumulate fast ("never put `clients/<name>` under root; nest under `/clients/<name>`", "always merge `hire` → `hiring`").
4. **Pull the portal domain** for the final output URL: `https://<portalDomain>/portal/brain/topics`.

## Decision tree (which mode)

| User intent | Mode |
|---|---|
| "Import my existing tags as topics" / "turn the `kb/*` tags into a tree" / "clean up brain tags" | **A — import** |
| "Build a topic tree from scratch" / "set up topics" / "give me a starter taxonomy for an agency" | **B — manual** |
| "Rename topic #5 to 'Hiring'" / "merge `hire` into `hiring`" / "move `/seo` under `/marketing`" / "attach these notes to `/ops`" | **C — one-shot ops** |

If the user's intent could fit multiple modes (e.g. "organize my topics — I have some tags already"), ask explicitly: "import first then refine, or start from scratch?"

## Mode A — import from existing tags

Imports `brain_notes.tags` strings into a hierarchical topic tree. Slash-separated tag values (`kb/marketing/seo`) become nested topics (`kb` → `marketing` → `seo`); flat tags (`hiring`) become root topics. The leaf topic for each tag is attached to every note that bears that tag.

### Steps

1. **Audit current tags.** Surface the user's existing tag landscape so they know what they're about to convert. Call `brain_topics_import_from_tags({ dryRun: true })` (no `tagPrefix` for a full survey).
   - Render the `perTopic` array as an indented tree, sorted by `path`, with `noteCount` per leaf.
   - Use Material Icons (`folder` / `folder_open` / `label`), never emojis.

2. **Ask: tag-prefix filter?** Some tenants have a mix of categorical (`kb/marketing/seo`) and free-form (`todo`, `idea`) tags. Offer to scope:
   - "Import everything" → no `tagPrefix`.
   - "Only `kb/*`" → `tagPrefix: 'kb'`.
   - "Only `clients/*`" → `tagPrefix: 'clients'`.
   - Multiple prefixes need multiple runs (the tool accepts one prefix per call).

3. **Confirm.** Show the user the dry-run tree one more time with the chosen prefix applied. Ask: "ship it?"

4. **Commit.** Re-run `brain_topics_import_from_tags({ tagPrefix: '<prefix-or-undefined>', dryRun: false })`.

5. **Render the result.** `{ topicsCreated, notesAttached, perTopic }`. Surface the counts plainly:
   - `Imported: <topicsCreated> new topics created, <notesAttached> note-topic attachments.`
   - Bullet list of the top-5 leaf topics by `noteCount`.

6. **Show the final tree.** Call `brain_topics_tree({ includeDescriptions: false })` and render it as the canonical structure going forward.

### Idempotency note

`brain_topics_import_from_tags` is idempotent — re-running with the same tags produces no duplicate topics and no duplicate join rows. Safe to re-run after the user adds more tags to notes.

## Mode B — manual tree from scratch

Build the taxonomy by interview when the user has no useful existing tags (or a brand-new tenant).

### Steps

1. **High-level domains (5–10 first-level topics).** Ask: "what are the big buckets you want everything to live under?" Common starters for a business workspace:
   - `operations`, `marketing`, `sales`, `clients`, `product`, `finance`, `people`, `kb`, `decisions`, `playbooks`
   - Don't impose this list — let the user name their own. The skill is taxonomy-agnostic.

2. **Per-domain children (2–5 each).** For each domain, ask "what lives under `<domain>`?" Examples:
   - `operations` → `hiring`, `vendors`, `infrastructure`, `legal`
   - `marketing` → `content`, `seo`, `paid`, `email`, `events`
   - `clients` → one child per active client name

3. **Create root topics first** with `brain_topics_create({ name, description?, color?, icon? })`:
   - For each root, capture the returned `{ id, slug, path, parentId }` so children can reference `parentId`.

4. **Create children**, passing the parent's `id` as `parentId`:
   - `brain_topics_create({ name: 'hiring', parentId: <operationsId> })`.
   - The helper auto-derives `slug` and `path` (`/operations/hiring`).

5. **Optional cosmetics.** If the user wants visual differentiation, set `color` (hex string) and `icon` (Material Icons name — `folder`, `business`, `groups`, `lightbulb`, `science`, etc.) on each topic via `brain_topics_update`. Never emojis.

6. **Return the tree** via `brain_topics_tree({ includeDescriptions: false })`. Confirm with the user that the shape matches what they asked for.

### Starter trees (offer if asked)

If the user says "give me a starter taxonomy" without specifics, propose one of these and confirm before creating:

- **Consulting agency:** `operations` / `clients` / `marketing` / `sales` / `people` / `finance` / `kb`
- **SaaS product co:** `product` / `engineering` / `growth` / `customers` / `operations` / `finance` / `kb`
- **Solo / personal:** `work` / `personal` / `health` / `learning` / `kb`

Apply one starter set, then immediately offer to flesh out each root with 2–3 children.

## Mode C — one-shot ops

The user has a tree already and wants a specific change. Use these tools directly — no interview needed beyond confirming the target.

| Op | Tool | Input shape |
|---|---|---|
| Rename | `brain_topics_update` | `{ id, patch: { name?, description?, color?, icon?, sortOrder? } }` — NB: rename does NOT change slug (stable URLs) |
| Move (reparent) | `brain_topics_move` | `{ id, newParentId | null }` — `null` promotes to root. Refuses cycles. |
| Merge | `brain_topics_merge` | `{ sourceId, targetId }` — fold source into target: reattach entity links (skipping dupes), reparent source's children under target, then delete source. |
| Delete | `brain_topics_delete` | `{ id, force? }` — refuses if topic has children (resolve via merge or delete-children first); refuses if entities attached unless `force=true`. |
| Bulk attach | `brain_topics_attach` | `{ targetEntityType: 'note' | 'meeting' | 'task' | 'decision' | 'relationship_overlay', targetEntityId, topicIds: [...] }` — idempotent. |
| Bulk detach | `brain_topics_detach` | `{ targetEntityType, targetEntityId, topicIds: [...] }` |

### Looking up the id

If the user names a topic by string (`/operations/hiring`) rather than id, resolve via `brain_topics_list({ tagPrefix: 'operations' })` or `brain_topics_tree` first and confirm the id with the user before mutating.

### Common one-shots

- **"Rename `/ops` to `/operations`."** → `brain_topics_update({ id, patch: { name: 'operations' } })`. Note the slug stays `ops` for stable URLs; if the user wants a new slug too, delete-and-recreate (warn that all existing attachments must be re-attached).
- **"Merge `hire` into `hiring`."** → resolve both ids via `brain_topics_list`, then `brain_topics_merge({ sourceId: <hire>, targetId: <hiring> })`. Confirm `entitiesReattached` + `childrenReparented` in output.
- **"Move `/seo` under `/marketing`."** → `brain_topics_move({ id: <seoId>, newParentId: <marketingId> })`. The whole subtree's `path` is rewritten atomically.
- **"Promote `/marketing/email` to top-level."** → `brain_topics_move({ id, newParentId: null })`.

## MCP tool sequence

Every tool this skill may call. The skill picks a subset based on mode.

```
READ:
  brain_topics_list({ tagPrefix?, includeEntityCounts? })
  brain_topics_tree({ includeDescriptions? })
  brain_topics_get({ id })
  brain_topics_entities({ topicId, limit?, offset? })

WRITE (mode A):
  brain_topics_import_from_tags({ tagPrefix?, dryRun? })

WRITE (mode B):
  brain_topics_create({ name, parentId?, description?, color?, icon?, sortOrder?, derivedFromTag? })
  brain_topics_update({ id, patch: { name?, description?, color?, icon?, sortOrder? } })

WRITE (mode C):
  brain_topics_update  ← same as above
  brain_topics_move({ id, newParentId | null })
  brain_topics_merge({ sourceId, targetId })
  brain_topics_delete({ id, force? })
  brain_topics_attach({ targetEntityType, targetEntityId, topicIds: [] })
  brain_topics_detach({ targetEntityType, targetEntityId, topicIds: [] })
```

## Output contract

Return to the user:

- The final topic tree as an indented list (Material Icons, never emojis):
  ```
  folder operations
    label hiring
      label engineering
      label sales
    label vendors
  folder marketing
    label seo
    label email
  ```
- The portal URL: `https://<portalDomain>/portal/brain/topics`.
- A one-line summary keyed to the mode:
  - Mode A: `Imported <topicsCreated> topics, attached <notesAttached> notes.`
  - Mode B: `Built <topicCount> topics across <rootCount> domains.`
  - Mode C: a one-line description of the op (`Renamed #5 → 'operations'`, `Merged 'hire' into 'hiring' (12 entities reattached, 0 children)`, etc.).

## Edge cases

- **Empty tag landscape.** `brain_topics_import_from_tags({ dryRun: true })` returns `{ topicsCreated: 0, notesAttached: 0, perTopic: [] }`. Tell the user there's nothing to import and suggest Mode B instead.
- **Existing topics conflict with import.** The import is find-or-create per segment — if `/operations` already exists, the importer reuses it and just adds children. Surface this in the dry-run output ("the following already exist: ...") so the user isn't surprised.
- **Cycle attempts.** `brain_topics_move` refuses if `newParentId` is a descendant of `id` ("cannot move a topic under one of its own descendants"). Likewise `brain_topics_merge` refuses target-is-descendant-of-source. Surface the error verbatim; suggest moving the descendant out first.
- **Slug stability on rename.** Renaming `'ops'` → `'operations'` keeps slug `ops` and path `/ops` (stable URLs). If the user expected the path to change too, walk them through delete-and-recreate (note: all attachments must be redone).
- **Delete with entities attached.** Returns `{ error: 'has_entities', message: '... pass force=true ...' }`. Confirm with the user before retrying with `force: true` — the join rows are dropped permanently.
- **Delete with children.** Returns `{ error: 'has_children', message: 'delete them first or merge into another topic' }`. Offer the merge path.
- **Materialized path drift.** If `brain_topics_list` returns paths that look stale after a move/merge (rare — the helpers rewrite atomically), surface to the user. Don't try to repair manually; this is a data-integrity bug, route to the platform team.

## Failure modes

- **No `.sd/config.json`** → run `sd-init` first.
- **Brain entitlement missing** → "scope not granted".
- **Tag-prefix returns nothing in dry-run** → user's tags don't start with that prefix; surface the available top-level segments from a no-prefix dry-run as a hint.
- **`brain_topics_create` rejects on duplicate slug** → shouldn't happen (helper auto-suffixes), but if it does, surface the conflict to the user verbatim and re-try with a renamed input.

## Feedback handoff

At the end of the run, if the user has given concrete feedback (e.g. "next time always import with `dryRun: true` first even when I say go", "default the color to brand primary on root topics", "merge always uses the older id as the target"), invoke `sd-learn`:

```
sd-learn with:
  artifact: topics <mode-letter>
  feedback: "<verbatim user feedback>"
  skill: sd-brain-organize-topics
```

If the user only confirmed ("looks good"), skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-organize-topics" ~/.claude/skills/sd-brain-organize-topics
```
