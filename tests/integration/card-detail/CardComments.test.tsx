/**
 * Unit-style integration tests for the extracted CardComments section.
 *
 * Renders only the comments thread + composer and exercises the prop surface
 * the dispatcher hands down: list rendering, delete-button visibility per
 * author/canEdit rules, and submit-button gating + callback firing.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardComments } from '@/components/portal/card-detail/_sections/CardComments';
import type { Comment, FileAttachment, MentionUser } from '@/components/portal/card-detail/_lib/types';

const MENTION_USERS: MentionUser[] = [
  { id: 5, name: 'Alex Kim' },
  { id: 6, name: 'Riley Park' },
];

const COMMENTS: Comment[] = [
  {
    id: 11,
    body: 'Looks good',
    mentions: null,
    createdAt: '2026-04-01T10:00:00.000Z',
    userId: 5,
    userName: 'Alex Kim',
    files: [],
  },
  {
    id: 12,
    body: 'Needs more work',
    mentions: null,
    createdAt: '2026-04-02T10:00:00.000Z',
    userId: 6,
    userName: 'Riley Park',
    files: [],
  },
];

interface BaseProps {
  comments?: Comment[];
  canEdit?: boolean;
  currentUserId?: number;
  canDeleteFile?: (f: FileAttachment) => boolean;
  commentBody?: string;
  pendingCommentFiles?: FileAttachment[];
  submittingComment?: boolean;
  setCommentBody?: (v: string) => void;
  setPendingCommentFiles?: React.Dispatch<React.SetStateAction<FileAttachment[]>>;
  uploadFile?: (f: File, forComment?: boolean) => void;
  deleteFile?: (id: number, fromComment?: boolean, commentId?: number) => void;
  submitComment?: () => void;
  removeComment?: (id: number) => void;
}

function renderComments(overrides: BaseProps = {}) {
  const props = {
    comments: overrides.comments ?? COMMENTS,
    currentUserId: overrides.currentUserId ?? 5,
    canEdit: overrides.canEdit ?? false,
    canDeleteFile: overrides.canDeleteFile ?? (() => false),
    mentionUsers: MENTION_USERS,
    commentBody: overrides.commentBody ?? '',
    setCommentBody: overrides.setCommentBody ?? (() => {}),
    pendingCommentFiles: overrides.pendingCommentFiles ?? [],
    setPendingCommentFiles: overrides.setPendingCommentFiles ?? (() => {}),
    submittingComment: overrides.submittingComment ?? false,
    uploadFile: overrides.uploadFile ?? (() => {}),
    deleteFile: overrides.deleteFile ?? (() => {}),
    submitComment: overrides.submitComment ?? (() => {}),
    removeComment: overrides.removeComment ?? (() => {}),
  };
  return { ...render(<CardComments {...props} />), props };
}

describe('CardComments', () => {
  it('renders the count and each comment body', { timeout: 30_000 }, () => {
    renderComments();
    expect(screen.getByText(/Comments \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Looks good')).toBeInTheDocument();
    expect(screen.getByText('Needs more work')).toBeInTheDocument();
  });

  it('shows the empty-state message when there are no comments', () => {
    renderComments({ comments: [] });
    expect(screen.getByText(/No comments yet/i)).toBeInTheDocument();
  });

  it('shows the delete button on the current user\'s own comments', () => {
    renderComments({ currentUserId: 5, canEdit: false });
    // Only Alex Kim's comment (id 11, userId 5) gets a delete button.
    const deletes = screen.getAllByRole('button').filter(b =>
      b.querySelector('span.material-icons')?.textContent === 'delete',
    );
    expect(deletes).toHaveLength(1);
  });

  it('shows delete on every comment when canEdit is true', () => {
    renderComments({ currentUserId: 5, canEdit: true });
    const deletes = screen.getAllByRole('button').filter(b =>
      b.querySelector('span.material-icons')?.textContent === 'delete',
    );
    expect(deletes).toHaveLength(2);
  });

  it('disables the submit button when body is empty and no pending files', () => {
    renderComments();
    const submit = screen.getByRole('button', { name: /Comment/i });
    expect(submit).toBeDisabled();
  });

  it('enables submit and fires submitComment when body has text', async () => {
    const user = userEvent.setup();
    const submitComment = vi.fn();
    renderComments({ commentBody: 'a draft', submitComment });
    const submit = screen.getByRole('button', { name: /Comment/i });
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    expect(submitComment).toHaveBeenCalledTimes(1);
  });

  it('fires removeComment with the right id when a delete button is clicked', async () => {
    const user = userEvent.setup();
    const removeComment = vi.fn();
    renderComments({ canEdit: true, removeComment });
    const deletes = screen.getAllByRole('button').filter(b =>
      b.querySelector('span.material-icons')?.textContent === 'delete',
    );
    await user.click(deletes[0]);
    expect(removeComment).toHaveBeenCalledWith(11);
  });

  it('fires setCommentBody when the textarea changes', () => {
    const setCommentBody = vi.fn();
    renderComments({ setCommentBody });
    fireEvent.change(screen.getByPlaceholderText(/Add a comment/i), {
      target: { value: 'hello' },
    });
    expect(setCommentBody).toHaveBeenCalledWith('hello');
  });
});
