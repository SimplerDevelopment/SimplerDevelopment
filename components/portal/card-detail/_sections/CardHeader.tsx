/**
 * Card detail header — key/identifier, editable title, and close button.
 */
'use client';

import type { CardDetail } from '../_lib/types';

interface Props {
  card: CardDetail;
  canEdit: boolean;
  editingTitle: boolean;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  setEditingTitle: (v: boolean) => void;
  saveTitle: () => void;
  onClose: () => void;
}

export function CardHeader({
  card,
  canEdit,
  editingTitle,
  titleDraft,
  setTitleDraft,
  setEditingTitle,
  saveTitle,
  onClose,
}: Props) {
  return (
    <div className="flex items-start gap-3 p-5 border-b border-border shrink-0 bg-card">
      <div className="flex-1 min-w-0">
        {card.key && (
          <p className="text-xs font-mono text-muted-foreground mb-1">{card.key}</p>
        )}
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            className="w-full text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none text-foreground"
          />
        ) : (
          <h2
            className={`text-xl font-bold text-foreground leading-tight ${canEdit ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
            onClick={() => {
              if (canEdit) {
                setTitleDraft(card.title);
                setEditingTitle(true);
              }
            }}
          >
            {card.title}
          </h2>
        )}
      </div>
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
      >
        <span className="material-icons text-xl text-muted-foreground">close</span>
      </button>
    </div>
  );
}
