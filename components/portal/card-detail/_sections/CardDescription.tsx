/**
 * Description section — markdown view + inline editor.
 */
'use client';

import MarkdownView from '../../MarkdownView';
import type { CardDetail } from '../_lib/types';

interface Props {
  card: CardDetail;
  canEdit: boolean;
  editingDesc: boolean;
  descDraft: string;
  setDescDraft: (v: string) => void;
  setEditingDesc: (v: boolean) => void;
  saveDesc: () => void;
  savingField: string | null;
}

export function CardDescription({
  card,
  canEdit,
  editingDesc,
  descDraft,
  setDescDraft,
  setEditingDesc,
  saveDesc,
  savingField,
}: Props) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Description
      </h3>
      {editingDesc ? (
        <div>
          <textarea
            autoFocus
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            rows={8}
            placeholder="Supports Markdown — **bold**, # headings, - lists, `code`, [links](url)…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={saveDesc}
              disabled={savingField === 'description'}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {savingField === 'description' ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditingDesc(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <span className="ml-auto text-xs text-muted-foreground">Markdown supported</span>
          </div>
        </div>
      ) : (
        <div
          onClick={() => {
            if (canEdit) {
              setDescDraft(card.description ?? '');
              setEditingDesc(true);
            }
          }}
          className={`text-sm text-foreground rounded-lg p-2 -m-2 min-h-[40px] ${canEdit ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''}`}
        >
          {card.description ? (
            <MarkdownView>{card.description}</MarkdownView>
          ) : (
            <span className="text-muted-foreground italic">
              {canEdit ? 'Add a description…' : 'No description'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
