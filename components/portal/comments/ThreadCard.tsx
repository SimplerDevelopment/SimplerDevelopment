/**
 * ThreadCard — collapsible card showing a thread root + its replies.
 *
 * Replies are rendered as a flat list (one level deep). Action buttons:
 *   - Reply        (always visible while signed in)
 *   - Resolve / Unresolve
 *   - Delete       (root: author or admin; reply: author only)
 *
 * Anchor preview line — at most one is rendered, in priority order:
 *   1. blockId       → "On block <blockType>"
 *   2. slideIndex    → "On slide <index+1>"
 *   3. fieldPath     → "On field <fieldPath>"
 *   4. x/y           → "Pinned at <x>, <y>"
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import type { CommentAnchor } from '@/lib/db/schema/collab';
import type { CommentThread } from '@/lib/realtime/use-comments';
import { CommentBodyRenderer } from './MentionPill';
import { ComposeBox, type ComposeMember } from './ComposeBox';

export interface ThreadCardProps {
  thread: CommentThread;
  members: ComposeMember[];
  /** Current viewer's user id (for "may delete" gating). */
  currentUserId: number;
  /** True if the viewer is admin / has elevated permissions. */
  isAdmin?: boolean;
  /**
   * Resolves an authorId → display name + avatar. When the author isn't in
   * the supplied members list (e.g. left the team) we fall back to "User #id".
   */
  resolveAuthor?: (authorId: number) => {
    name: string;
    avatar?: string | null;
  };
  /**
   * Optional resolver for `anchor.blockId` → human-readable label
   * ("hero", "image-grid", etc). Editors will pass a function that walks
   * their block tree.
   */
  resolveBlockLabel?: (blockId: string) => string | null;
  onReply: (
    threadId: string,
    body: string,
    mentionedUserIds: number[]
  ) => Promise<void>;
  onResolve: (threadId: string) => Promise<void>;
  onUnresolve: (threadId: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  /**
   * Auto-open the reply composer when the card mounts. Used by the "Reply"
   * deep-link from anchor pins.
   */
  openComposerInitial?: boolean;
  /** When false, render compact (no inset, no shadow) — for popovers. */
  framed?: boolean;
}

