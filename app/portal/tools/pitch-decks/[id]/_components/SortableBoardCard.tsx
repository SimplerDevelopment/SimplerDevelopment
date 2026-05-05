/** Board-view slide thumbnail card — scaled iframe-less preview, drag handle, double-click rename, decision-path badges. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';
import { getPathGroupColor, getSlideIcon } from '../_lib/helpers';

export interface SortableBoardCardProps {
  slide: PitchDeckSlideV2;
  index: number;
  isActive: boolean;
  theme: PitchDeckTheme;
  onClick: () => void;
  pathGroups: string[];
  onRename: (newLabel: string) => void;
  columns?: number;
  surveyFieldCount?: number;
}

export function SortableBoardCard({
  slide, index, isActive, theme, onClick, pathGroups, onRename, columns = 4, surveyFieldCount,
}: SortableBoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbScale, setThumbScale] = useState(0.25);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const update = () => setThumbScale(el.offsetWidth / 1280);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [columns]);

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
      className={`group relative bg-card border rounded-xl overflow-hidden text-left transition-all hover:ring-2 hover:ring-primary/50 hover:shadow-lg ${
        slide.surveySlide ? 'border-l-2 border-l-emerald-500' : ''
      } ${
        isActive ? 'ring-2 ring-primary border-primary' : 'border-border'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 p-1 rounded bg-black/30 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <span className="material-icons text-sm">drag_indicator</span>
      </div>
      {slide.surveySlide && surveyFieldCount != null && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/90 text-white text-[10px] font-semibold shadow">
          <span className="material-icons text-xs">assignment</span>
          {surveyFieldCount} question slides
        </div>
      )}
      <button type="button" onClick={onClick} className="w-full text-left">
        <div ref={thumbRef} className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <div
            className="pointer-events-none absolute top-0 left-0"
            style={{
              width: '1280px',
              height: '720px',
              transform: `scale(${thumbScale})`,
              transformOrigin: 'top left',
            }}
          >
            <SlideBlockWrapper
              slide={slide}
              theme={theme}
              className="w-full h-full"
              fullBleed={slide.blocks?.length === 1 && slide.blocks[0].type === 'html-embed' && (slide.blocks[0].width ?? 'full') === 'full'}
            />
          </div>
        </div>
      </button>
      <div className="px-3 py-2 flex items-center gap-2">
        <span className={`text-xs font-mono ${isActive ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
          {index + 1}
        </span>
        <span className="material-icons text-xs text-muted-foreground">{getSlideIcon(slide)}</span>
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            className="text-xs text-foreground bg-transparent border-b border-primary outline-none flex-1 min-w-0"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-xs text-foreground truncate cursor-text"
            onDoubleClick={(e) => { e.stopPropagation(); setRenameValue(slide.label || ''); setRenaming(true); }}
          >
            {slide.label || 'Untitled'}
          </span>
        )}
        {slide.pathGroup && !renaming && (() => {
          const c = getPathGroupColor(slide.pathGroup, pathGroups);
          return <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.bg} ${c.text} font-medium shrink-0`}>{slide.pathGroup}</span>;
        })()}
      </div>
      {slide.decisionSlide && slide.decisionOptions && slide.decisionOptions.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {slide.decisionOptions.map(opt => {
            const c = getPathGroupColor(opt.pathGroup, pathGroups);
            return (
              <span key={opt.id} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${c.bg} ${c.text} font-medium`}>
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {opt.label || opt.pathGroup}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BoardPathGroupHeader({ name, color, slideCount, onRename }: {
  name: string;
  color: { text: string };
  slideCount: number;
  onRename: (newName: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState('');

  const commit = () => {
    if (value.trim() && value.trim() !== name) {
      onRename(value.trim());
    }
    setRenaming(false);
  };

  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className={`material-icons text-sm ${color.text}`}>route</span>
      {renaming ? (
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false); }}
          className="text-xs font-semibold text-foreground uppercase tracking-wider bg-transparent border-b border-primary outline-none"
        />
      ) : (
        <span
          className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-text"
          onDoubleClick={() => { setValue(name); setRenaming(true); }}
        >
          {name}
        </span>
      )}
      <span className="text-[10px] text-muted-foreground">{slideCount} slides</span>
    </div>
  );
}
