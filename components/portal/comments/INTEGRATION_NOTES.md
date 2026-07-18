# Comments — editor integration notes

For Phase 2a/2b/2c authors wiring the comments system into post / deck / email editor surfaces. Read once before mounting; keep the components themselves opaque.

## Mount points

- **Top bar** — drop `<CommentsButton open={open} onToggle={...} openCount={N} />` next to other side-panel toggles. `openCount` should come from `useComments(...).threads.filter(t => !t.resolved).length` (or just call `useComments` once at the editor root and pass the slice down). The button is presentational; it doesn't fetch data on its own.

- **Right rail** — render `<CommentSidebar entityType=... entityId=... awareness={awareness} members={members} currentUserId={uid} />` inside the editor's split layout. The sidebar internally calls `useComments`, so each editor only needs to mount it (no double-fetch). Pass `awareness` from `useRealtimeDoc(...)` for live cross-peer refetch — omit it for a REST-only mode.

- **Canvas overlay** — wrap your block / slide canvas in a `position: relative` container, then mount `<AnchorPinLayer threads={threads} ... />` inside it as a sibling of the canvas. Pass the same mutation handlers you got from `useComments` (`reply`, `resolve`, `unresolve`, `deleteComment`). Pin coordinates use the same coordinate space as the layer's bounding box — record click coords relative to that wrapper, **not** the viewport.

## Click-to-anchor capture

- On the canvas wrapper, attach an `alt+click` (Mac: `option+click`) listener. In the handler, compute coords relative to the wrapper's bounding rect and call `createThread('', { x, y, blockId? })` then immediately open the sidebar with the new thread focused (use the `focusedThreadId` prop on `<CommentSidebar />` to scroll-to and auto-open the reply composer). Empty-body threads aren't allowed by the API — open the composer with a placeholder seeded from the click target instead and submit only after the user types.

- For block-anchored comments (no x/y), pass `{ blockId }` from your selection model. For deck slides, pass `{ slideIndex, blockId? }`. For form-field-anchored comments (e.g. SEO field), pass `{ fieldPath: 'seo.title' }` — the sidebar shows it as "On field <fieldPath>".

## Filtering pins per surface

- Deck editor — pass `activeAnchorFilter={(a) => a.slideIndex === currentSlideIndex}` to `<AnchorPinLayer />` so only pins on the visible slide render. Post / email surfaces typically render all positional pins unfiltered.

- To resolve `anchor.blockId` → human label ("Hero", "Image grid"), pass `resolveBlockLabel={(id) => yourBlockMap.get(id)?.type ?? null}` to both the sidebar and the pin layer. Without it, `ThreadCard` falls back to printing the raw blockId.

## Realtime broadcast

- The `awareness` object from `useRealtimeDoc` is the only realtime hook-up needed. `useComments` (used internally by `<CommentSidebar />` and via `useCommentsRealtime` directly) sets a transient `commentEvent` awareness key on every local mutation; peers debounce-refetch the comments REST endpoint on receipt. There is **no separate WebSocket protocol** to wire — if Yjs is connected, comments broadcast.

- If your editor calls `useComments` standalone (e.g. for a count badge in the header) you can omit `awareness` and it'll just be a REST call. Don't double-mount with awareness in two places — open multiple instances will fight over optimistic state.

## Members list (mention autocomplete)

- The host editor must supply `members: { id, name, avatar? }[]`. The recommended source is the existing portal team list (see `team_list_members` MCP tool / corresponding REST endpoint) — fetch once at editor mount, memoize.

## Permissions

- `currentUserId` and `isAdmin` are needed by `<CommentSidebar />` and `<AnchorPinLayer />` for the delete-button gate. Read them from your existing portal session context. Resolve / unresolve is open to anyone with portal access; the API enforces this.

## Don't

- Don't call `/api/portal/realtime/comments` directly — go through `useComments`. Optimistic UI + rollback is built-in.
- Don't pass `siteId` — comments are scoped by `clientId` server-side and `entityType` + `entityId` client-side. The site is implicit in the active portal client.
- Don't try to render mentions yourself — `<CommentBodyRenderer body={...} />` (exported alongside `MentionPill`) handles `@[Name](id)` markup.
