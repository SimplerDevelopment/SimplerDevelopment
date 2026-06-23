/** Full-screen board view — slide thumbnails grouped by main sequence + path groups, with drag-to-reorder. */
'use client';

import { useEffect, useState } from 'react';
import {
  DndContext, closestCenter, useSensor, useSensors,
  KeyboardSensor, MouseSensor, TouchSensor, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy,
} from '@dnd-kit/sortable';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { PATH_GROUP_COLORS } from '../_lib/helpers';
import { SortableBoardCard, BoardPathGroupHeader } from './SortableBoardCard';

export interface BoardViewProps {
  slides: PitchDeckSlideV2[];
  activeSlide: number;
  theme: PitchDeckTheme;
  pathGroups: string[];
  boardColumns: number;
  getSurveyFieldCount: (surveyId?: number) => number | undefined;

  onSetColumns: (n: number) => void;
  onClose: () => void;
  onSelectSlide: (idx: number) => void;
  onRenameSlide: (idx: number, label: string) => void;
  onRenamePathGroup: (oldName: string, newName: string) => void;
  onAddSlide: () => void;
  onUploadHtmlSlide: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}

export function BoardView(props: BoardViewProps) {
  const {
    slides, activeSlide, theme, pathGroups, boardColumns, getSurveyFieldCount,
    onSetColumns, onClose, onSelectSlide, onRenameSlide, onRenamePathGroup,
    onAddSlide, onUploadHtmlSlide, onDragEnd,
  } = props;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Cap the rendered column count to what fits given viewport width. Cards are
  // 16/9 aspect — below ~140px wide they become unreadable. boardColumns is the
  // user's preference; we honor it on desktop but clamp on phone/tablet so the
  // board stays usable when summoned at narrow widths.
  const [effectiveColumns, setEffectiveColumns] = useState(boardColumns);
  useEffect(() => {
    function recompute() {
      const w = window.innerWidth;
      const cardMin = 140;
      const padding = 48;
      const maxCols = Math.max(1, Math.floor((w - padding) / cardMin));
      setEffectiveColumns(Math.min(boardColumns, maxCols));
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [boardColumns]);

  const mainSlides = slides.map((s, i) => ({ slide: s, idx: i })).filter(({ slide }) => !slide.pathGroup);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="material-icons text-muted-foreground shrink-0">grid_view</span>
          <h2 className="text-sm font-semibold text-foreground">All Slides</h2>
          <span className="text-xs text-muted-foreground shrink-0">{slides.length} slides</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Column-count picker — hide the wider options on phone */}
          <div className="hidden sm:flex items-center gap-1.5 bg-accent/50 rounded-lg p-1">
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => onSetColumns(n)}
                className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium transition-colors ${
                  boardColumns === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title={`${n} columns`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Close board view"
          >
            <span className="material-icons">close</span>
          </button>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slides.map(s => s.id)} strategy={rectSortingStrategy}>
          <div className="p-3 sm:p-6 space-y-6">
            {mainSlides.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="material-icons text-sm text-muted-foreground">slideshow</span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Main</span>
                  <span className="text-[10px] text-muted-foreground">{mainSlides.length} slides</span>
                </div>
                <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` }}>
                  {mainSlides.map(({ slide, idx }) => (
                    <SortableBoardCard
                      key={slide.id}
                      slide={slide}
                      index={idx}
                      isActive={idx === activeSlide}
                      theme={theme}
                      onClick={() => onSelectSlide(idx)}
                      pathGroups={pathGroups}
                      columns={boardColumns}
                      onRename={(label) => onRenameSlide(idx, label)}
                      surveyFieldCount={slide.surveySlide ? getSurveyFieldCount(slide.surveyId) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
            {pathGroups.map((pg, groupIdx) => {
              const pgSlides = slides.map((s, i) => ({ slide: s, idx: i })).filter(({ slide }) => slide.pathGroup === pg);
              const c = PATH_GROUP_COLORS[groupIdx % PATH_GROUP_COLORS.length];
              return (
                <div key={pg} className={`rounded-xl border p-5 ${c.bg} ${c.border}`}>
                  <BoardPathGroupHeader name={pg} color={c} slideCount={pgSlides.length} onRename={(newName) => onRenamePathGroup(pg, newName)} />
                  <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` }}>
                    {pgSlides.map(({ slide, idx }) => (
                      <SortableBoardCard
                        key={slide.id}
                        slide={slide}
                        index={idx}
                        isActive={idx === activeSlide}
                        theme={theme}
                        onClick={() => onSelectSlide(idx)}
                        pathGroups={pathGroups}
                        onRename={(label) => onRenameSlide(idx, label)}
                        surveyFieldCount={slide.surveySlide ? getSurveyFieldCount(slide.surveyId) : undefined}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onAddSlide}
                className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/30 transition-colors"
              >
                <span className="material-icons text-base">add</span>
                Add Slide
              </button>
              <button
                onClick={onUploadHtmlSlide}
                className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/30 transition-colors"
              >
                <span className="material-icons text-base">upload_file</span>
                Upload HTML
              </button>
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
