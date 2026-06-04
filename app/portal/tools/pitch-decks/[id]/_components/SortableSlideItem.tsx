/** Sortable slide item rendered in the left-rail SlideList. Drag handle, checkbox, double-click rename, hover actions. */
'use client';

import { memo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import {
  getSlideIcon,
  getSlideTitle,
  slideHasDraft,
  slideIsPendingCreate,
  slideIsPendingDelete,
} from '../_lib/helpers';

export interface SortableSlideItemProps {
  slide: PitchDeckSlideV2;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onRename: (newLabel: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToggleSelect: () => void;
  /** Publish this slide's draft (if any). */
  onPublish?: () => void;
  /** Cancel the slide's draft / pending-delete. Hides when no draft exists. */
  onCancelDraft?: () => void;
  /** True while a publish request is in flight for THIS slide. */
  publishing?: boolean;
  canRemove: boolean;
  surveyFieldCount?: number;
}

function SortableSlideItemImpl({
  slide, index, isActive, isSelected, onClick, onRename, onDuplicate, onRemove, onToggleSelect,
  onPublish, onCancelDraft, publishing, canRemove, surveyFieldCount,
}: SortableSlideItemProps) {
  const hasDraft = slideHasDraft(slide);
  const pendingDelete = slideIsPendingDelete(slide);
  const pendingCreate = slideIsPendingCreate(slide);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const commitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== slide.label) {
      onRename(renameValue.trim());
    }
    setRenaming(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 border-b border-border/50 last:border-0 transition-colors ${
        slide.surveySlide ? 'border-l-2 border-l-emerald-500' : ''
      } ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="pl-2 py-2.5 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
      >
        <span className="material-icons text-sm">drag_indicator</span>
      </span>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className="shrink-0 rounded border-border accent-primary cursor-pointer"
        title="Select for batch edit"
      />
      <div
        onClick={onClick}
        className="flex-1 text-left py-2.5 pr-3 flex items-center gap-2 min-w-0 cursor-pointer"
      >
        <span className="text-xs font-mono opacity-50 w-4 text-right shrink-0">{index + 1}</span>
        <span className={`material-icons text-base shrink-0 ${slide.surveySlide ? 'text-emerald-500' : ''}`}>{getSlideIcon(slide)}</span>
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-background border border-primary rounded px-1.5 py-0.5 text-sm text-foreground outline-none"
          />
        ) : (
          <span
            className={`text-sm truncate ${pendingDelete ? 'line-through opacity-60' : ''}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenameValue(slide.label || getSlideTitle(slide));
              setRenaming(true);
            }}
            title="Double-click to rename"
          >
            {getSlideTitle(slide)}
          </span>
        )}
        {pendingCreate && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold shrink-0"
            title="New slide — not yet published"
          >
            <span className="material-icons text-[10px]">fiber_new</span>
            New
          </span>
        )}
        {pendingDelete && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-semibold shrink-0"
            title="Marked for deletion — still live until you publish"
          >
            <span className="material-icons text-[10px]">delete_sweep</span>
            Pending delete
          </span>
        )}
        {hasDraft && !pendingCreate && !pendingDelete && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold shrink-0"
            title="Unpublished draft changes"
          >
            <span className="material-icons text-[10px]">edit_note</span>
            Draft
          </span>
        )}
        {slide.surveySlide && surveyFieldCount != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium shrink-0" title={`Expands to ${surveyFieldCount} question slides`}>
            {surveyFieldCount} slides
          </span>
        )}
      </div>
      <div className="flex items-center shrink-0 pr-2 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {hasDraft && onPublish && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPublish(); }}
            disabled={publishing}
            className="p-1 rounded hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors disabled:opacity-50"
            title={pendingDelete ? 'Publish — removes this slide' : pendingCreate ? 'Publish new slide' : 'Publish draft changes'}
          >
            <span className={`material-icons text-sm ${publishing ? 'animate-spin' : ''}`}>
              {publishing ? 'autorenew' : 'publish'}
            </span>
          </button>
        )}
        {hasDraft && onCancelDraft && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCancelDraft(); }}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title={pendingDelete ? 'Cancel deletion' : 'Discard draft changes'}
          >
            <span className="material-icons text-sm">undo</span>
          </button>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Duplicate slide"
        >
          <span className="material-icons text-sm">content_copy</span>
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          disabled={!canRemove}
          className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Remove slide"
        >
          <span className="material-icons text-sm">delete_outline</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Memoized so toggling activeSlide / setHasUnsavedChanges in the parent
 * doesn't re-render every slide row — only the previously-active and the
 * newly-active rows flip `isActive`. Custom equality is intentionally tight:
 *
 *  - slide reference: a slide-level mutation (rename, blocks change, draft
 *    toggle) must repaint that row's title/badges; we identity-compare
 *    because the page rebuilds the slides array immutably on every edit
 *  - isActive / isSelected / publishing / canRemove: visible primitives
 *  - surveyFieldCount: rendered in the badge
 *  - callbacks (onClick etc.): identity is unstable on every page render,
 *    so we deliberately *exclude* them from the equality check. The render
 *    output doesn't depend on callback identity, only on whether the
 *    callback exists — captured by `!!onPublish` / `!!onCancelDraft`.
 */
export const SortableSlideItem = memo(SortableSlideItemImpl, (prev, next) => {
  return (
    prev.slide === next.slide &&
    prev.index === next.index &&
    prev.isActive === next.isActive &&
    prev.isSelected === next.isSelected &&
    prev.publishing === next.publishing &&
    prev.canRemove === next.canRemove &&
    prev.surveyFieldCount === next.surveyFieldCount &&
    !!prev.onPublish === !!next.onPublish &&
    !!prev.onCancelDraft === !!next.onCancelDraft
  );
});
