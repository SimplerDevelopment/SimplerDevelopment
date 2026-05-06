/**
 * AnchorPinLayer — overlay that renders one `<AnchorPin />` per thread that
 * has a positional anchor (anchor.x / anchor.y both set).
 *
 * The deck editor uses `activeAnchorFilter` to only render pins on the
 * currently-visible slide; the post editor can pass through unfiltered.
 *
 * Positioning model:
 *   The layer is rendered at `position: absolute; inset: 0` over the canvas.
 *   The pins inside use the same coordinate space — host editors are
 *   responsible for ensuring `anchor.x/y` are recorded in the SAME space
 *   the layer is rendered in (i.e. capture click coords relative to the
 *   layer/canvas wrapper, not the viewport).
 */

'use client';

import { type JSX } from 'react';
import type { CommentAnchor } from '@/lib/db/schema/collab';
import type { CommentThread } from '@/lib/realtime/use-comments';
import { AnchorPin } from './AnchorPin';
import type { ComposeMember } from './ComposeBox';

export interface AnchorPinLayerProps {
  threads: CommentThread[];
  members: ComposeMember[];
  currentUserId: number;
  isAdmin?: boolean;
  resolveBlockLabel?: (blockId: string) => string | null;
  resolveAuthor?: (authorId: number) => {
    name: string;
    avatar?: string | null;
  };
  /**
   * Optional filter — return false to suppress pins. Common usage:
   *   `(a) => a.slideIndex === currentSlideIndex`
   */
  activeAnchorFilter?: (anchor: CommentAnchor) => boolean;
  onPinClick?: (threadId: string) => void;
  onReply: (
    threadId: string,
    body: string,
    mentionedUserIds: number[]
  ) => Promise<void>;
  onResolve: (threadId: string) => Promise<void>;
  onUnresolve: (threadId: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  /** When true, includes resolved threads (default: omit). */
  showResolved?: boolean;
  /** Extra classes for the absolutely-positioned overlay. */
  className?: string;
}

export function AnchorPinLayer(props: AnchorPinLayerProps): JSX.Element {
  const {
    threads,
    members,
    currentUserId,
    isAdmin,
    resolveBlockLabel,
    resolveAuthor,
    activeAnchorFilter,
    onPinClick,
    onReply,
    onResolve,
    onUnresolve,
    onDelete,
    showResolved = false,
    className = '',
  } = props;

  const pinned = threads.filter((t) => {
    if (!showResolved && t.resolved) return false;
    const a = t.root.anchor;
    if (!a) return false;
    if (typeof a.x !== 'number' || typeof a.y !== 'number') return false;
    if (activeAnchorFilter && !activeAnchorFilter(a)) return false;
    return true;
  });

  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden={pinned.length === 0}
    >
      {/* Pins individually re-enable pointer events */}
      {pinned.map((t) => (
        <div key={t.threadId} className="pointer-events-auto">
          <AnchorPin
            thread={t}
            members={members}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            resolveBlockLabel={resolveBlockLabel}
            resolveAuthor={resolveAuthor}
            onPinClick={onPinClick}
            onReply={onReply}
            onResolve={onResolve}
            onUnresolve={onUnresolve}
            onDelete={onDelete}
          />
        </div>
      ))}
    </div>
  );
}

export default AnchorPinLayer;
