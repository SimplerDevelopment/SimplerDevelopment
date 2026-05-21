---
name: sd-brain-define-term
description: Define one or many Company Brain glossary terms. Two modes — (A) single-term interview (term, definition, short definition, aliases, category, owner, related terms); (B) bulk import of a pasted list (parses 'term: definition' lines or JSON arrays and calls brain_glossary_bulk_import). Always runs brain_glossary_lookup first to surface possible duplicates before creating. Returns the portal URL(s) and a summary. Use when the user says 'define X', 'add term X to brain', 'set up our glossary', 'import these acronyms', 'capture the project jargon', 'build the glossary'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-define-term

Interview the user for one new glossary term — or parse a pasted list and bulk-import a batch — and write the result to the Company Brain. Always runs `brain_glossary_lookup` first so a tenant never ends up with two near-identical entries for the same acronym.

Glossary terms are flat (no hierarchy). Slug is auto-derived from `term` on create and is **stable** — renames change the display name only, never the URL. Aliases are substring-matched on lookup. "See also" pointers (`relatedTermIds`) are JSON-stored and not FK-enforced.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed — every step depends on the client/brand/site already being resolved.
2. **Confirm brain entitlement.** The MCP server only exposes `brain_*` tools when the active client has Brain enabled. If `mcp__simplerdevelopment-postcaptain__brain_dashboard_summary` returns "scope not granted", stop and tell the user to enable Brain in their portal subscription.
3. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules`. Pay particular attention to client-specific rules about category naming, owner-required conventions, or acronym-disambiguation patterns. Glossary entries are looked up by every other Brain feature (Ask, dashboards, future embedder), so a wrong category or a missing alias has high downstream cost.
4. **Pull the portal domain** from `.sd/config.json` (or `whoami` if not present) so the output URL is correct: `https://<portalDomain>/portal/brain/glossary/<id>`.

## Decision tree (which mode)

| User intent | Mode | Primary tools |
|---|---|---|
| "Define X" / "add term X" / "what does Y mean here, capture it" | **A — single** | `brain_glossary_lookup` → `brain_glossary_create` |
| Pasted block with multiple `Term: Definition` lines, or a JSON array | **B — bulk** | `brain_glossary_lookup` (per row) → `brain_glossary_bulk_import` |
| "Rename Foo to Bar" / "add alias Z to Foo" / "deprecate Foo" | **C — edit** | `brain_glossary_list` (find id) → `brain_glossary_update` |

If the user's intent is ambiguous, ask one short clarifying question — don't guess. A list of three or fewer terms is usually still mode A run three times unless the user explicitly says "bulk".

## Mode A — single-term interview

1. **Ask for the term.** Required, ≤200 chars. Strip trailing punctuation. Preserve the casing the user gave (the canonical "GDPR" stays uppercase; "Series A" stays title-cased).

2. **Duplicate check — ALWAYS, before anything else.** Run:
   ```
   brain_glossary_lookup({ query: <term>, limit: 5 })
   ```
   Inspect the response:
   - `exact_term` match (score 10) → surface the existing entry verbatim and ask: "Is this the same term — should I update the existing entry (mode C), or is this a different sense and you want a new row?" Do NOT proceed to create without the user's answer.
   - `exact_alias` match (score 8) → "This term is already an alias on `<other.term>`. Promote it to a new top-level term, or leave it as the alias?"
   - `term_prefix` / `alias_prefix` matches → list the top 3 ("found similar: …") and ask once whether the user wants to continue with a new entry.
   - No match → proceed silently.

3. **Ask for the definition.** Required. Full markdown allowed; no length cap in the MCP tool but treat >2000 chars as "long" and confirm. Do NOT fabricate from the term name alone — if the user only gave a name, ask.

4. **Ask for a short definition.** Optional, ≤500 chars, **one line**. Used inline by future Ask query expansion. If the user wrote a long definition, propose a one-line summary derived from it and ask them to confirm/edit; do not silently generate one.

5. **Ask for aliases.** Optional, comma- or newline-separated. Trim each, dedupe, drop empties. Examples to give the user:
   - `GDPR` → aliases: `General Data Protection Regulation, EU privacy regulation`.
   - `ASC 606` → aliases: `revenue recognition standard, ASC606`.
   Aliases are substring-matched on lookup, so common misspellings and short forms belong here.

6. **Ask for a category.** Optional, ≤100 chars, free-form. UI groups by category in the list view. Suggest the categories already present in the tenant (`brain_glossary_list({ limit: 100 })` and dedupe the `category` field) so the user doesn't fragment the taxonomy. If none yet, offer common defaults (`acronym`, `product`, `process`, `role`, `metric`, `legal`).

7. **Ask for an owner.** Optional. The person to ask if the definition needs to change later. If the user gives a name (not a user id), try `brain_search({ query: "<name>", types: ["contact"] })` to resolve. If unresolved, leave `ownerId: null` — don't block on it.

