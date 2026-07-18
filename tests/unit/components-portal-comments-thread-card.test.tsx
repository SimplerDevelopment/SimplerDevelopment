// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// CommentBodyRenderer — renders body text verbatim (no mention parsing needed)
vi.mock('@/components/portal/comments/MentionPill', () => ({
  CommentBodyRenderer: ({ body }: { body: string }) =>
    React.createElement('span', { 'data-testid': 'comment-body' }, body),
}));

// ComposeBox — minimal stub that calls onSubmit with a fixed body when the
// "submit" button is clicked, and onCancel when "cancel" is clicked.
vi.mock('@/components/portal/comments/ComposeBox', () => ({
  ComposeBox: ({
    onSubmit,
    onCancel,
    submitLabel,
  }: {
    onSubmit: (body: string, ids: number[]) => Promise<void>;
    onCancel?: () => void;
    submitLabel?: string;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'compose-box' },
      React.createElement(
        'button',
        {
          'data-testid': 'compose-submit',
          onClick: () => void onSubmit('test reply body', []),
        },
        submitLabel ?? 'Submit',
      ),
      onCancel
        ? React.createElement(
            'button',
            { 'data-testid': 'compose-cancel', onClick: onCancel },
            'Cancel',
          )
        : null,
    ),
}));

// ---------------------------------------------------------------------------
// Subject + types
// ---------------------------------------------------------------------------

import { ThreadCard, type ThreadCardProps } from '@/components/portal/comments/ThreadCard';
import type { CommentThread } from '@/lib/realtime/use-comments';
import type { DocumentComment } from '@/lib/db/schema/collab';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComment(overrides: Partial<DocumentComment> = {}): DocumentComment {
  const now = new Date('2024-01-15T10:00:00Z');
  return {
    id: 'comment-1',
    clientId: 1,
    entityType: 'post',
    entityId: 'entity-1',
    threadId: 'thread-1',
    parentId: null,
    authorId: 42,
    body: 'Root comment body',
    mentionedUserIds: [],
    anchor: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeThread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    threadId: 'thread-1',
    root: makeComment(),
    replies: [],
    resolved: false,
    ...overrides,
  };
}

const defaultMembers = [
  { id: 42, name: 'Alice Admin', avatar: null },
  { id: 99, name: 'Bob User', avatar: null },
];

