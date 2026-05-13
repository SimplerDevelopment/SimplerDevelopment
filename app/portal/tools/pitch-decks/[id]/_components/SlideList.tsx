/** Left-rail slide list with drag-to-reorder, path-group sections, decision/path-group/survey-picker controls, and collapse toggle. */
'use client';

import {
  DndContext, closestCenter, useSensor, useSensors,
  KeyboardSensor, MouseSensor, TouchSensor, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import { getSlideTitle, slideHasDraft } from '../_lib/helpers';
import { SortableSlideItem } from './SortableSlideItem';
import { PathGroupDropZone } from './PathGroupDropZone';

export interface SlideListProps {
  slides: PitchDeckSlideV2[];
  activeSlide: number;
  selectedSlides: Set<number>;
  collapsed: boolean;
  pathGroups: string[];
  hasSurveyService: boolean;
  showSurveyPicker: boolean;
  surveyListLoaded: boolean;
  surveyList: { id: number; title: string; status: string; fields: unknown[] }[];
  getSurveyFieldCount: (surveyId?: number) => number | undefined;

  /** Slide id currently being published (single-slide). Disables that row's button. */
  publishingSlideId?: string | null;
  onSetActive: (idx: number) => void;
  onSetCollapsed: (v: boolean) => void;
  onOpenBoardView: () => void;
  onAddSlide: () => void;
  onUploadHtmlSlide: () => void;
  onRenameSlide: (idx: number, label: string) => void;
  onDuplicateSlide: (idx: number) => void;
  onRemoveSlide: (idx: number) => void;
  onToggleSelect: (idx: number) => void;
  /** Publish a single slide's draft. Sibling to onRemoveSlide. */
  onPublishSlide?: (idx: number) => void;
  /** Cancel a single slide's draft (or pending-delete). */
  onCancelSlideDraft?: (idx: number) => void;
  onAddDecisionSlide: () => void;
  onAddPathGroup: () => void;
  onAddSlideToPathGroup: (pg: string) => void;
  onToggleSurveyPicker: () => void;
  onAddSurveySlide: (surveyId: number, surveyTitle: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

export function SlideList(props: SlideListProps) {
  const {
    slides, activeSlide, selectedSlides, collapsed, pathGroups,
    hasSurveyService, showSurveyPicker, surveyListLoaded, surveyList,
    getSurveyFieldCount, publishingSlideId,
    onSetActive, onSetCollapsed, onOpenBoardView, onAddSlide, onUploadHtmlSlide,
    onRenameSlide, onDuplicateSlide, onRemoveSlide, onToggleSelect,
    onPublishSlide, onCancelSlideDraft,
    onAddDecisionSlide, onAddPathGroup, onAddSlideToPathGroup,
    onToggleSurveyPicker, onAddSurveySlide, onDragEnd,
  } = props;

  const slideDndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className={`shrink-0 transition-all duration-200 ${collapsed ? 'w-12' : 'w-56'}`}>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {collapsed ? (
          <>
            <button
              onClick={() => onSetCollapsed(false)}
              className="w-full p-2 border-b border-border text-muted-foreground hover:text-foreground transition-colors"
              title="Expand slides"
            >
              <span className="material-icons text-base">chevron_right</span>
            </button>
            <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
              {slides.map((slide, idx) => (
                <button
                  key={slide.id}
                  onClick={() => onSetActive(idx)}
                  className={`relative w-full py-2 text-center text-xs font-mono border-b border-border/50 last:border-0 transition-colors ${
                    idx === activeSlide
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  title={`${getSlideTitle(slide)}${slideHasDraft(slide) ? ' (has draft)' : ''}`}
                >
                  {idx + 1}
                  {slideHasDraft(slide) && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slides</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={onOpenBoardView}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Board view"
                >
                  <span className="material-icons text-base">grid_view</span>
                </button>
                {hasSurveyService && (
                  <button
                    onClick={onToggleSurveyPicker}
                    className="text-primary hover:text-primary/80"
                    title="Insert survey as slides"
                  >
                    <span className="material-icons text-lg">assignment</span>
                  </button>
                )}
                <button onClick={onAddSlide} className="text-primary hover:text-primary/80" title="Add slide">
                  <span className="material-icons text-lg">add_circle</span>
                </button>
                <button
                  onClick={onUploadHtmlSlide}
                  className="text-primary hover:text-primary/80"
                  title="Upload HTML slide"
                >
                  <span className="material-icons text-lg">upload_file</span>
                </button>
                <button
                  onClick={() => onSetCollapsed(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Collapse slides"
                >
                  <span className="material-icons text-base">chevron_left</span>
                </button>
              </div>
            </div>
            {showSurveyPicker && (
              <div className="border-b border-border p-3 space-y-2 bg-accent/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Insert Survey</span>
                  <button onClick={onToggleSurveyPicker} className="text-muted-foreground hover:text-foreground">
                    <span className="material-icons text-sm">close</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Each question becomes its own slide in the presentation.</p>
                {!surveyListLoaded ? (
                  <div className="flex items-center justify-center py-3">
                    <span className="material-icons animate-spin text-base text-muted-foreground">autorenew</span>
                  </div>
                ) : surveyList.filter(s => s.status === 'active').length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No active surveys found. Create one in the Surveys section first.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {surveyList.filter(s => s.status === 'active').map(s => (
                      <button
                        key={s.id}
                        onClick={() => onAddSurveySlide(s.id, s.title)}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-accent transition-colors flex items-center gap-2"
                      >
                        <span className="material-icons text-sm text-primary">assignment</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate">{s.title}</div>
                          <div className="text-muted-foreground">{Array.isArray(s.fields) ? (s.fields as { type?: string }[]).filter(f => f.type !== 'page_break' && f.type !== 'heading').length : 0} questions</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
              <DndContext sensors={slideDndSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <PathGroupDropZone id="drop-zone-main" label="Main Sequence">
                    {slides.map((slide, idx) => {
                      if (slide.pathGroup) return null;
                      return (
                        <SortableSlideItem
                          key={slide.id}
                          slide={slide}
                          index={idx}
                          isActive={idx === activeSlide}
                          isSelected={selectedSlides.has(idx)}
                          onClick={() => onSetActive(idx)}
                          onRename={(label) => onRenameSlide(idx, label)}
                          onDuplicate={() => onDuplicateSlide(idx)}
                          onRemove={() => onRemoveSlide(idx)}
                          onToggleSelect={() => onToggleSelect(idx)}
                          onPublish={onPublishSlide ? () => onPublishSlide(idx) : undefined}
                          onCancelDraft={onCancelSlideDraft ? () => onCancelSlideDraft(idx) : undefined}
                          publishing={publishingSlideId === slide.id}
                          canRemove={slides.length > 1}
                          surveyFieldCount={slide.surveySlide ? getSurveyFieldCount(slide.surveyId) : undefined}
                        />
                      );
                    })}
                  </PathGroupDropZone>

                  <div className="border-t border-border p-2 space-y-1">
                    <button
                      onClick={onAddDecisionSlide}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <span className="material-icons text-sm text-amber-500">fork_right</span>
                      Add Decision Slide
                    </button>
                    <button
                      onClick={onAddPathGroup}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <span className="material-icons text-sm text-blue-500">route</span>
                      Add Path Group
                    </button>
                  </div>

                  {pathGroups.map(pg => {
                    const pgSlides = slides.map((s, i) => ({ slide: s, idx: i })).filter(({ slide }) => slide.pathGroup === pg);
                    return (
                      <PathGroupDropZone key={pg} id={`drop-zone-${pg}`} label={pg}>
                        <div className="px-3 py-2 flex items-center justify-between bg-accent/20">
                          <div className="flex items-center gap-1.5">
                            <span className="material-icons text-sm text-blue-500">route</span>
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{pg}</span>
                          </div>
                          <button
                            onClick={() => onAddSlideToPathGroup(pg)}
                            className="text-primary hover:text-primary/80"
                            title={`Add slide to ${pg}`}
                          >
                            <span className="material-icons text-base">add_circle</span>
                          </button>
                        </div>
                        {pgSlides.map(({ slide, idx }) => (
                          <SortableSlideItem
                            key={slide.id}
                            slide={slide}
                            index={idx}
                            isActive={idx === activeSlide}
                            isSelected={selectedSlides.has(idx)}
                            onClick={() => onSetActive(idx)}
                            onRename={(label) => onRenameSlide(idx, label)}
                            onDuplicate={() => onDuplicateSlide(idx)}
                            onRemove={() => onRemoveSlide(idx)}
                            onToggleSelect={() => onToggleSelect(idx)}
                            onPublish={onPublishSlide ? () => onPublishSlide(idx) : undefined}
                            onCancelDraft={onCancelSlideDraft ? () => onCancelSlideDraft(idx) : undefined}
                            publishing={publishingSlideId === slide.id}
                            canRemove={slides.length > 1}
                            surveyFieldCount={slide.surveySlide ? getSurveyFieldCount(slide.surveyId) : undefined}
                          />
                        ))}
                        {pgSlides.length === 0 && (
                          <p className="text-[10px] text-muted-foreground text-center py-2">Drop slides here or click + to add</p>
                        )}
                      </PathGroupDropZone>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