8. **"See also" — related terms.** If the user mentioned "related to X" or "see also Y" anywhere in the conversation, run `brain_glossary_lookup({ query: <X>, limit: 3 })` for each and propose adding their ids to `relatedTermIds`. Confirm before sending. Cross-tenant ids are silently filtered by the backend, but stale ids will linger in JSON — only add what `lookup` returned.

9. **Create.**
   ```
   brain_glossary_create({
     term, definition, shortDefinition?, aliases?,
     category?, ownerId?, relatedTermIds?,
     status: 'active', source: 'manual'
   })
   ```
   Echo is slim (`{ id, slug }`). Re-fetch the full row for the output summary via `brain_glossary_get({ id, include: ['definition', 'aliases'] })`.

## Mode B — bulk import

1. **Parse the pasted text.** Support both formats; auto-detect:
   - **Line-based.** One term per line, separator is `:` or ` - ` or ` — `. Skip blank lines and lines starting with `#`. Example:
     ```
     GDPR: General Data Protection Regulation — EU-wide privacy law.
     ASC 606 - Revenue recognition standard from FASB.
     ```
   - **JSON array.** `[{"term": "X", "definition": "Y", "aliases": ["Z"], "category": "legal"}, ...]`. Validate each item is an object with at least `term` and `definition`.
   - **Markdown table.** If the paste starts with `|` and has a `|---|` row, parse the columns and map them. Expect headers `Term | Definition | Aliases? | Category?` (case-insensitive). Aliases column is split on `,`. If the column names are non-standard, ask once before guessing.

2. **Per-row duplicate check.** For each parsed entry, run:
   ```
   brain_glossary_lookup({ query: <term>, limit: 1 })
   ```
   Classify each row as:
   - `new` — no `exact_term` match.
   - `would-update` — `exact_term` match exists; the slug will collide and the existing row will be updated (definition/shortDefinition/aliases/category replaced).
   - `duplicate-of-alias` — query matched `exact_alias` on a different term. Flag for human review — promoting an alias to a new top-level term is usually wrong.

3. **Show the preview.** Print three sections (`new: N`, `would-update: N`, `duplicate-of-alias: N`) with the first 5 terms in each, and ask one confirm question. Do NOT auto-import without a yes.

4. **Send the batch.**
   ```
   brain_glossary_bulk_import({ terms: [...] })
   ```
   The backend cap is 200. If the parsed list is larger, split into batches of 200 and call sequentially; sum the result counts. Each batch writes one audit row.

5. **Return the summary** — `{ created, updated, errors }` totals plus the first 5 created terms with their portal URLs and the full `errors[]` list. If `errors[].length > 0`, list every failure (term + message) — don't truncate, the user needs to fix them.

## Mode C — one-shot edits

Use `brain_glossary_update` directly. Slug stays stable — only the display `term` changes.

- **"Rename Foo to Bar."**
  1. `brain_glossary_list({ search: "Foo", limit: 5 })` to find the id.
  2. `brain_glossary_update({ id, patch: { term: 'Bar' } })`.
  3. Tell the user the URL is unchanged (`/portal/brain/glossary/<slug>` still resolves).
- **"Add alias Z to Foo."**
  1. Find id via list/lookup.
  2. `brain_glossary_get({ id, include: ['aliases'] })` to get current aliases.
  3. `brain_glossary_update({ id, patch: { aliases: [...existing, 'Z'] } })`. Dedupe before sending.
- **"Deprecate Foo."**
  1. Find id.
  2. `brain_glossary_update({ id, patch: { status: 'deprecated' } })`. Deprecated terms are excluded from `brain_glossary_lookup` (active-only) but remain visible in `brain_glossary_list`.
- **"Change Foo's owner / category."** Same pattern — patch the relevant field.
- **Hard delete** — not in this skill's scope. The MCP tool `brain_glossary_delete` exists for irreversible cleanup; if the user asks, confirm twice and call it explicitly.

## MCP tool sequence

The ordered calls a model running this skill should make. Skip any call whose inputs the user didn't provide.

```
0. (always, mode A and B per term)
   brain_glossary_lookup({ query, limit: 5 })
     → classify as new / exact-match / similar

1a. MODE A — single create:
    brain_glossary_create({
      term, definition,
      shortDefinition?, aliases?,
      category?, ownerId?, relatedTermIds?
    })
    → { id, slug }

1b. MODE B — bulk:
    brain_glossary_bulk_import({
      terms: [{ term, definition, shortDefinition?, aliases?, category? }]
    })
    → { created, updated, errors: [{ term, message }] }

1c. MODE C — edit:
    brain_glossary_list({ search, limit: 5 })
    brain_glossary_get({ id, include: ['aliases'] })   # only for alias-append
    brain_glossary_update({ id, patch })
    → { id, updatedFields }

2. (mode A only) re-fetch for output:
   brain_glossary_get({ id, include: ['definition', 'aliases'] })
```

