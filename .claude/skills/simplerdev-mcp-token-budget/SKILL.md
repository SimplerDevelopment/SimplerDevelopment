---
name: simplerdev-mcp-token-budget
description: Audit and refactor MCP tools in lib/mcp/server.ts (and adapter files in lib/<feature>/mcp-*.ts) to keep response payloads small. Apply slim-by-default projections, opt-in include flags, and compact write-echoes so callers do not blow their token budget on every list/create/update round trip. Use when the user says 'reduce MCP tokens', 'audit MCP payloads', 'mcp response too big', 'trim mcp echo', 'why is the MCP so expensive', when adding any new MCP tool that touches a large text/json column, or proactively after adding a tool whose response shape includes a body/HTML/blocks blob.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# simplerdev-mcp-token-budget

Keep the SimplerDevelopment portal MCP cheap to call. The platform exposes ~180 tools; each response lands in someone's context window. A single sloppy `posts_list` can dump 19 MB of block JSON into a planner that asked one question. This skill encodes the rules that prevent that — and the recipe for fixing tools that already do it.

## The four rules

### 1. Slim by default — opt in to heavy fields
Any tool that returns rows containing text/JSON columns >~10 KB MUST default to a slim projection that excludes them. Add an `includeContent: z.boolean().default(false).optional()` arg (or domain-appropriate name like `includeSlides`, `includeBody`, `includeHistory`) to opt back in.

### 2. Don't echo what the caller just sent
For writes, the caller already has the input. Returning identity + freshness fields (`id`, `slug`, `updatedAt`, `status`) is enough to confirm success. The full body is only useful when the server transformed it (e.g. `serializePostContent` wrapped raw text into a block) — and even then, gate it behind `includeContent: true`.

### 3. Project at the DB, not in JS
Use Drizzle's `.select(SLIM_COLUMNS).from(...)` and `.returning(SLIM_COLUMNS)` — fetching the full row then deleting fields wastes DB bandwidth too. Define `SLIM_*_COLUMNS` / `FULL_*_COLUMNS` const objects near the top of `server.ts` (or in the relevant adapter file) so the projection is reusable.

### 4. Add a `_get` companion when the list row is heavy
If callers might want one full row, give them `<domain>_get` instead of forcing them through `<domain>_list({ limit: 1, includeContent: true })`. Cheaper, clearer, and the description can document the cost.

## Where the heavy fields live (audit map — keep current)

| Table | Heavy column(s) | Slim helper in server.ts |
|---|---|---|
| `posts` | `content`, `customCss`, `customJs`, `seoDescription` | `SLIM_POST_COLUMNS` / `postProjection(includeContent)` |
| `pitchDecks` | `slides` (V2 block JSON, often multi-MB) | `SLIM_DECK_COLUMNS` / `deckProjection(includeSlides)` |
| `emailCampaigns` | `htmlContent`, `blockContent` | `SLIM_CAMPAIGN_COLUMNS` / `campaignProjection(includeContent)` |
| `emailTemplates` | `htmlContent`, `blockContent` | inlined `.returning({...})` in `email_templates_create` |
| `postRevisions` | `content` | (not yet — flag if you touch it) |
| `proposals` | `sections`, `lineItems`, `fees` | (not yet — likely candidates) |
| `crmContracts` | `clauses`, body text | (not yet) |
| `aiConversations` | full message thread | (not yet — `ai_conversations_get`) |
| `pitchDeckVersions` | `slides` | (not yet) |
| brain notes | full document body | check `lib/brain/mcp-tools.ts` adapter |
| store products | descriptions, image arrays | check `lib/storefront/mcp-sdk-adapter.ts` |

When you discover a new heavy column, **add a row to this table in the same PR** so the next person doesn't re-discover it.

## Recipe — fixing an existing tool

Use this when reviewing a tool whose response is too large.

1. **Read the schema** for the underlying table (`Grep "^export const <table>" lib/db/schema.ts`). Identify columns >~10 KB typical or unbounded text/json.
2. **Define slim/full projections** at module level (after `revalidateForWrite`, before `buildMcpServer`):
   ```ts
   const SLIM_FOO_COLUMNS = {
     id: foos.id,
     name: foos.name,
     // ...everything except the heavy field(s)
   } as const;
   const FULL_FOO_COLUMNS = { ...SLIM_FOO_COLUMNS, body: foos.body } as const;
   function fooProjection(includeBody?: boolean) {
     return includeBody ? FULL_FOO_COLUMNS : SLIM_FOO_COLUMNS;
   }
   ```
3. **Update `_list`** to add `includeContent` (or `includeBody`/`includeSlides`) input arg + use `db.select(fooProjection(includeContent))`.
4. **Update `_create` / `_update`** to add the same flag + `.returning(fooProjection(includeContent))`. For `update` whose handler is destructured (`async ({ id, ...rest })`), pull the flag out: `async ({ id, includeContent, ...rest })`.
5. **Update tool descriptions** to mention the cost and the opt-in: e.g.
   > "Returns the slim projection by default (no content blob); pass `includeContent: true` only when you genuinely need the full body — for block-rich pages each post can be multi-MB."
