/**
 * CommentSidebar — right-rail listing of all threads on an entity.
 *
 * Header: "Comments (N open)" + tab strip (Open / Resolved).
 * Body: scrolling list of `<ThreadCard />`.
 * Footer: top-level `<ComposeBox />` to start a new thread.
 *
 * The host (post / deck / email editor) supplies the team `members[]` for
 * mention autocomplete + author resolution. The sidebar is otherwise self-
 * contained: it owns its tab + composer state, drives the `useComments`
 * hook, and dispatches optimistic mutations.
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { useComments, type EntityType } from '@/lib/realtime/use-comments';
import { ThreadCard } from './ThreadCard';
import { ComposeBox, type ComposeMember } from './ComposeBox';

export interface CommentSidebarProps {
  entityType: EntityType;
  entityId: string;
  /** Awareness from the realtime provider — enables instant cross-peer refetch. */
  awareness?: Awareness | null;
  members: ComposeMember[];
  currentUserId: number;
  isAdmin?: boolean;
  /** Optional resolver to render anchor previews ("On block <label>"). */
  resolveBlockLabel?: (blockId: string) => string | null;
  /** Hide the sidebar (without unmounting) — wraps with `display: none`. */
  hidden?: boolean;
  /** Click handler for the close button in the header. */
  onClose?: () => void;
  /**
   * Width of the rail in pixels. Default 360. Editors can pin to a panel and
   * pass `null` to disable the explicit width (let parent flexbox govern it).
   */
  width?: number | null;
  /**
   * Extra classes for the root. Editors can pass `relative` instead of the
   * default `fixed` positioning when mounting inside their own layout.
   */
  className?: string;
  /**
   * When set, scroll the matching thread into view + auto-open its reply
   * composer. Used to deep-link from anchor pin clicks.
   */
  focusedThreadId?: string | null;
  /** Callback after the focusedThreadId has been consumed (clears caller state). */
  onFocusConsumed?: () => void;
}

type Tab = 'open' | 'resolved';

export function CommentSidebar(props: CommentSidebarProps): JSX.Element {
  const {
    entityType,
    entityId,
    awareness = null,
    members,
    currentUserId,
    isAdmin,
    resolveBlockLabel,
    hidden = false,
    onClose,
    width = 360,
    className = '',
    focusedThreadId = null,
    onFocusConsumed,
  } = props;

  const {
    threads,
    loading,
    error,
    refresh,
    createThread,
    reply,
    resolve,
    unresolve,
    deleteComment,
  } = useComments({ entityType, entityId, awareness });

  const [tab, setTab] = useState<Tab>('open');

  const { open, resolved } = useMemo(() => {
    const o: typeof threads = [];
    const r: typeof threads = [];
    for (const t of threads) {
      if (t.resolved) r.push(t);
      else o.push(t);
    }
    return { open: o, resolved: r };
  }, [threads]);

  const visible = tab === 'open' ? open : resolved;

  const widthStyle =
    width !== null ? { width: `${width}px` } : undefined;

  return (
    <aside
      className={`flex flex-col bg-background border-l border-border ${
        hidden ? 'hidden' : ''
      } ${className}`}
      style={widthStyle}
      aria-label="Comments"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="material-icons text-muted-foreground"
            style={{ fontSize: '18px' }}
          >
            comment
          </span>
          <h2 className="text-sm font-semibold truncate">
            Comments
            <span className="ml-1 text-muted-foreground font-normal">
              ({open.length} open)
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors"
            title="Refresh"
            aria-label="Refresh comments"
          >
            <span className="material-icons" style={{ fontSize: '18px' }}>
              refresh
            </span>
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors"
              title="Close"
              aria-label="Close comments"
            >
              <span className="material-icons" style={{ fontSize: '18px' }}>
                close
              </span>
            </button>
          ) : null}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border bg-muted/20" role="tablist">
        {(['open', 'resolved'] as const).map((key) => {
          const active = key === tab;
          const count = key === 'open' ? open.length : resolved.length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`flex-1 text-xs font-medium py-2 transition-colors capitalize ${
                active
                  ? 'border-b-2 border-blue-600 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {key}
              <span className="ml-1 text-muted-foreground/70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Threads list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="flex items-center justify-center text-xs text-muted-foreground py-6">
            <span
              className="material-icons animate-spin mr-1"
              style={{ fontSize: '16px' }}
            >
              progress_activity
            </span>
            Loading…
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">
            <span
              className="material-icons block mx-auto mb-1 text-muted-foreground/50"
              style={{ fontSize: '32px' }}
            >
              {tab === 'open' ? 'forum' : 'check_circle'}
            </span>
            {tab === 'open'
              ? 'No open comments. Be the first to leave one.'
              : 'No resolved comments yet.'}
          </div>
        ) : (
          visible.map((t) => (
            <div
              key={t.threadId}
              data-thread-id={t.threadId}
              ref={(el) => {
                if (
                  el &&
                  focusedThreadId &&
                  focusedThreadId === t.threadId
                ) {
                  // Scroll to the focused thread on first paint, then consume.
                  el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                  });
                  onFocusConsumed?.();
                }
              }}
            >
              <ThreadCard
                thread={t}
                members={members}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                resolveBlockLabel={resolveBlockLabel}
                onReply={async (tid, body, ids) => {
                  await reply(tid, body, ids);
                }}
                onResolve={async (tid) => {
                  await resolve(tid);
                }}
                onUnresolve={async (tid) => {
                  await unresolve(tid);
                }}
                onDelete={async (cid) => {
                  await deleteComment(cid);
                }}
                openComposerInitial={focusedThreadId === t.threadId}
              />
            </div>
          ))
        )}
      </div>

      {/* New-thread composer (only on the open tab — resolved is read-only) */}
      {tab === 'open' ? (
        <div className="border-t border-border p-2">
          <ComposeBox
            members={members}
            placeholder="Start a new comment thread…"
            submitLabel="Comment"
            onSubmit={async (body, ids) => {
              await createThread(body, undefined, ids);
            }}
          />
        </div>
      ) : null}
    </aside>
  );
}

export default CommentSidebar;
