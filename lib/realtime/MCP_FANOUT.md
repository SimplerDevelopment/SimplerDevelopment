# MCP → Realtime fanout

When an MCP tool mutates a document that the visual editor renders (post, pitch deck, email campaign), we want any open editor session for that document to update **live**, without waiting for a refetch.

## How it works

After a successful DB write the MCP layer calls a publisher in `lib/realtime/internal-publisher.ts`:

1. Build a fresh `Y.Doc` containing the new desired state (`blocksToYArray` / `slidesToYArray`).
2. Encode it via `Y.encodeStateAsUpdate` and base64-wrap it.
3. POST `{ docKey, update }` to the realtime server's privileged `/internal/apply` endpoint with the `X-Internal-Secret` header.
4. The realtime server applies the Y update to its in-memory doc and broadcasts to connected peers. Snapshot persistence eventually flushes back to Postgres on its 2-second debounce.

Two call sites cover all relevant paths:

- **Direct apply** (`stageOrApply` non-staging branch in `lib/mcp/pending-changes.ts`) — via `publishEntityFromDb({ entityType, entityId })` which re-reads the entity and publishes its current state.
- **Post-approval** (`approvals_approve` in `lib/mcp/approvals.ts`) — same helper, fired after `applyPendingChange()`.
- **Direct DB inserts that bypass `stageOrApply`** (`posts_upload_html`, `decks_upload_html`) — explicit `publishBlocksUpdate` / `publishSlidesUpdate`.

## v1 tradeoff: full state replace, not diff

We do **not** compute a Y diff against the server's current state — we encode the full new state. When applied to the existing doc, `blocksToYArray` / `slidesToYArray` wipe and refill the array under a Y transaction, so peer edits to that array lose to the MCP write. That's the correct semantics for v1: MCP writes are authoritative. A future revision can switch to diff-based merging if we want true CRDT co-authorship between MCP and humans.

## Env vars

- `REALTIME_INTERNAL_URL` — base URL of the realtime server. Default: `http://localhost:3030`.
- `REALTIME_INTERNAL_SECRET` — shared secret matching the realtime server's. **If unset, publishes are skipped with a warning** — MCP writes still succeed.

## Local test

Start the realtime server (`bun run realtime:dev`), set both env vars in `.env.local`, open a post in the editor, then run an MCP tool that mutates that post (e.g. `posts_update`). The editor should reflect the change without a manual refresh.