## Output contract

**Mode A (single):**
- Portal URL: `https://<portalDomain>/portal/brain/glossary/<id>`.
- One-line summary in this exact format (Material Icons over emojis):
  - `Defined: <term> [<category | "uncategorized"> · <aliasCount> aliases · owner: <name | "unassigned">]`
  - Example: `Defined: GDPR [legal · 2 aliases · owner: Sarah Lee]`
- If "see also" terms were attached, list them as bullets with their slugs.

**Mode B (bulk):**
- One-line totals: `Bulk import: <created> created, <updated> updated, <errors.length> errors`.
- First 5 created terms as bullets, each with `<term> — <portalUrl>`.
- Full errors list if any (term + message per line).
- If batches were split, note `(across N batches of 200)`.

**Mode C (edit):**
- One-line confirmation: `Updated <term> [<fields-changed>]`.
- Portal URL (unchanged from before).
- If `status: 'deprecated'`, note "now excluded from lookup matches".

## Edge cases

- **Duplicate term name on create.** `brain_glossary_create` does not 409; the backend appends `-2`, `-3`, … to the slug to avoid collision, so the new row gets created with a stable-but-numbered URL. This is almost never what the user wants. **Always run lookup first** and ask the user explicitly whether to update the existing row (mode C) or add a category suffix to the new term (e.g. "PR (engineering)" vs "PR (marketing)").
- **Ambiguous acronym** (e.g. "PR" could be Public Relations or Pull Request). Require category to disambiguate. Store both as separate top-level terms (`PR` in category `marketing`, `PR` in category `engineering`) and cross-link via `relatedTermIds`. The aliases on each entry should NOT include the bare acronym again — it would defeat the disambiguation.
- **Markdown table paste.** Parse columns intelligently: detect headers, normalize to `term / definition / aliases / category`, split aliases on `,`. If the table has a `notes` or `owner` column, surface those to the user as "ignored — not part of the import schema, want me to merge them into definition?" rather than silently dropping.
- **Pasted text is one entry, not a list.** A paste with no separators is mode A, not B. Confirm before parsing: "Looks like one term, not a list — defining as a single entry, ok?"
- **External KB import** (Notion, Confluence, Wikipedia, etc.) is out of scope this branch. The only supported import path is `brain_glossary_bulk_import` with normalized JSON / line / table input. If the user asks, suggest they export their source to one of those formats and paste it.
- **Aliases array contains the term itself.** Strip it — the term is matched directly, the alias is redundant and inflates `aliasCount`.
- **`shortDefinition` longer than the full `definition`.** Surface as a warning ("short def is longer than the full def — swap them?") and ask before sending.
- **Definition is just a URL.** Push back once — a definition should explain what the term means in this workspace, not link out. Suggest the user paste the relevant excerpt and use the URL in the body for citation.
- **Empty definition.** The MCP tool refuses. Re-prompt for the definition; do NOT auto-fill with placeholder text.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Brain entitlement missing** → `brain_*` tools return "scope not granted". Tell the user to enable Brain in their portal subscription.
- **`brain_glossary_create` rejects missing required field** → surface the specific field name (`term` or `definition`) and re-prompt.
- **`brain_glossary_bulk_import` returns errors[]** → list every entry that failed with its message. Common causes: empty definition, term > 200 chars, malformed alias array.
- **Bulk batch size > 200** → split into chunks of 200 and call sequentially; do NOT silently truncate. Sum the result counts and surface "imported across N batches" in the output.
- **Lookup matches nothing but UI search shows a hit** → the existing term is likely `status: 'deprecated'` (lookup is active-only). Run `brain_glossary_list({ search: <term>, status: 'deprecated' })` to confirm and ask whether to reactivate (mode C `status: 'active'`) instead of creating a new row.

## Feedback handoff

At the very end of the run, if the user has given concrete feedback during the conversation (e.g. "always ask for owner before category", "default category to `acronym` if I don't say", "don't suggest aliases unless I ask", "skip the lookup step when I'm in bulk mode and already confirmed"), invoke `sd-learn`:

```
sd-learn with:
  artifact: glossary <id>   (or `glossary-bulk <timestamp>` for mode B)
  feedback: "<verbatim user feedback>"
  skill: sd-brain-define-term
```

Match how `sd-create-page` and `sd-brain-record-decision` call `sd-learn` — pass the artifact ref + verbatim feedback, let `sd-learn` derive the rule and update `.sd/learnings.md`'s `## Active rules` section. Future runs of this skill will read that file and apply the rules.

If the user only confirmed without editing ("looks good, ship it"), don't pollute the log — skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-define-term" ~/.claude/skills/sd-brain-define-term
```
