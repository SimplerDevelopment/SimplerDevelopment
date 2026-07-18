/**
 * AnchorPin — small floating pin that marks a thread on a positional anchor.
 *
 * Default visual: 24px circle with `material-icons:chat_bubble`. Hover shows
 * the first author's avatar (or initial). Click → opens a tiny popover with
 * the thread root and an inline reply box, rendered via `<ThreadCard
 * framed={false} />`.
 *
 * Positioning: absolute at `anchor.x / anchor.y`. The parent container must
 * be `position: relative` so the pin's coordinate space matches.
 */

'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import type { CommentThread } from '@/lib/realtime/use-comments';
import { ThreadCard } from './ThreadCard';
import type { ComposeMember } from './ComposeBox';

export interface AnchorPinProps {
  thread: CommentThread;
  members: ComposeMember[];
  currentUserId: number;
  isAdmin?: boolean;
  resolveBlockLabel?: (blockId: string) => string | null;
  resolveAuthor?: (authorId: number) => {
    name: string;
    avatar?: string | null;
  };
  onReply: (
    threadId: string,
    body: string,
    mentionedUserIds: number[]
  ) => Promise<void>;
  onResolve: (threadId: string) => Promise<void>;
  onUnresolve: (threadId: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  /** Override the rendered position (defaults to thread.root.anchor.x/y). */
  x?: number;
  y?: number;
  /** Optional click-through to expand in the sidebar. */
  onPinClick?: (threadId: string) => void;
}

export function AnchorPin(props: AnchorPinProps): JSX.Element | null {
  const {
    thread,
    members,
    currentUserId,
    isAdmin,
    resolveBlockLabel,
    resolveAuthor,
    onReply,
    onResolve,
    onUnresolve,
    onDelete,
    x,
    y,
    onPinClick,
  } = props;

  const anchor = thread.root.anchor;
  const px = x ?? anchor?.x;
  const py = y ?? anchor?.y;

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (typeof px !== 'number' || typeof py !== 'number') return null;

  const memberMap = new Map<number, ComposeMember>();
  for (const m of members) memberMap.set(m.id, m);
  const author =
    resolveAuthor?.(thread.root.authorId) ?? memberMap.get(thread.root.authorId);
  const authorName = author?.name ?? `User #${thread.root.authorId}`;
  const avatar = author?.avatar ?? null;

  return (
    <div
      ref={wrapperRef}
      style={{ left: `${px}px`, top: `${py}px` }}
      className="absolute z-40 -translate-x-1/2 -translate-y-1/2"
      data-thread-id={thread.threadId}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          onPinClick?.(thread.threadId);
        }}
        className={`flex h-6 w-6 items-center justify-center rounded-full shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
          thread.resolved
            ? 'bg-green-600 text-white'
            : 'bg-blue-600 text-white'
        }`}
        title={`Comment by ${authorName}`}
        aria-label={`Open comment by ${authorName}`}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="material-icons" style={{ fontSize: '14px' }}>
            chat_bubble
          </span>
        )}
      </button>

      {open ? (
        <div
          className="absolute left-4 top-4 w-[320px] rounded-lg border border-border bg-background shadow-xl"
          role="dialog"
          aria-label="Comment thread"
        >
          <ThreadCard
            thread={thread}
            members={members}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            resolveBlockLabel={resolveBlockLabel}
            resolveAuthor={resolveAuthor}
            onReply={onReply}
            onResolve={onResolve}
            onUnresolve={onUnresolve}
            onDelete={onDelete}
            framed={false}
          />
        </div>
      ) : null}
    </div>
  );
}

export default AnchorPin;
