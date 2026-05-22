---
name: sd-brain-promote-to-document
description: Promote a Company Brain note into a versioned, role-scoped document with required-reads + acknowledgments. Three modes — (A) promote-from-note (single existing note becomes the seed of a new document's v1), (B) author-from-scratch (no source note, full interview for title + category + first body), (C) bulk-promote (pasted list of note ids OR a tag prefix matching multiple notes, each becomes its own document). Then optionally assigns required-reads to specific people or to whole org units, with optional due dates. Returns the portal URL(s). Use when the user says 'promote this note to a doc', 'turn note X into an SOP', 'make a policy from this note', 'we need to require everyone in <team> to read this', 'create an onboarding doc from <note>', 'this note is now official', 'publish this as documentation'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-promote-to-document

Turn a Company Brain note (or a blank sheet) into a versioned, role-scoped **document** — the canonical surface for SOPs, policies, guides, references, and announcements. Documents differ from notes: they carry a draft / published version chain, optional required-reads with acknowledgment tracking, and links to topics / decisions / initiatives / people.

Three modes:

- **A — promote-from-note**: one existing note becomes the seed body of a new document's v1 draft.
- **B — author-from-scratch**: no source note; full interview for title + category + first body.
- **C — bulk-promote**: a list of note ids OR a tag, each note becomes its own document.

After the document is created, optionally assign required-reads (per-person or org-unit-wide) and link to related Brain entities.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed — every step depends on the client/brand/portalDomain already being resolved.
2. **Confirm brain entitlement.** The MCP server only exposes `brain_*` tools when the active client has Brain enabled. If `mcp__simplerdevelopment-postcaptain__brain_dashboard_summary` returns "scope not granted", stop and tell the user to enable Brain in their portal subscription.
3. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules`. Pay particular attention to client-specific rules about default category, default confidentialityLevel, default-publish-vs-leave-draft, and whether to auto-prompt for required-reads. Documents are role-scoped and acknowledged; the cost of a wrong default ripples into every member of the targeted org unit.
4. **Pull the portal domain** from `.sd/config.json` (or `whoami` if not present) so the output URL is correct: `https://<portalDomain>/portal/brain/documents/<id>`.

## Mode detection

| User intent | Mode |
|---|---|
| "Promote this note", "turn note #42 into an SOP", reference to one specific note | **A — promote-from-note** |
| "Write a new SOP for X", "create a policy on Y", no source note | **B — author-from-scratch** |
| "Promote all notes tagged 'sops'", "promote notes 12, 13, 14", any list intent | **C — bulk-promote** |

If the user's intent is ambiguous, ask one short clarifying question — don't guess. A request to promote a single note that doesn't yet exist should fall back to mode B with a confirm ("there's no note for this — author from scratch instead, ok?").

## Mode A — promote-from-note

1. **Resolve the source note.** The user may give an id, a slug, or a title. Always resolve to a numeric `noteId` before proceeding:
   - If id given: confirm with `brain_get_note({ noteId })` — surface the title and first 80 chars of body.
   - If title or phrase given: `brain_list_notes({ search: <query>, limit: 5 })` — surface candidates with their ids and bodyPreview. Pick one with the user.
   - If the user says "this note" without context: default to the most recently updated note (`brain_list_notes({ limit: 1 })`) and confirm before continuing.

2. **Already-promoted check.** Run `brain_documents_list({ search: <note.title>, limit: 5 })` to surface any existing documents that may have been seeded from this note. The slim list does not return `sourceNoteId`, so you may need to call `brain_documents_get({ id })` on the top match. If a hit looks like the same source, ask: "There's already a document `<doc.title>` that looks seeded from this note. Edit the existing doc, or create a new one anyway?" Default to editing the existing doc unless the user says new.

3. **Confirm the promote.** Show the user:
   - Source note: `<id> — <title>` + 80-char body preview.
   - Target title (default = note title; user can override, ≤255 chars).
   - Category — pick one of `sop | policy | guide | reference | announcement | other`. Default `reference`. Ask if the user hasn't said; don't guess from the note body.
   - confidentialityLevel — `standard | restricted | confidential`. Default `standard`. Bump to `restricted` for HR / finance / customer-named content; bump to `confidential` for comp / legal / M&A.

4. **Create the document.** Call `brain_documents_promote_from_note({ noteId, title?, category? })`. Echo is slim: `{ documentId, slug, version1Id }`. The new document is `status='draft'` with v1 also draft, body pre-populated from the note.

5. **Publish-now decision.** Ask: "Publish v1 now, or leave as draft for editing first?"
   - **Publish now**: call `brain_documents_publish({ id: documentId })`. On `error: 'empty_draft_body'`, fall through to edit-first.
   - **Edit first**: surface the edit URL `https://<portalDomain>/portal/brain/documents/<id>/edit` and stop. The user comes back later to publish via this skill or the UI.

## Mode B — author-from-scratch

Full interview. Ask these prompts; skip any the user has already provided in the initial message.

1. **Title** (required, ≤255 chars). Short noun phrase. Example: "On-Call Escalation Procedure".
2. **Category** (required for clarity — don't guess). `sop | policy | guide | reference | announcement | other`. If the user names a verb-like artifact ("incident response runbook"), `sop`. If it's a rule ("acceptable use policy"), `policy`. If it's reference ("our cloud cost dashboard glossary"), `reference`. Confirm.
3. **Summary** (optional, ≤500 chars, one line). The card subtitle that appears in the documents list view.
4. **Body** (required for publish, optional for draft). Multi-line markdown. If the user only gave a title, ask: "Want to start with a stub (a few section headings I generate) or leave the body blank for now and edit in the portal?" Do NOT fabricate body content beyond a heading scaffold without explicit consent.
5. **Owner** (optional). The person responsible for keeping this doc current. If the user names a person, resolve via `brain_people_list({ search: <name>, limit: 5 })` and pick. If unresolved, leave `ownerId: null` — don't block.
6. **confidentialityLevel** (optional, default `standard`). Same scale as mode A. Ask if the doc touches comp / legal / customer-named content.
7. **defaultTopicIds** (optional). If the user mentioned a topic ("file this under engineering"), resolve via `brain_topics_tree({ includeDescriptions: false })` and let the user pick.

Then:

1. `brain_documents_create({ title, category, ownerId?, confidentialityLevel?, defaultTopicIds? })` → `{ id, slug, status: 'draft', version1Id }`.
2. If the user provided a body OR a summary, call `brain_document_versions_edit_draft({ documentId, patch: { body?, summary? } })`. Echo: `{ documentId, versionId, versionNumber, isDraft: true }`.
3. **Publish-now decision** — same as mode A. If yes, `brain_documents_publish({ id: documentId })`. On `empty_draft_body` error, surface and stop with the edit URL.

## Mode C — bulk-promote

1. **Resolve the source list.** Two sub-paths:
   - **Explicit ids**: user pasted `12, 13, 14` or `[12, 13, 14]`. Parse, dedupe, validate each via `brain_get_note({ noteId })` (or `brain_list_notes` with a follow-up id-filter — but a direct loop is fine for ≤20 ids). Surface count + first 5 titles.
   - **Tag**: user said "all notes tagged `sops`" or "everything under tag `onboarding/`". `brain_list_notes` accepts `tag` (exact match) but NOT a `tagPrefix` argument — surface this honestly. If the user gave an exact tag, use `brain_list_notes({ tag: '<value>', limit: 200 })`. If they gave a prefix-like value (ends with `/` or contains a wildcard), fall back to `brain_list_notes({ search: '<value>', limit: 200 })` and ask the user to confirm the candidate list before promoting.

2. **Pre-flight check.** If count > 50, push back once: "That's <N> notes — each becomes its own document with its own version chain and possible required-reads. Proceed, or narrow the tag?" Wait for explicit yes.

3. **Shared defaults.** Ask for:
   - Shared `category` (one of the six). Same default-`reference` rule.
   - Shared `confidentialityLevel` (default `standard`).
   - Auto-publish or leave-as-draft. Default: leave-as-draft (safer; user previews in portal before publish).
   - Title strategy: keep each note's title verbatim (default) OR apply a common prefix ("On-Call: <noteTitle>"). Ask only if the user hinted at a series.

4. **Already-promoted check (batch).** For each note id, optionally check `brain_documents_list({ search: <note.title>, limit: 2 })`. This is best-effort and may produce false positives — surface "likely duplicate" rows for the user to skip, don't auto-skip.

5. **Execute.** For each note in the resolved list:
   ```
   brain_documents_promote_from_note({ noteId, title?, category })
   → { documentId, slug, version1Id }

   if (autoPublish) {
     brain_documents_publish({ id: documentId })
     → { id, versionId, versionNumber, status: 'published', publishedAt }
   }
   ```
   Collect results into a table. On individual error, capture the message and continue with the next note — do NOT abort the whole batch.

6. **Return summary table:**

   | documentId | title | status | url |
   |---|---|---|---|
   | 124 | On-Call Escalation | published | /portal/brain/documents/124 |
   | 125 | Incident Postmortem Template | draft | /portal/brain/documents/125 |

   Plus totals: `Promoted <N> notes: <published-count> published, <draft-count> drafts, <error-count> errors.` List every error verbatim — the user needs to fix them.

## Optional follow-up — assign required-reads

After the document (or each document in mode C) is created, ask: "Make this required reading for specific people or for whole org units?" Skip silently if the user says no.

**Per-person:**

1. Resolve target person — `brain_people_list({ search: <name>, limit: 10 })`. Render the slim list with Material Icon `person` per row; never emojis.
2. Ask for an optional `dueAt` (ISO date string). If the user gave a phrase like "by Friday" or "in two weeks", resolve to a concrete date and confirm before sending.
3. Call:
   ```
   brain_document_required_reads_assign({
     documentId,
     targetType: 'person',
     targetId: <personId>,
     dueAt?: '<ISO date>'
   })
   ```
   Echo: `{ assigned, alreadyAssigned }`.

**Per-org-unit (expand to all active members):**

1. `brain_org_units_tree({})`. Render the tree with `folder` / `folder_open` for parents and `label` for leaves (Material Icons). Show each node's `memberCount` so the user understands the blast radius.
2. Let the user pick one org-unit id.
3. Ask whether to expand to current members (default `true` — this is what most users actually want; without expand the row only applies to the org-unit, not its people).
4. Optional `dueAt` — same handling as per-person.
5. Call:
   ```
   brain_document_required_reads_assign({
     documentId,
     targetType: 'org_unit',
     targetId: <orgUnitId>,
     expandOrgUnit: true,
     dueAt?: '<ISO date>'
   })
   ```
   Echo includes `expandedTo: <count>` — the number of active members the row was fanned out to.

**Summary line:** "Assigned to <N> people across <org-unit-name(s)>." Surface that `expandOrgUnit: true` takes a current snapshot — new members added to the org unit later will NOT automatically inherit this required-read; the user must re-run the assign to pick them up.

In mode C, ask once whether to apply the same required-reads to **every** promoted document, or only the first one — don't loop the question.

## Optional follow-up — link to related entities

Ask once: "Link this document to any topics, initiatives, decisions, meetings, glossary terms, or people?" Skip silently if no.

For each entity the user names, resolve the id (`brain_topics_tree`, `brain_initiatives_list`, `brain_decisions_list`, `brain_list_meetings`, `brain_glossary_lookup`, `brain_people_list` — match the entity type) then call:

```
brain_documents_link({
  documentId,
  entityType: 'topic' | 'initiative' | 'decision' | 'meeting' | 'glossary_term' | 'person',
  entityId: <id>,
  note?: '<optional context>'
})
```

Echo: `{ linkId, alreadyLinked }`. Idempotent — re-linking the same entity returns `alreadyLinked: true` with `linkId: null`. Surface the link count in the final summary.

## MCP tool sequence

The ordered calls a model running this skill should make. Skip any call whose inputs the user didn't provide.

```
0. (always) read .sd/config.json + .sd/learnings.md

MODE A — promote-from-note:
1. brain_list_notes({ search }) OR brain_get_note({ noteId })   # resolve source
2. brain_documents_list({ search: noteTitle, limit: 5 })        # already-promoted check
3. brain_documents_promote_from_note({ noteId, title?, category? })
4. (optional) brain_documents_publish({ id })

MODE B — author-from-scratch:
1. (optional) brain_people_list({ search })                     # resolve owner
2. (optional) brain_topics_tree({})                             # resolve defaultTopicIds
3. brain_documents_create({ title, category, ownerId?, confidentialityLevel?, defaultTopicIds? })
4. (if body or summary provided) brain_document_versions_edit_draft({ documentId, patch })
5. (optional) brain_documents_publish({ id })

MODE C — bulk-promote:
1. (per id) brain_get_note({ noteId })                          # validate
   OR brain_list_notes({ tag, limit: 200 })                     # tag-based resolution
2. (per note) brain_documents_promote_from_note({ noteId, category })
3. (per doc, if autoPublish) brain_documents_publish({ id })

OPTIONAL — required-reads (after any mode):
4. brain_people_list({ search }) OR brain_org_units_tree({})
5. brain_document_required_reads_assign({
     documentId, targetType, targetId, expandOrgUnit?, dueAt?
   })

OPTIONAL — links (after any mode):
6. brain_documents_link({ documentId, entityType, entityId, note? })

FINAL:
7. brain_documents_get({ id })                                  # fetch summary for output
```

## Output contract

**Mode A or B (single doc):**

- Portal URL: `https://<portalDomain>/portal/brain/documents/<id>`.
- One-line summary in this exact format (Material Icons over emojis):
  - `Promoted: <title> [<category> · <status> · v<versionNumber> · confidentiality: <level>]`
  - Example: `Promoted: On-Call Escalation [sop · published · v1 · confidentiality: standard]`
- If left as draft, surface the edit URL: `https://<portalDomain>/portal/brain/documents/<id>/edit`.
- Required-reads summary (if assigned): `Required for <N> people across <org-unit-names | named-people>.`
- Links summary (if linked): bullet list of entity type + id + note.

**Mode C (bulk):**

- One-line totals: `Bulk promote: <N> documents created — <published-count> published, <draft-count> draft, <error-count> errors.`
- Result table (documentId / title / status / url) — first 20 rows; if more, note "and <M> more — see portal".
- Full error list verbatim if any.
- If required-reads were applied across the batch, summary line: `Required for <N> people across <M> documents.`

## Edge cases

- **Note already promoted.** A document with `sourceNoteId = <noteId>` already exists. The `brain_documents_list` slim shape does not return `sourceNoteId` directly, so the check is best-effort via title search. When in doubt, surface "looks like a possible match" and ask the user to choose edit-existing vs create-new.
- **Title slug collision.** The backend auto-suffixes `-2`, `-3`, … on slug collision. Surface the actual slug returned in the echo (`out.document.slug`) so the user knows the URL — don't hide it.
- **Empty body on publish.** `brain_documents_publish` returns `{ error: 'empty_draft_body', message: ... }`. Catch this and surface: "Draft has no body — let's add content first." Hand back the edit URL and stop. Do NOT silently insert placeholder content.
- **Bulk tag matches zero notes.** Surface count=0, suggest checking the tag spelling, and offer `brain_list_notes({ limit: 20 })` to browse what tags exist. Don't create empty documents.
- **Bulk tag matches > 50 notes.** Push back once with the count and ask to narrow.
- **"This note" without resolved reference.** Default to the most recently updated note via `brain_list_notes({ limit: 1 })`. Always confirm the title before promoting.
- **Org-unit assign on an org-unit with zero active members.** `expandedTo: 0`. Surface: "That unit currently has no active members — the row was created at the org-unit level but didn't fan out to anyone. Add members to the unit, then re-run the assign."
- **Confidentiality bump after creation.** This skill creates with the chosen `confidentialityLevel`. If the user wants to bump it later, use `brain_documents_update` directly — out of scope for this skill.
- **Publishing a doc that has no current draft.** Happens if the doc was just published and the user calls publish again. The backend refuses; surface the message and suggest `brain_document_versions_edit_draft` first to start a new draft.
- **Required-read with `dueAt` in the past.** The backend accepts it (no validation), so the dashboards will show "overdue" immediately. Confirm with the user before sending if the parsed date is in the past.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Brain entitlement missing** → `brain_*` tools return "scope not granted". Tell the user to enable Brain in their portal subscription.
- **`brain_documents_promote_from_note` returns "Note not found"** → the noteId is stale or belongs to another tenant. Re-resolve via `brain_list_notes`.
- **`brain_documents_publish` returns `empty_draft_body`** → surface the message, hand back the edit URL, do NOT retry.
- **`brain_document_required_reads_assign` returns `alreadyAssigned: 1`** → idempotent; treat as success and surface "already assigned to that target — updated `pinnedVersionId` / `dueAt` if changed".
- **`brain_documents_link` returns `alreadyLinked: true, linkId: null`** → idempotent; treat as success.

## Feedback handoff

At the very end of the run, if the user has given concrete feedback during the conversation (e.g. "default category to `sop` not `reference`", "always ask about required-reads, don't make me prompt for it", "skip the publish-now question in bulk mode", "stop asking about confidentiality when the source note is `standard`"), invoke `sd-learn`:

```
sd-learn with:
  artifact: document <id>   (or `document-bulk <timestamp>` for mode C)
  feedback: "<verbatim user feedback>"
  skill: sd-brain-promote-to-document
```

Match how `sd-create-page` and `sd-brain-record-decision` call `sd-learn` — pass the artifact ref + verbatim feedback, let `sd-learn` derive the rule and update `.sd/learnings.md`'s `## Active rules` section. Future runs of this skill will read that file and apply the rules.

If the user only confirmed without editing ("looks good, ship it"), don't pollute the log — skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-promote-to-document" ~/.claude/skills/sd-brain-promote-to-document
```
