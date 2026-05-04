/** Top toolbar — title/slug edit, save state, theme/regen/history toggles, present, publish, delete. */
'use client';

import Link from 'next/link';
import type { DeckPayload } from '../_lib/api';

export interface EditorHeaderProps {
  deck: DeckPayload;
  saving: boolean;
  publishing: boolean;
  hasUnsavedChanges: boolean;
  editingTitle: boolean;
  titleDraft: string;
  editingSlug: boolean;
  slugDraft: string;
  slugError: string | null;
  onStartEditTitle: () => void;
  onTitleDraftChange: (v: string) => void;
  onSaveTitle: () => void;
  onCancelEditTitle: () => void;
  onStartEditSlug: () => void;
  onSlugDraftChange: (v: string) => void;
  onSaveSlug: () => void;
  onCancelEditSlug: () => void;
  onToggleTheme: () => void;
  onToggleRegenerate: () => void;
  onToggleHistory: () => void;
  onSave: () => void;
  onTogglePublish: () => void;
  onPresent: () => void;
  onDelete: () => void;
  presenterUrl: string;
}

export function EditorHeader(props: EditorHeaderProps) {
  const {
    deck, saving, publishing, hasUnsavedChanges,
    editingTitle, titleDraft, editingSlug, slugDraft, slugError,
    onStartEditTitle, onTitleDraftChange, onSaveTitle, onCancelEditTitle,
    onStartEditSlug, onSlugDraftChange, onSaveSlug, onCancelEditSlug,
    onToggleTheme, onToggleRegenerate, onToggleHistory, onSave, onTogglePublish,
    onPresent, onDelete, presenterUrl,
  } = props;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link
          href="/portal/tools/pitch-decks"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons">arrow_back</span>
        </Link>
        <div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => onTitleDraftChange(e.target.value)}
              onBlur={onSaveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') onSaveTitle(); if (e.key === 'Escape') onCancelEditTitle(); }}
              className="text-xl font-bold text-foreground bg-transparent border-b-2 border-primary outline-none w-full"
            />
          ) : (
            <h1
              className="text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={onStartEditTitle}
              title="Click to edit title"
            >
              {deck.title}
            </h1>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <span>{deck.slides.length} slides</span>
            <span>·</span>
            {editingSlug ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-muted-foreground/70">/pitch-deck/</span>
                <input
                  autoFocus
                  value={slugDraft}
                  onChange={(e) => onSlugDraftChange(e.target.value)}
                  onBlur={onSaveSlug}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSaveSlug();
                    if (e.key === 'Escape') onCancelEditSlug();
                  }}
                  className="bg-transparent border-b border-primary outline-none text-foreground min-w-[8rem]"
                  placeholder="deck-slug"
                />
              </span>
            ) : (
              <button
                type="button"
                onClick={onStartEditSlug}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors group"
                title="Click to edit slug"
              >
                <span className="material-icons text-xs">link</span>
                <span className="font-mono">/pitch-deck/{deck.slug}</span>
                <span className="material-icons text-[0.875em] opacity-0 group-hover:opacity-60">edit</span>
              </button>
            )}
            {slugError && (
              <span className="text-red-600 dark:text-red-400">{slugError}</span>
            )}
            <span>·</span>
            {deck.status === 'published' ? (
              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                <span className="material-icons text-xs">public</span>
                Published
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className="material-icons text-xs">edit_note</span>
                Draft
              </span>
            )}
            {saving && (
              <>
                <span>·</span>
                <span className="text-primary">Saving...</span>
              </>
            )}
            {!saving && hasUnsavedChanges && (
              <>
                <span>·</span>
                <span className="text-yellow-600 dark:text-yellow-400">Unsaved changes</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleTheme}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">palette</span>
          Theme
        </button>
        <button
          onClick={onToggleRegenerate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">auto_awesome</span>
          Regenerate
        </button>
        <button
          onClick={onToggleHistory}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">history</span>
          History
        </button>
        <button
          onClick={onSave}
          disabled={saving || !hasUnsavedChanges}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-all disabled:opacity-40 ${
            hasUnsavedChanges
              ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
              : 'border border-border text-muted-foreground'
          }`}
        >
          {saving ? (
            <span className="material-icons animate-spin text-base">autorenew</span>
          ) : (
            <span className="material-icons text-base">save</span>
          )}
          {saving ? 'Saving...' : hasUnsavedChanges ? 'Update' : 'Saved'}
        </button>
        <Link
          href={`/pitch-deck/${deck.slug}${deck.status !== 'published' ? '?preview=1' : ''}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">{deck.status === 'published' ? 'open_in_new' : 'visibility'}</span>
          {deck.status === 'published' ? 'View Live' : 'Preview'}
        </Link>
        <button
          onClick={onPresent}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={`Open presenter view (${presenterUrl})`}
        >
          <span className="material-icons text-base">co_present</span>
          Present
        </button>
        <button
          onClick={onTogglePublish}
          disabled={publishing || deck.slides.length === 0}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors disabled:opacity-50 ${
            deck.status === 'published'
              ? 'border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          <span className="material-icons text-base">
            {deck.status === 'published' ? 'unpublished' : 'publish'}
          </span>
          {deck.status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
          title="Delete deck"
        >
          <span className="material-icons text-base">delete</span>
        </button>
      </div>
    </div>
  );
}
