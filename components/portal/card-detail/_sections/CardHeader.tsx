/**
 * Card detail header — key/identifier, editable title, and close button.
 */
'use client';

import { useState } from 'react';
import type { CardDetail, DependencyRef } from '../_lib/types';
import { CARD_TYPE_META } from '../_lib/agile';

interface Props {
  card: CardDetail;
  canEdit: boolean;
  editingTitle: boolean;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  setEditingTitle: (v: boolean) => void;
  saveTitle: () => void;
  onClose: () => void;
  parent?: DependencyRef | null;
  onClearParent?: () => void;
  onPickParent?: () => void;
  watching?: boolean;
  toggleWatch?: () => void;
  /** Relative deep-link to this card (e.g. /portal/projects/145/678). */
  cardUrl?: string | null;
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
  parent,
  onClearParent,
  onPickParent,
  watching,
  toggleWatch,
  cardUrl,
}: Props) {
  const cardType = card.cardType ?? 'task';
  const typeMeta = CARD_TYPE_META[cardType];
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!cardUrl) return;
    const absolute = typeof window !== 'undefined' ? new URL(cardUrl, window.location.origin).href : cardUrl;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / permissions) — no-op.
    }
  }
  return (
    <div className="flex items-start gap-3 p-5 border-b border-border shrink-0 bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap text-xs">
          <span className={`material-icons text-base ${typeMeta.color}`} aria-label={typeMeta.label}>
            {typeMeta.icon}
          </span>
          {card.key && <span className="font-mono text-muted-foreground">{card.key}</span>}
          {card.storyPoints != null && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold" aria-label={`${card.storyPoints} story points`}>
              {card.storyPoints} pts
            </span>
          )}
          {parent && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="material-icons text-xs">subdirectory_arrow_right</span>
              <span>Parent: <span className="font-medium text-foreground">{parent.key ?? `#${parent.number ?? parent.id}`}</span> {parent.title}</span>
              {canEdit && onClearParent && (
                <button onClick={onClearParent} className="ml-1 hover:text-destructive" aria-label="Clear parent">
                  <span className="material-icons text-xs">close</span>
                </button>
              )}
            </span>
          )}
          {!parent && canEdit && onPickParent && (
            <button onClick={onPickParent} className="text-muted-foreground hover:text-primary flex items-center gap-1">
              <span className="material-icons text-xs">subdirectory_arrow_right</span>
              Set parent
            </button>
          )}
        </div>
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
      {cardUrl && (
        <button
          onClick={copyLink}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0 ${
            copied
              ? 'bg-primary/10 border-primary text-primary'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          title="Copy a shareable link to this card"
          aria-label="Copy link to this card"
        >
          <span className="material-icons text-base">{copied ? 'check' : 'link'}</span>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      )}
      {toggleWatch && (
        <button
          onClick={toggleWatch}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0 ${
            watching
              ? 'bg-primary/10 border-primary text-primary'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          title={watching ? 'You are watching this card — click to unwatch' : 'Watch this card to receive alerts'}
          aria-pressed={!!watching}
        >
          <span className="material-icons text-base">
            {watching ? 'notifications_active' : 'notifications_none'}
          </span>
          {watching ? 'Watching' : 'Watch'}
        </button>
      )}
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
      >
        <span className="material-icons text-xl text-muted-foreground">close</span>
      </button>
    </div>
  );
}