6. **Add a `_get` companion** if one doesn't exist and the table holds full bodies. Mirror the `includeContent` flag.
7. **Typecheck**: `npx tsc --noEmit 2>&1 | grep -E "lib/mcp/"`. Pre-existing errors in `tests/**` are unrelated; ignore them.
8. **Update the audit map above** with the new helper name.

## Recipe — adding a new tool that returns rows

Use this for new tools (often via `simplerdev-mcp-tool` or `simplerdev-feature-scaffold`).

Before writing the handler, ask:
1. **Does any column on this row exceed ~10 KB typical?** Check the schema. If yes, follow the slim/full projection pattern above from the start.
2. **Does the write echo a body the caller just sent?** If yes, return slim + `includeContent` opt-in. The default echo should fit in <2 KB.
3. **Will callers commonly want one row in full?** If yes, add a `_get` even if a `_list` exists.
4. **Is the default limit bounded?** `_list` should default to `limit: 50` and cap at 200 (`z.number().min(1).max(200).default(50).optional()`).
5. **Does the description warn about cost?** Tools that can return >100 KB even on slim projections should say so in the description so the planner budgets accordingly.

## Red flags during code review

| Pattern | Smell |
|---|---|
| `db.select().from(t)` with no projection | Defaults to all columns — unsafe if any are heavy |
| `.returning()` with no projection | Echoes the full row to the caller |
| `_list` without a `limit` arg | Unbounded scan; one call returns the whole table |
| Tool description without cost shape | Caller has no signal that this is expensive |
| `_list` includes a heavy column by default | Forces every list call to pay that cost |
| Missing `_get` next to a `_list` whose rows are heavy | Forces full-body fetches through the list |

## What "small enough" means

Rough rule of thumb for the slim default:
- **<2 KB per row in `_list`**, multiplied by a default limit of 50 = <100 KB worst case for the slim list.
- **<2 KB per write echo** for `_create` / `_update`.
- Anything bigger should require an explicit opt-in.

The MCP transport JSON-encodes everything, then the LLM tokenizes the JSON — roughly 4 chars/token for English text and JSON, less for dense data. 100 KB ≈ 25K tokens. Most tasks burn out at 200K context, so a single careless tool call can consume an eighth of a session.

## Don't do these

- **Don't strip fields in JS after a `select()`** — wastes DB bandwidth, defeats the point.
- **Don't make `includeContent` default `true`** — defeats the entire framework.
- **Don't omit the flag entirely** — there are legitimate reasons to need the body (e.g. duplicating a post). Provide the opt-in.
- **Don't add `fields` array projection** unless there's a clear need — the boolean flag is enough for the 90% case and is far easier to implement safely.
- **Don't pre-truncate strings** (e.g. `excerpt.slice(0, 200)`) in the projection — callers expect real values. Excluding the column entirely is honest; truncating is silently lossy.
- **Don't change non-MCP code paths** — the visual editor reads `posts.content` directly via the REST API and Drizzle. Only the MCP tool surface needs the slim default.

## Test impact

Existing E2E tests (`tests/e2e/portal-mcp-approvals.spec.ts`, `tests/e2e/cron-expire-mcp-pendings.spec.ts`) pass `content` as input but generally don't read `content` from the response — they assert on `id`, `pendingId`, `status`. So the slim default is usually backward-compatible. After applying the recipe:

```bash
bun test:critical                        # golden-path E2E
npx tsc --noEmit 2>&1 | grep "lib/mcp/"  # confirms no new lib-side errors
```

If a test breaks because it read `content` / `slides` / `htmlContent` off a write response, the right fix is usually to update the test to either (a) pass `includeContent: true` if it really needed the body, or (b) fetch via the corresponding `_get` tool.

## Procedure when invoked

1. Ask the user: *audit one tool, audit one domain, or audit everything?* Default to "one domain" — full-server audits are slow and produce sprawling diffs.
2. For the chosen scope, list candidate tools (grep `registerTool` in `lib/mcp/server.ts` and adapter files; cross-reference with the schema for heavy columns).
3. For each candidate, apply the **fixing-an-existing-tool** recipe.
4. Update the **audit map** in this skill file with any new helpers added.
5. Run typecheck. Report the diff: tool names changed, new args, projection helpers added, audit-map updates.
6. Suggest a commit message in the form `refactor(mcp): slim <domain> response payloads`.

## Reference change set

The original audit (April 2026) shipped these files as the working example. Read them before making your own pass — they show the exact code shape:

- `lib/mcp/server.ts` — `SLIM_POST_COLUMNS` / `postProjection`, `SLIM_DECK_COLUMNS` / `deckProjection`, `SLIM_CAMPAIGN_COLUMNS` / `campaignProjection`, plus the `posts_list` / `posts_get` / `posts_create` / `posts_update` / `decks_*` / `email_campaigns_*` / `email_templates_create` updates.
