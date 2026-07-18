/**
 * Comments thread + composer (with @-mention auto-complete and pasted-image
 * pending attachments).
 */
'use client';

import MarkdownView from '../../MarkdownView';
import { FileThumb, MentionTextarea } from '../_lib/atoms';
import { formatDate } from '../_lib/format';
import type { Comment, FileAttachment, MentionUser } from '../_lib/types';

interface Props {
  comments: Comment[];
  currentUserId: number;
  canEdit: boolean;
  canDeleteFile: (f: FileAttachment) => boolean;

  commentBody: string;
  setCommentBody: (v: string) => void;
  pendingCommentFiles: FileAttachment[];
  setPendingCommentFiles: React.Dispatch<React.SetStateAction<FileAttachment[]>>;
  submittingComment: boolean;
  mentionUsers: MentionUser[];

  uploadFile: (f: File, forComment?: boolean) => void;
  deleteFile: (id: number, fromComment?: boolean, commentId?: number) => void;
  submitComment: () => void;
  removeComment: (id: number) => void;
}

export function CardComments({
  comments,
  currentUserId,
  canEdit,
  canDeleteFile,
  commentBody,
  setCommentBody,
  pendingCommentFiles,
  setPendingCommentFiles,
  submittingComment,
  mentionUsers,
  uploadFile,
  deleteFile,
  submitComment,
  removeComment,
}: Props) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>
      <div className="space-y-4 mb-4">
        {comments.map(c => (
          <div key={c.id} className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-icons text-sm text-primary">person</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">{c.userName ?? 'Unknown'}</span>
                <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
              </div>
              {c.body && (
                <MarkdownView className="text-sm text-foreground break-words" highlightMentions>
                  {c.body}
                </MarkdownView>
              )}
              {c.files?.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {c.files.map(f => (
                    <FileThumb
                      key={f.id}
                      file={f}
                      onDelete={canDeleteFile(f) ? () => deleteFile(f.id, true, c.id) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
            {(c.userId === currentUserId || canEdit) && (
              <button
                onClick={() => removeComment(c.id)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors shrink-0 self-start"
              >
                <span className="material-icons text-sm">delete</span>
              </button>
            )}
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No comments yet.</p>
        )}
      </div>

      {pendingCommentFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {pendingCommentFiles.map(f => (
            <FileThumb
              key={f.id}
              file={f}
              onDelete={() => setPendingCommentFiles(prev => prev.filter(p => p.id !== f.id))}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <MentionTextarea
          value={commentBody}
          onChange={setCommentBody}
          placeholder="Add a comment… type @ to mention, paste an image to attach"
          rows={3}
          users={mentionUsers}
          onFilePaste={file => uploadFile(file, true)}
        />
        <div className="flex justify-end">
          <button
            onClick={submitComment}
            disabled={
              (!commentBody.trim() && pendingCommentFiles.length === 0) || submittingComment
            }
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submittingComment ? (
              <span className="material-icons text-sm animate-spin">refresh</span>
            ) : (
              <span className="material-icons text-sm">send</span>
            )}
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
