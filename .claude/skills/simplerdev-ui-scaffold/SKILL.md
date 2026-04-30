---
name: simplerdev-ui-scaffold
description: Scaffold admin and/or portal UI pages for an existing CRUD resource in simplerdevelopment2026. Creates page.tsx files with inline create/edit forms, data tables, and loading states following repo conventions. Pairs with simplerdev-feature-scaffold. Use when the user says 'scaffold UI for X', 'add admin page for X', 'add portal page for X', 'wire up UI for X', or after running simplerdev-feature-scaffold and wanting the UI layer.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# simplerdev-ui-scaffold

Generates admin and portal CRUD pages matching the conventions already established in this repo. Always read the existing canonical pages first — never generate from memory alone.

## Repo UI conventions (constraints — do not deviate)

### Styling
- **Tailwind semantic tokens only**: `bg-card`, `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `bg-primary`, `bg-primary/90`, `bg-accent`, `border-border`, `divide-border`.
- **Dark-mode aware action text**: `text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300` for edit. `text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300` for delete.
- **Icons**: Material Icons only (never emojis). Use `<span className="material-symbols-outlined text-lg">{icon_name}</span>`.
- **Layout wrapping**: Admin layout (`app/admin/layout.tsx`) and Portal layout (`app/portal/layout.tsx`) automatically wrap child pages. Do not add wrappers.

### Page structure
Every CRUD page follows this exact pattern:
```
'use client';
→ imports (useState, useEffect, useParams if portal-site)
→ interface for the resource type
→ default export function
→ state: items[], loading, showForm, editing, form, saving, error
→ load() fetch function
→ useEffect → load()
→ handleSubmit (POST or PUT based on editing state)
→ handleEdit (populate form + setEditing)
→ handleDelete (confirm prompt + DELETE)
→ JSX: header bar + toggle form button, inline form (conditionally rendered), table
```

### Canonical references (always read before generating)
- **Admin**: `app/admin/categories/page.tsx`
- **Portal-site**: `app/portal/websites/[siteId]/categories/page.tsx`

Read these files at the start of every invocation. Mirror structure line-for-line, only swapping field names and API paths.

## Inputs to collect

1. **Resource name** (singular, camelCase): e.g. `serviceArea`. Must match what `simplerdev-feature-scaffold` created.
2. **Display name** (human-readable): e.g. "Service Area". Inferred from resource name if not given.
3. **Plural display name**: e.g. "Service Areas".
4. **Scope(s)** — which pages to generate (can be multiple):
   - `admin` → `app/admin/<kebab-plural>/page.tsx`, hits `/api/<kebab-plural>`
   - `portal-site` → `app/portal/websites/[siteId]/<kebab-plural>/page.tsx`, hits `/api/portal/cms/websites/${siteId}/<kebab-plural>` **Default.**
   - `portal-client` → `app/portal/<kebab-plural>/page.tsx`, hits `/api/portal/<kebab-plural>`
5. **Fields** — the resource's user-editable fields with types. Auto-detect from the schema if already scaffolded: `grep` the table export from `lib/db/schema.ts` and parse field names + types. Only fields that appear in the schema are valid — never invent fields.
6. **Material icon name** — for sidebar (e.g. `map`, `inventory_2`, `receipt_long`). Ask user if not obvious.

Single confirmation round, then generate.

## What to generate

### Admin page (`app/admin/<kebab-plural>/page.tsx`)

Mirror `app/admin/categories/page.tsx` exactly. Key adjustments:
- **Interface**: fields from the schema (not just name/slug/description).
- **formData state**: one key per editable field, correct defaults (empty string for text, `false` for boolean, `''` for optional).
- **API path**: `/api/<kebab-plural>` (and `/api/<kebab-plural>/${id}` for edit/delete).
- **Table columns**: one `<th>` + `<td>` per visible field. Boolean fields render "Yes"/"No". Timestamps render with `new Date(...).toLocaleDateString()`. JSON fields render "[JSON]" or a count.
- **Form inputs**: text `<input>` for varchar/text, `<input type="number">` for integer/numeric, `<select>` for fields with known options, `<input type="checkbox">` for boolean.
- **Auto-slug**: If the schema has both `name` and `slug` fields, auto-generate slug from name on create (match the `generateSlug` helper from portal categories page). No auto-slug on edit.
- **Empty state**: "No {plural} yet. Create your first {singular} to get started!"

### Portal-site page (`app/portal/websites/[siteId]/<kebab-plural>/page.tsx`)

Mirror `app/portal/websites/[siteId]/categories/page.tsx`. Key differences from admin:
- Uses `useParams<{ siteId: string }>()` for site scoping.
- API base: `/api/portal/cms/websites/${siteId}/<kebab-plural>`.
- Includes `saving` + `error` state (admin version is simpler — portal is the reference for better UX).
- `generateSlug` helper inlined if name+slug fields exist.
- Error display: `{error && <p className="text-sm text-red-500">{error}</p>}` above submit button.

### Portal-client page (`app/portal/<kebab-plural>/page.tsx`)

Like portal-site but without `useParams` or siteId. API base: `/api/portal/<kebab-plural>`.

## Sidebar entry (manual step — flagged, not auto-generated)

After generating pages, print the exact snippet the user should add to `components/portal/PortalSidebar.tsx`:

```ts
{ href: `/portal/websites/${activeSiteId}/<kebab-plural>`, label: '<Display Plural>', icon: '<material_icon>' },
```

Tell the user WHERE to add it (e.g. "under the CMS section, after the Taxonomies entry"). Read the sidebar file and identify the right section. Do NOT auto-edit the sidebar — it has complex nesting logic that varies by feature area.

For admin pages, check if there's an admin sidebar component. If yes, print the snippet. If no, flag it.

## Procedure

1. Confirm inputs (resource, scope, fields, icon) in one round.
2. Read canonical reference pages:
   - `Read app/admin/categories/page.tsx`
   - `Read app/portal/websites/[siteId]/categories/page.tsx`
3. If fields not explicitly given, detect from schema:
   ```
   Grep lib/db/schema.ts for the table export and extract field definitions.
   ```
4. Generate page file(s) with `Write`.
5. Read `components/portal/PortalSidebar.tsx` — find the best insertion point for the nav entry.
6. Print:
   - Files created (with paths).
   - Sidebar snippet + where to insert it.
   - Remaining manual steps: admin sidebar entry (if applicable), any data seeding needed.

## Field type → input type mapping

| Drizzle type | Form input | Display in table |
|---|---|---|
| `varchar`, `text` | `<input type="text">` or `<textarea>` (for `text` > 100 char likely) | String value |
| `integer`, `numeric` | `<input type="number">` | Number |
| `boolean` | `<input type="checkbox">` | "Yes" / "No" |
| `timestamp` | `<input type="datetime-local">` | `new Date(val).toLocaleDateString()` |
| `json` | Skip in form (or use textarea for simple cases) | "[Object]" or field count |
| `varchar` with known enum-like options (e.g. status) | `<select>` with `<option>` | Badge or plain text |

## What this skill is NOT

- Not an API route generator — use `simplerdev-feature-scaffold` for that.
- Not a sidebar auto-editor — it prints the snippet, user inserts.
- Not a component library builder — these are standalone pages, no shared abstractions.
- Does not create sub-pages (detail views, nested routes). Flags them as follow-ups if the schema suggests them.

## Failure modes to watch for

- API route doesn't exist yet → warn user to run `simplerdev-feature-scaffold` first (or confirm the route path manually).
- Schema table not found → halt, ask for field definitions.
- Page already exists at target path → halt, ask to overwrite or skip.
- Fields with foreign keys (e.g. `userId`, `websiteId`) → exclude from the form (these are set by the API route, not the UI). Do include read-only display in the table if useful.
