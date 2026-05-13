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
  /**
   * Count of slides on the deck that currently have a `draft` overlay. When
   * > 0 the header shows a "Publish all drafts" button next to Save.
   */
  draftSlideCount?: number;
  /** True while the publish-all request is in flight. */
  publishingAllDrafts?: boolean;
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
  onToggleSeo: () => void;
  onSave: () => void;
  onTogglePublish: () => void;
  onPublishAllDrafts?: () => void;
  onPresent: () => void;
  onDelete: () => void;
  onStartAbTest?: () => void;
  presenterUrl: string;
}

export function EditorHeader(props: EditorHeaderProps) {
  const {
    deck, saving, publishing, hasUnsavedChanges,
    editingTitle, titleDraft, editingSlug, slugDraft, slugError,
    draftSlideCount = 0, publishingAllDrafts = false,
    onStartEditTitle, onTitleDraftChange, onSaveTitle, onCancelEditTitle,
    onStartEditSlug, onSlugDraftChange, onSaveSlug, onCancelEditSlug,
    onToggleTheme, onToggleRegenerate, onToggleHistory, onToggleSeo, onSave, onTogglePublish,
    onPublishAllDrafts,
    onPresent, onDelete, onStartAbTest, presenterUrl,
  } = props;

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      {/* Title cluster: own row below md, shares row with actions on md+ */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 md:flex-1">
        <Link
          href="/portal/tools/pitch-decks"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <span className="material-icons">arrow_back</span>
        </Link>
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => onTitleDraftChange(e.target.value)}
              onBlur={onSaveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') onSaveTitle(); if (e.key === 'Escape') onCancelEditTitle(); }}
              className="text-lg sm:text-xl font-bold text-foreground bg-transparent border-b-2 border-primary outline-none w-full"
            />
          ) : (
            <h1
              className="text-lg sm:text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors truncate"
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
                <span className="text-muted-foreground/70">/slides/</span>
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
                <span className="font-mono">/slides/{deck.slug}</span>
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
      {/* Action cluster.
          Phone (<md): keep Save / Publish-drafts / Publish visible, push the rest into the overflow menu.
          Tablet+ (md): everything visible inline; flex-wrap lets buttons reflow on narrower desktops.
          `md:min-w-0 md:max-w-[70%]` keeps the action cluster from stealing all the row's width and squeezing the title to nothing on wide-but-not-huge desktops. */}
      <div className="flex items-center gap-2 flex-wrap justify-end md:min-w-0 md:max-w-[70%]">
        {/* Secondary toggles — hidden below md, surfaced via overflow menu instead */}
        <button
          onClick={onToggleTheme}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">palette</span>
          Theme
        </button>
        <button
          onClick={onToggleRegenerate}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">auto_awesome</span>
          Regenerate
        </button>
        <button
          onClick={onToggleHistory}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">history</span>
          History
        </button>
        <button
          onClick={onToggleSeo}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="SEO settings (title, description, OG image, canonical, noindex)"
        >
          <span className="material-icons text-base">search</span>
          SEO
        </button>

        {/* Save — always visible. Label hides on phone (icon-only). */}
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
          <span className="hidden sm:inline">{saving ? 'Saving...' : hasUnsavedChanges ? 'Update' : 'Saved'}</span>
        </button>

        {/* Publish-all-drafts — always visible when there are drafts (high-signal action) */}
        {onPublishAllDrafts && (
          <button
            onClick={onPublishAllDrafts}
            disabled={publishingAllDrafts || draftSlideCount === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-all disabled:opacity-40 ${
              draftSlideCount > 0
                ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm'
                : 'border border-border text-muted-foreground hidden sm:inline-flex'
            }`}
            title={
              draftSlideCount === 0
                ? 'No draft slides to publish'
                : `Publish ${draftSlideCount} draft slide${draftSlideCount === 1 ? '' : 's'} to make them live`
            }
          >
            {publishingAllDrafts ? (
              <span className="material-icons animate-spin text-base">autorenew</span>
            ) : (
              <span className="material-icons text-base">edit_note</span>
            )}
            <span className="hidden sm:inline">
              {publishingAllDrafts
                ? 'Publishing...'
                : draftSlideCount > 0
                  ? `Publish ${draftSlideCount} draft${draftSlideCount === 1 ? '' : 's'}`
                  : 'No drafts'}
            </span>
            {/* Phone-only compact count */}
            {!publishingAllDrafts && draftSlideCount > 0 && (
              <span className="sm:hidden">{draftSlideCount}</span>
            )}
          </button>
        )}

        {/* Preview/Present/A-B — desktop only inline; phone reaches via overflow */}
        <Link
          href={`/slides/${deck.slug}${deck.status !== 'published' ? '?preview=1' : ''}`}
          target="_blank"
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-base">{deck.status === 'published' ? 'open_in_new' : 'visibility'}</span>
          {deck.status === 'published' ? 'View Live' : 'Preview'}
        </Link>
        <button
          onClick={onPresent}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={`Open presenter view (${presenterUrl})`}
        >
          <span className="material-icons text-base">co_present</span>
          Present
        </button>
        {onStartAbTest && (
          <button
            onClick={onStartAbTest}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Start an A/B test for this deck"
          >
            <span className="material-icons text-base">science</span>
            A/B test
          </button>
        )}

        {/* Publish status toggle — always visible. Icon-only on phone. */}
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
          <span className="hidden sm:inline">{deck.status === 'published' ? 'Unpublish' : 'Publish'}</span>
        </button>

        {/* Delete — desktop inline; phone reaches via overflow */}
        <button
          onClick={onDelete}
          className="hidden md:inline-flex p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
          title="Delete deck"
        >
          <span className="material-icons text-base">delete</span>
        </button>

        {/* Mobile-only overflow menu — kebab opens a small panel with everything that's md:hidden above. */}
        <details className="md:hidden relative">
          <summary className="list-none p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer [&::-webkit-details-marker]:hidden">
            <span className="material-icons">more_vert</span>
          </summary>
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            <button onClick={onToggleTheme} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2">
              <span className="material-icons text-base">palette</span>Theme
            </button>
            <button onClick={onToggleRegenerate} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2">
              <span className="material-icons text-base">auto_awesome</span>Regenerate
            </button>
            <button onClick={onToggleHistory} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2">
              <span className="material-icons text-base">history</span>History
            </button>
            <button onClick={onToggleSeo} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2">
              <span className="material-icons text-base">search</span>SEO
            </button>
            <div className="h-px bg-border" />
            <Link
              href={`/slides/${deck.slug}${deck.status !== 'published' ? '?preview=1' : ''}`}
              target="_blank"
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2"
            >
              <span className="material-icons text-base">{deck.status === 'published' ? 'open_in_new' : 'visibility'}</span>
              {deck.status === 'published' ? 'View Live' : 'Preview'}
            </Link>
            <button onClick={onPresent} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2">
              <span className="material-icons text-base">co_present</span>Present
            </button>
            {onStartAbTest && (
              <button onClick={onStartAbTest} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2">
                <span className="material-icons text-base">science</span>A/B test
              </button>
            )}
            <div className="h-px bg-border" />
            <button onClick={onDelete} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2 text-red-600 dark:text-red-400">
              <span className="material-icons text-base">delete</span>Delete deck
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