function defaultProps(overrides: Partial<ThreadCardProps> = {}): ThreadCardProps {
  return {
    thread: makeThread(),
    members: defaultMembers,
    currentUserId: 42,
    isAdmin: false,
    onReply: vi.fn().mockResolvedValue(undefined),
    onResolve: vi.fn().mockResolvedValue(undefined),
    onUnresolve: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThreadCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic render ───────────────────────────────────────────────────────────

  it('renders the root comment body', () => {
    render(<ThreadCard {...defaultProps()} />);
    expect(screen.getByTestId('comment-body')).toHaveTextContent('Root comment body');
  });

  it('renders the author name from members list', () => {
    render(<ThreadCard {...defaultProps()} />);
    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
  });

  it('resolves author name via resolveAuthor when provided', () => {
    const resolveAuthor = vi.fn().mockReturnValue({ name: 'External Author', avatar: null });
    render(<ThreadCard {...defaultProps({ resolveAuthor })} />);
    expect(screen.getByText('External Author')).toBeInTheDocument();
    expect(resolveAuthor).toHaveBeenCalledWith(42);
  });

  it('falls back to "User #<id>" when author not in members and no resolveAuthor', () => {
    const props = defaultProps({ members: [] });
    render(<ThreadCard {...props} />);
    expect(screen.getByText('User #42')).toBeInTheDocument();
  });

  it('renders avatar image when member has avatar URL', () => {
    const membersWithAvatar = [{ id: 42, name: 'Alice', avatar: 'https://cdn.example.com/avatar.jpg' }];
    render(<ThreadCard {...defaultProps({ members: membersWithAvatar })} />);
    const img = document.querySelector('img[src="https://cdn.example.com/avatar.jpg"]');
    expect(img).toBeInTheDocument();
  });

  it('renders initials avatar when member has no avatar', () => {
    render(<ThreadCard {...defaultProps()} />);
    // Alice Admin → 'A'
    const initials = screen.getAllByText('A');
    expect(initials.length).toBeGreaterThan(0);
  });

  // ── Framed / unframed ──────────────────────────────────────────────────────

  it('applies shadow-sm class when framed=true (default)', () => {
    const { container } = render(<ThreadCard {...defaultProps({ framed: true })} />);
    expect(container.firstChild).toHaveClass('shadow-sm');
  });

  it('does not apply shadow-sm when framed=false', () => {
    const { container } = render(<ThreadCard {...defaultProps({ framed: false })} />);
    expect(container.firstChild).not.toHaveClass('shadow-sm');
  });

  // ── Resolved state ─────────────────────────────────────────────────────────

  it('shows "Resolved" badge when thread is resolved', () => {
    render(<ThreadCard {...defaultProps({ thread: makeThread({ resolved: true }) })} />);
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('does not show "Resolved" badge when thread is not resolved', () => {
    render(<ThreadCard {...defaultProps({ thread: makeThread({ resolved: false }) })} />);
    expect(screen.queryByText('Resolved')).not.toBeInTheDocument();
  });

  it('applies opacity-70 class when resolved', () => {
    const { container } = render(
      <ThreadCard {...defaultProps({ thread: makeThread({ resolved: true }) })} />,
    );
    expect(container.firstChild).toHaveClass('opacity-70');
  });

  // ── Anchor preview ─────────────────────────────────────────────────────────

  it('renders blockId anchor label', () => {
    const thread = makeThread({
      root: makeComment({ anchor: { blockId: 'hero-block' } }),
    });
    render(<ThreadCard {...defaultProps({ thread })} />);
    expect(screen.getByText('On block hero-block')).toBeInTheDocument();
  });

  it('uses resolveBlockLabel for blockId anchor', () => {
    const resolveBlockLabel = vi.fn().mockReturnValue('Hero Banner');
    const thread = makeThread({
      root: makeComment({ anchor: { blockId: 'block-abc' } }),
    });
    render(<ThreadCard {...defaultProps({ thread, resolveBlockLabel })} />);
    expect(screen.getByText('On block Hero Banner')).toBeInTheDocument();
  });

  it('renders slideIndex anchor label', () => {
    const thread = makeThread({
      root: makeComment({ anchor: { slideIndex: 2 } }),
    });
    render(<ThreadCard {...defaultProps({ thread })} />);
    expect(screen.getByText('On slide 3')).toBeInTheDocument();
  });

  it('renders fieldPath anchor label', () => {
    const thread = makeThread({
      root: makeComment({ anchor: { fieldPath: 'blocks[0].props.headline' } }),
    });
    render(<ThreadCard {...defaultProps({ thread })} />);
    expect(screen.getByText('On field blocks[0].props.headline')).toBeInTheDocument();
  });

  it('renders x/y coordinate anchor label', () => {
    const thread = makeThread({
      root: makeComment({ anchor: { x: 123.7, y: 456.2 } }),
    });
    render(<ThreadCard {...defaultProps({ thread })} />);
    expect(screen.getByText('Pinned at 124, 456')).toBeInTheDocument();
  });

  it('renders no anchor preview when anchor is null', () => {
    render(<ThreadCard {...defaultProps()} />);
    expect(screen.queryByText(/On block/)).not.toBeInTheDocument();
    expect(screen.queryByText(/On slide/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pinned at/)).not.toBeInTheDocument();
  });

  // ── Collapse / expand ──────────────────────────────────────────────────────

  it('renders collapse button with aria-label "Collapse thread"', () => {
    render(<ThreadCard {...defaultProps()} />);
    expect(screen.getByRole('button', { name: 'Collapse thread' })).toBeInTheDocument();
  });

  it('hides replies and action bar when collapsed', () => {
    const reply = makeComment({ id: 'reply-1', parentId: 'comment-1', authorId: 99, body: 'Reply text' });
    const thread = makeThread({ replies: [reply] });
    render(<ThreadCard {...defaultProps({ thread })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse thread' }));

    expect(screen.queryByText('Reply text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reply/i })).not.toBeInTheDocument();
  });

  it('re-expands when collapse button is clicked again', () => {
    const reply = makeComment({ id: 'reply-1', parentId: 'comment-1', authorId: 99, body: 'Reply text' });
    const thread = makeThread({ replies: [reply] });
    render(<ThreadCard {...defaultProps({ thread })} />);

    const collapseBtn = screen.getByRole('button', { name: 'Collapse thread' });
    fireEvent.click(collapseBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Expand thread' }));

    expect(screen.getByText('Reply text')).toBeInTheDocument();
  });

  // ── Replies ────────────────────────────────────────────────────────────────

  it('renders reply bodies for each reply', () => {
    const replies = [
      makeComment({ id: 'r1', parentId: 'comment-1', authorId: 99, body: 'First reply' }),
      makeComment({ id: 'r2', parentId: 'comment-1', authorId: 42, body: 'Second reply' }),
    ];
    const thread = makeThread({ replies });
    render(<ThreadCard {...defaultProps({ thread })} />);

    const bodies = screen.getAllByTestId('comment-body');
    const texts = bodies.map((b) => b.textContent);
    expect(texts).toContain('First reply');
    expect(texts).toContain('Second reply');
  });

  it('shows delete button on reply when reply author matches currentUserId', () => {
    const reply = makeComment({ id: 'r1', parentId: 'comment-1', authorId: 42, body: 'My reply' });
    const thread = makeThread({ replies: [reply] });
    render(<ThreadCard {...defaultProps({ thread, currentUserId: 42 })} />);
    // The delete button has title "Delete reply"
    expect(screen.getByTitle('Delete reply')).toBeInTheDocument();
  });

  it('does not show reply delete button when reply author is different user', () => {
    const reply = makeComment({ id: 'r1', parentId: 'comment-1', authorId: 99, body: 'Their reply' });
    const thread = makeThread({ replies: [reply] });
    render(<ThreadCard {...defaultProps({ thread, currentUserId: 42 })} />);
    expect(screen.queryByTitle('Delete reply')).not.toBeInTheDocument();
  });

  it('calls onDelete with reply id when reply delete button is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const reply = makeComment({ id: 'r1', parentId: 'comment-1', authorId: 42, body: 'My reply' });
    const thread = makeThread({ replies: [reply] });
    render(<ThreadCard {...defaultProps({ thread, currentUserId: 42, onDelete })} />);

    fireEvent.click(screen.getByTitle('Delete reply'));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('r1');
    });
  });

  // ── Reply composer ─────────────────────────────────────────────────────────

  it('does not show compose box by default', () => {
    render(<ThreadCard {...defaultProps()} />);
    expect(screen.queryByTestId('compose-box')).not.toBeInTheDocument();
  });

  it('shows compose box when openComposerInitial=true', () => {
    render(<ThreadCard {...defaultProps({ openComposerInitial: true })} />);
    expect(screen.getByTestId('compose-box')).toBeInTheDocument();
  });

  it('toggles compose box open when Reply button is clicked', () => {
    render(<ThreadCard {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /reply/i }));
    expect(screen.getByTestId('compose-box')).toBeInTheDocument();
  });

  it('closes compose box when Reply is clicked a second time', () => {
    render(<ThreadCard {...defaultProps()} />);
    const replyBtn = screen.getByRole('button', { name: /reply/i });
    fireEvent.click(replyBtn);
    expect(screen.getByTestId('compose-box')).toBeInTheDocument();
    fireEvent.click(replyBtn);
    expect(screen.queryByTestId('compose-box')).not.toBeInTheDocument();
  });

  it('calls onReply with threadId when compose box is submitted', async () => {
    const onReply = vi.fn().mockResolvedValue(undefined);
    render(<ThreadCard {...defaultProps({ onReply })} />);

    fireEvent.click(screen.getByRole('button', { name: /reply/i }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('compose-submit'));
    });

    await waitFor(() => {
      expect(onReply).toHaveBeenCalledWith('thread-1', 'test reply body', []);
    });
  });

  it('closes compose box after successful reply submit', async () => {
    const onReply = vi.fn().mockResolvedValue(undefined);
    render(<ThreadCard {...defaultProps({ onReply })} />);

    fireEvent.click(screen.getByRole('button', { name: /reply/i }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('compose-submit'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('compose-box')).not.toBeInTheDocument();
    });
  });

  it('closes compose box when Cancel is clicked', () => {
    render(<ThreadCard {...defaultProps({ openComposerInitial: true })} />);
    fireEvent.click(screen.getByTestId('compose-cancel'));
    expect(screen.queryByTestId('compose-box')).not.toBeInTheDocument();
  });

  // ── Resolve / Unresolve ────────────────────────────────────────────────────

  it('shows Resolve button when thread is not resolved', () => {
    render(<ThreadCard {...defaultProps({ thread: makeThread({ resolved: false }) })} />);
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
  });

  it('shows Reopen button when thread is resolved', () => {
    render(<ThreadCard {...defaultProps({ thread: makeThread({ resolved: true }) })} />);
    expect(screen.getByRole('button', { name: /reopen/i })).toBeInTheDocument();
  });

  it('calls onResolve with threadId when Resolve button is clicked', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<ThreadCard {...defaultProps({ onResolve })} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    });

    expect(onResolve).toHaveBeenCalledWith('thread-1');
  });

  it('calls onUnresolve with threadId when Reopen button is clicked', async () => {
    const onUnresolve = vi.fn().mockResolvedValue(undefined);
    render(
      <ThreadCard
        {...defaultProps({ thread: makeThread({ resolved: true }), onUnresolve })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reopen/i }));
    });

    expect(onUnresolve).toHaveBeenCalledWith('thread-1');
  });

  // ── Delete thread root ─────────────────────────────────────────────────────

  it('shows Delete button when currentUserId matches root author', () => {
    render(<ThreadCard {...defaultProps({ currentUserId: 42 })} />);
    expect(screen.getByTitle('Delete thread')).toBeInTheDocument();
  });

  it('shows Delete button when isAdmin=true even if not the author', () => {
    render(<ThreadCard {...defaultProps({ currentUserId: 999, isAdmin: true })} />);
    expect(screen.getByTitle('Delete thread')).toBeInTheDocument();
  });

  it('does not show Delete button when not author and not admin', () => {
    render(<ThreadCard {...defaultProps({ currentUserId: 999, isAdmin: false })} />);
    expect(screen.queryByTitle('Delete thread')).not.toBeInTheDocument();
  });

  it('calls onDelete with root comment id when Delete thread is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<ThreadCard {...defaultProps({ onDelete, currentUserId: 42 })} />);

    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete thread'));
    });

    expect(onDelete).toHaveBeenCalledWith('comment-1');
  });
});
