---
name: simplerdev-mcp-tool
description: Add new MCP tools to the in-repo SimplerDevelopment portal MCP server. Registers tool handlers, input schemas, scope guards, and optionally creates adapter files for larger feature sets. Use when the user says 'add MCP tool for X', 'expose X via MCP', 'new MCP tool', 'wire X into the MCP server', or when building features that should be accessible to AI clients via the portal MCP.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# simplerdev-mcp-tool

Adds MCP tool(s) to the SimplerDevelopment portal MCP server (`lib/mcp/server.ts`). Two patterns exist — pick the right one based on scope.

## Repo MCP conventions (constraints — do not deviate)

### Architecture
- **Server factory**: `lib/mcp/server.ts` exports `buildMcpServer(ctx: PortalMcpContext)`. All tools register inside this function.
- **Transport**: Stateless `WebStandardStreamableHTTPServerTransport` in `app/api/mcp/route.ts`. Don't touch this file.
- **Auth context**: `ctx.client.id`, `ctx.userId`, `ctx.scopes` from `@/lib/mcp-auth`.

### Tool registration
```ts
server.registerTool(
  'tool_name',             // snake_case, prefixed by domain (e.g. crm_, tickets_, posts_)
  {
    title: 'Human title',
    description: 'What it does. One sentence.',
    inputSchema: {         // Zod shapes — NOT z.object(), just the fields directly
      field: z.string().min(1),
      optional: z.number().optional(),
    },
  },
  async (args) => {
    if (!requireScope(ctx, 'domain:read')) return denied('domain:read');
    // ... Drizzle query scoped to clientId ...
    return json(result);
  }
);
```

### Helpers (already defined in server.ts — never redefine)
- `json(payload)` → wraps in MCP text content
- `denied(scope)` → permission denied response with `isError: true`
- `requireScope(ctx, scope)` → boolean check
- `serializePostContent({ blocks?, content? })` → block-editor JSON
- `postProjection(includeContent?)`, `deckProjection(includeSlides?)`, `campaignProjection(includeContent?)` → slim-by-default column projections for known heavy tables. Use these for any new tool that selects/returns from `posts`, `pitchDecks`, or `emailCampaigns`. See `simplerdev-mcp-token-budget` for the rules and the recipe for adding a new projection helper.

### Token budget — critical for any tool returning bodies
Before writing a `_list`, `_create`, or `_update` whose underlying table contains a text/json blob (>~10 KB typical), READ `simplerdev-mcp-token-budget`. Slim-by-default projections + opt-in `includeContent`/`includeSlides` flags are mandatory for new tools. A `_list` that returns multi-MB rows by default is a regression even if it works.

### Scope convention
- Read tools: `domain:read` (e.g. `crm:read`, `tickets:read`, `sites:read`)
- Write tools: `domain:write`
- Use existing scope strings when extending an existing domain. New domains need a new scope string — flag this to the user so they can update the API key creation UI.

### Two patterns

**Pattern A: Inline** — 1-4 tools for an existing or small domain.
- Add `server.registerTool(...)` blocks directly in `lib/mcp/server.ts` inside `buildMcpServer()`.
- Add schema imports at the top of the file if needed.
- Place tools in the appropriate section (look for `// ── SECTION ──` comments).

**Pattern B: Adapter** — 5+ tools or complex logic that deserves its own file.
- Create `lib/<feature>/mcp-tools.ts` with pure handler functions (no SDK dependency).
- Create `lib/<feature>/mcp-sdk-adapter.ts` that imports handlers and registers them on the McpServer.
- Call `register<Feature>ToolsOnSdk(server, ctx)` from `buildMcpServer()` in server.ts.
- Reference: `lib/branding/mcp-sdk-adapter.ts` + `lib/branding/mcp-tools.ts`.

## Inputs to collect

1. **Feature domain**: e.g. "invoices", "surveys", "booking". Maps to scope prefix and tool name prefix.
2. **Tools to add**: list of operations (e.g. "list, get, create, update, delete").
3. **Schema table(s)**: which Drizzle tables to query. Auto-detect by grepping `lib/db/schema/` (the schema is split into per-domain modules; the barrel `lib/db/schema/index.ts` re-exports all of them).
4. **Scope**: existing or new? Check if `domain:read`/`domain:write` already exists in the codebase.
5. **Pattern A or B?**: Decide based on tool count. 1-4 → A. 5+ → B. If the domain already has an adapter file → always B.

One confirmation round, then generate.

## Procedure

1. Confirm inputs.
2. **Always read first**:
   - `Read lib/mcp/server.ts` — understand current structure, find insertion point.
   - `Grep lib/mcp-auth.ts` for existing scopes if relevant.
   - Grep `lib/db/schema/` for the table to understand its fields (schema is split into per-domain modules; import from the barrel `@/lib/db/schema`).
3. If Pattern A:
   - `Edit lib/mcp/server.ts` — add schema import(s) at top if missing.
   - `Edit lib/mcp/server.ts` — insert `server.registerTool(...)` blocks before the `// ── META ──` or `return server;` line (whichever makes sense for the domain's position).
4. If Pattern B:
   - `Write lib/<feature>/mcp-tools.ts` with handler functions.
   - `Write lib/<feature>/mcp-sdk-adapter.ts` with registration function.
   - `Edit lib/mcp/server.ts` — add import + call to registration function.
5. Report:
   - Files created/modified.
   - New scope strings introduced (if any) — remind user to add them to the API key creation form.
   - How to test: `curl -X POST http://localhost:3000/api/mcp -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool_name>","arguments":{...}}}'`

## Tool naming conventions

| Domain | List | Get | Create | Update | Delete |
|---|---|---|---|---|---|
| projects | projects_list | projects_get | projects_create | projects_update | projects_delete |
| crm contacts | crm_contacts_search | crm_contacts_get | crm_contacts_create | crm_contacts_update | — |
| tickets | tickets_list | tickets_get | tickets_create | — | — |
| email | email_lists | — | — | — | — |

Follow this naming: `{domain}_{operation}`. Use `_search` instead of `_list` when the tool takes a query parameter.

## Resource registration (optional)

If the tool set benefits from a reference document (like blocks-schema for posts), register a resource:
```ts
server.registerResource(
  'resource-name',
  'scheme://path',
  { title: '...', description: '...', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: CONTENT }] })
);
```

## Failure modes

- **Duplicate tool name** → `registerTool` will throw at runtime. Grep server.ts for the name first.
- **Missing schema import** → TypeScript error. Always check the import block at the top of server.ts.
- **New scope not in API key UI** → tools work for admin keys but fail for scoped keys. Flag clearly.
- **Pattern B adapter not called** → tools silently absent. Verify the `register...OnSdk(server, ctx)` call exists in `buildMcpServer()`.