function relativeTime(d: Date | string): string {
  const ms = Math.max(0, Date.now() - new Date(d).getTime());
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function anchorPreview(
  anchor: CommentAnchor | null,
  resolveBlockLabel?: (id: string) => string | null
): { icon: string; label: string } | null {
  if (!anchor) return null;
  if (anchor.blockId) {
    const label = resolveBlockLabel?.(anchor.blockId) ?? anchor.blockId;
    return { icon: 'view_quilt', label: `On block ${label}` };
  }
  if (typeof anchor.slideIndex === 'number') {
    return { icon: 'slideshow', label: `On slide ${anchor.slideIndex + 1}` };
  }
  if (anchor.fieldPath) {
    return { icon: 'edit_note', label: `On field ${anchor.fieldPath}` };
  }
  if (typeof anchor.x === 'number' && typeof anchor.y === 'number') {
    return {
      icon: 'place',
      label: `Pinned at ${Math.round(anchor.x)}, ${Math.round(anchor.y)}`,
    };
  }
  return null;
}

function Avatar({
  name,
  avatar,
  size = 24,
}: {
  name: string;
  avatar?: string | null;
  size?: number;
}): JSX.Element {
  const dim = `${size}px`;
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar}
        alt=""
        style={{ width: dim, height: dim }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <span
      style={{ width: dim, height: dim, fontSize: size * 0.45 }}
      className="inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold shrink-0"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ThreadCard(props: ThreadCardProps): JSX.Element {
  const {
    thread,
    members,
    currentUserId,
    isAdmin = false,
    resolveAuthor,
    resolveBlockLabel,
    onReply,
    onResolve,
    onUnresolve,
    onDelete,
    openComposerInitial = false,
    framed = true,
  } = props;

  const [composerOpen, setComposerOpen] = useState(openComposerInitial);
  const [collapsed, setCollapsed] = useState(false);

  const memberMap = useMemo(() => {
    const map = new Map<number, ComposeMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const author = (id: number): { name: string; avatar?: string | null } => {
    if (resolveAuthor) return resolveAuthor(id);
    const m = memberMap.get(id);
    if (m) return { name: m.name, avatar: m.avatar };
    return { name: `User #${id}` };
  };

  const rootAuthor = author(thread.root.authorId);
  const preview = anchorPreview(thread.root.anchor, resolveBlockLabel);

  const canDeleteRoot =
    isAdmin || thread.root.authorId === currentUserId;
  const canDeleteReply = (replyAuthorId: number): boolean =>
    replyAuthorId === currentUserId;

  const wrapperClasses = framed
    ? 'rounded-lg border border-border bg-background shadow-sm'
    : 'border-b border-border bg-background';

  return (
    <div className={`${wrapperClasses} ${thread.resolved ? 'opacity-70' : ''}`}>
      {/* Header row */}
      <div className="flex items-start gap-2 p-3">
        <Avatar name={rootAuthor.name} avatar={rootAuthor.avatar} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">
              {rootAuthor.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {relativeTime(thread.root.createdAt)}
            </span>
            {thread.resolved ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                <span
                  className="material-icons"
                  style={{ fontSize: '12px' }}
                >
                  check_circle
                </span>
                Resolved
              </span>
            ) : null}
          </div>

          {preview ? (
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="material-icons" style={{ fontSize: '13px' }}>
                {preview.icon}
              </span>
              {preview.label}
            </div>
          ) : null}

          <div className="mt-1.5 text-sm text-foreground">
            <CommentBodyRenderer body={thread.root.body} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted/50"
          aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className="material-icons" style={{ fontSize: '18px' }}>
            {collapsed ? 'expand_more' : 'expand_less'}
          </span>
        </button>
      </div>

      {/* Replies */}
      {!collapsed && thread.replies.length > 0 ? (
        <div className="space-y-2 px-3 pb-2 pl-10">
          {thread.replies.map((r) => {
            const ra = author(r.authorId);
            return (
              <div key={r.id} className="flex items-start gap-2">
                <Avatar name={ra.name} avatar={ra.avatar} size={20} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold">{ra.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {relativeTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <CommentBodyRenderer body={r.body} />
                  </div>
                </div>
                {canDeleteReply(r.authorId) ? (
                  <button
                    type="button"
                    onClick={() => void onDelete(r.id)}
                    className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity"
                    title="Delete reply"
                  >
                    <span
                      className="material-icons"
                      style={{ fontSize: '14px' }}
                    >
                      delete_outline
                    </span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Action bar */}
      {!collapsed ? (
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setComposerOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <span className="material-icons" style={{ fontSize: '14px' }}>
                reply
              </span>
              Reply
            </button>
            {thread.resolved ? (
              <button
                type="button"
                onClick={() => void onUnresolve(thread.threadId)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <span className="material-icons" style={{ fontSize: '14px' }}>
                  replay
                </span>
                Reopen
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onResolve(thread.threadId)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-green-700 hover:bg-green-50 transition-colors"
              >
                <span className="material-icons" style={{ fontSize: '14px' }}>
                  check_circle
                </span>
                Resolve
              </button>
            )}
          </div>
          {canDeleteRoot ? (
            <button
              type="button"
              onClick={() => void onDelete(thread.root.id)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete thread"
            >
              <span className="material-icons" style={{ fontSize: '14px' }}>
                delete_outline
              </span>
              Delete
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Inline reply composer */}
      {!collapsed && composerOpen ? (
        <div className="border-t border-border/50 p-2">
          <ComposeBox
            members={members}
            placeholder="Reply…"
            variant="compact"
            submitLabel="Reply"
            autoFocus
            onCancel={() => setComposerOpen(false)}
            onSubmit={async (body, ids) => {
              await onReply(thread.threadId, body, ids);
              setComposerOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default ThreadCard;
