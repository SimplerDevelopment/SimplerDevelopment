'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { use } from 'react';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import type { Block, BlockType } from '@/types/blocks';
import type { BrandDefaultsContext } from '@/lib/branding/block-defaults';
import { type DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import { usePitchDeckState } from './_hooks/usePitchDeckState';
import {
  loadBrandDefaults,
  loadNavServices,
  loadSurveys,
  patchSurveyFields,
  patchDeck,
  saveDeck as apiSaveDeck,
  deleteDeck,
  regenerateDeck,
  generateSlide,
  batchEditSlides,
  listVersions,
  saveVersionCheckpoint,
  restoreVersion,
  uploadHtmlSlide,
  publishSlideDraft,
  publishAllSlideDrafts,
  type VersionMeta,
  type AiHistoryTurn,
} from './_lib/api';
import {
  normalizeDeckBlockIds,
  getSlideView,
  mergeSlideDraft,
  markSlidePendingDelete,
  clearSlideDraft,
  slideHasDraft,
  slideIsPendingDelete,
  slideIsPendingCreate,
} from './_lib/helpers';

import { EditorHeader } from './_components/EditorHeader';
import { ThemePanel } from './_components/ThemePanel';
import { RegenerateModal } from './_components/RegenerateModal';
import { HistoryPanel } from './_components/HistoryPanel';
import { SeoPanel } from './_components/SeoPanel';
import { SlideList } from './_components/SlideList';
import { BatchEditBar } from './_components/BatchEditBar';
import { BoardView } from './_components/BoardView';
import { DecisionSlideEditor } from './_components/DecisionSlideEditor';
import { SurveySlideQuestionList, SurveyFieldEditorView } from './_components/SurveySlideEditor';
import { SlideSettingsPanel } from './_components/SlideSettingsPanel';
import { SlideContentEditor } from './_components/SlideContentEditor';
import {
  DeckCollaborationProvider,
  useDeckCollab,
} from './_components/DeckCollaborationProvider';
import { DeckPresenceBar } from './_components/DeckPresenceBar';
import { DeckSlideCursors } from './_components/DeckSlideCursors';
import { DeckSlideThumbnailIndicators } from './_components/DeckSlideThumbnailIndicators';

export default function PitchDeckEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <DeckCollaborationProvider deckId={id}>
      <PitchDeckEditorContent id={id} />
    </DeckCollaborationProvider>
  );
}

function PitchDeckEditorContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Realtime collab — supplies the Y.Doc once connected, plus awareness API.
  const collab = useDeckCollab();

  const {
    deck, setDeck, loading, error, setError,
    hasUnsavedChanges, setHasUnsavedChanges, saving, setSaving, publishing, setPublishing,
  } = usePitchDeckState(id, { ydoc: collab.ydoc });

  // Container for the active slide's preview area — DeckSlideCursors uses
  // its bounding rect to normalize cursor coordinates.
  const slideCanvasRef = useRef<HTMLDivElement | null>(null);

  // ─── Local UI state ─────────────────────────────────────────────────────────
  const [activeSlide, setActiveSlide] = useState(0);
  const [slidePrompt, setSlidePrompt] = useState('');
  const [slideGenerating, setSlideGenerating] = useState(false);
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSeo, setShowSeo] = useState(false);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);

  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('edit');
  const [slidePanelCollapsed, setSlidePanelCollapsed] = useState(false);
  const [iframeViewport, setIframeViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [editorLeftCollapsed, setEditorLeftCollapsed] = useState(false);
  const [editorRightCollapsed, setEditorRightCollapsed] = useState(false);
  const [boardView, setBoardView] = useState(false);
  const [boardColumns, setBoardColumns] = useState(4);

  const [aiHistory, setAiHistory] = useState<Record<number, AiHistoryTurn[]>>({});
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Survey integration state
  const [hasSurveyService, setHasSurveyService] = useState(false);
  const [surveyList, setSurveyList] = useState<{ id: number; title: string; status: string; fields: unknown[] }[]>([]);
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);
  const [surveyListLoaded, setSurveyListLoaded] = useState(false);
  const [editingSurveyFieldId, setEditingSurveyFieldId] = useState<string | null>(null);

  // Brand defaults
  const [brandDefaults, setBrandDefaults] = useState<BrandDefaultsContext | null>(null);

  // Draft-publish state — independent of the deck-status "publishing" flag.
  const [publishingSlideId, setPublishingSlideId] = useState<string | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);

  /** Hidden file input shared by every "Upload HTML Slide" trigger. */
  const htmlSlideFileInputRef = useRef<HTMLInputElement>(null);
  /** Debounce timer for survey-field property writes. */
  const surveyFieldSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear survey field editing when switching slides
  // eslint-disable-next-line react-hooks/set-state-in-effect -- preserving pre-refactor pattern; switching slides resets the survey-field selection synchronously
  useEffect(() => { setEditingSurveyFieldId(null); }, [activeSlide]);

  // Broadcast local active-slide via awareness so peers can see where we are.
  useEffect(() => {
    collab.awareness.setActiveSlide(activeSlide);
  }, [collab.awareness, activeSlide]);

  // Surveys + nav-service detection.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const navData = await loadNavServices();
      if (!mounted || !navData?.success) return;
      const hasSurveys = navData.data?.some(s =>
        (s.category === 'surveys' || s.category === 'bundle') && s.subscribed
      );
      if (!hasSurveys) return;
      setHasSurveyService(true);
      const sData = await loadSurveys();
      if (!mounted) return;
      if (sData?.success && sData.data) {
        setSurveyList(sData.data.map(s => ({ id: s.id, title: s.title, status: s.status, fields: s.fields })));
      }
      setSurveyListLoaded(true);
    })().catch(() => { if (mounted) setSurveyListLoaded(true); });
    return () => { mounted = false; };
  }, []);

  // Brand defaults — fetched once per deck so newly-added blocks pre-fill from
  // the client's messaging (tagline, value prop, etc.) and tag colors with sentinels.
  useEffect(() => {
    if (!deck) return;
    loadBrandDefaults(deck.brandingProfileId)
      .then(d => { if (d.success && d.data) setBrandDefaults(d.data as BrandDefaultsContext); })
      .catch(() => {});
  }, [deck]);

  // Surface AI-generation errors via query string. Pre-refactor parity:
  // setError + setShowRegenerate are intentionally called synchronously in
  // this effect because the alternative (deriving from searchParams during
  // render) would re-fire the modal every render until the URL is rewritten.
  useEffect(() => {
    if (searchParams.get('genError') === '1') {
      setError('AI generation failed. You can try regenerating the deck.');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, see comment above
      setShowRegenerate(true);
    }
  }, [searchParams, setError]);

  // Close board view on ESC
  useEffect(() => {
    if (!boardView) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setBoardView(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [boardView]);

  // ─── Survey helpers ──────────────────────────────────────────────────────────

  function getSurveyFieldCount(surveyId?: number): number | undefined {
    if (!surveyId) return undefined;
    const survey = surveyList.find(s => s.id === surveyId);
    if (!survey) return undefined;
    return (survey.fields as { type?: string }[]).filter(f => f.type !== 'page_break').length;
  }

  function getSurveyFields(surveyId?: number): { id: string; type: string; label: string; required: boolean; options: string[]; placeholder?: string; min?: number; max?: number; step?: number }[] {
    if (!surveyId) return [];
    const survey = surveyList.find(s => s.id === surveyId);
    if (!survey) return [];
    return (survey.fields as { id: string; type: string; label: string; required: boolean; options: string[]; placeholder?: string; min?: number; max?: number; step?: number; order: number }[])
      .filter(f => f.type !== 'page_break')
      .sort((a, b) => a.order - b.order);
  }

  function addSurveySlide(surveyId: number, surveyTitle: string) {
    if (!deck) return;
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-survey-${Date.now()}`,
      label: `Survey: ${surveyTitle}`,
      blocks: [],
      surveySlide: true,
      surveyId,
    };
    const newSlides = [...deck.slides, newSlide];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
    setShowSurveyPicker(false);
  }

  /** Update a survey field property and persist to the survey record (source of truth). */
  function updateSurveyField(surveyId: number, fieldId: string, updates: Record<string, unknown>) {
    setSurveyList(prev => prev.map(s => {
      if (s.id !== surveyId) return s;
      const fields = (s.fields as Record<string, unknown>[]).map(f => {
        if ((f as { id: string }).id !== fieldId) return f;
        return { ...f, ...updates };
      });
      return { ...s, fields };
    }));
    if (surveyFieldSaveTimerRef.current) clearTimeout(surveyFieldSaveTimerRef.current);
    surveyFieldSaveTimerRef.current = setTimeout(() => {
      const survey = surveyList.find(s => s.id === surveyId);
      if (!survey) return;
      const updatedFields = (survey.fields as Record<string, unknown>[]).map(f => {
        if ((f as { id: string }).id !== fieldId) return f;
        return { ...f, ...updates };
      });
      patchSurveyFields(surveyId, updatedFields).catch(() => {});
    }, 800);
  }

  // ─── Path Groups & Decision Slides ───────────────────────────────────────────

  function getPathGroups(): string[] {
    if (!deck) return [];
    const groups = new Set<string>();
    for (const slide of deck.slides) {
      if (slide.pathGroup) groups.add(slide.pathGroup);
    }
    for (const slide of deck.slides) {
      if (slide.decisionOptions) {
        for (const opt of slide.decisionOptions) groups.add(opt.pathGroup);
      }
    }
    return Array.from(groups).sort();
  }

  function addPathGroup() {
    const name = prompt('Path group name (e.g. "pricing", "case-studies"):');
    if (!name?.trim() || !deck) return;
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug) return;
    const initialBlocks: Block[] = [
      { id: `block-${Date.now()}-h`, type: 'heading', order: 1, content: 'New Slide', level: 2 as const, alignment: 'center' as const },
    ];
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${Date.now()}`,
      label: 'New Slide',
      blocks: [],
      pathGroup: slug,
      draft: {
        pendingCreate: true,
        blocks: initialBlocks,
        updatedAt: new Date().toISOString(),
      },
    };
    const newSlides = [...deck.slides, newSlide];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
  }

  function addSlideToPathGroup(pathGroup: string) {
    if (!deck) return;
    const initialBlocks: Block[] = [
      { id: `block-${Date.now()}-h`, type: 'heading', order: 1, content: 'New Slide', level: 2 as const, alignment: 'center' as const },
    ];
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${Date.now()}`,
      label: 'New Slide',
      blocks: [],
      pathGroup,
      draft: {
        pendingCreate: true,
        blocks: initialBlocks,
        updatedAt: new Date().toISOString(),
      },
    };
    const lastIdx = deck.slides.reduce((acc, s, i) => s.pathGroup === pathGroup ? i : acc, -1);
    const newSlides = [...deck.slides];
    newSlides.splice(lastIdx + 1, 0, newSlide);
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(lastIdx + 1);
    setHasUnsavedChanges(true);
  }

  function renamePathGroup(oldName: string, newName: string) {
    if (!deck || !newName.trim() || newName === oldName) return;
    const slug = newName.trim().toLowerCase().replace(/\s+/g, '-');
    const newSlides = deck.slides.map(s => {
      const updated = { ...s };
      if (updated.pathGroup === oldName) updated.pathGroup = slug;
      if (updated.decisionOptions) {
        updated.decisionOptions = updated.decisionOptions.map(opt =>
          opt.pathGroup === oldName ? { ...opt, pathGroup: slug } : opt
        );
      }
      return updated;
    });
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  function addDecisionSlide() {
    if (!deck) return;
    const groups = getPathGroups();
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-decision-${Date.now()}`,
      label: 'Decision Point',
      blocks: [],
      decisionSlide: true,
      decisionOptions: groups.length >= 2
        ? groups.slice(0, 2).map((pg, i) => ({
            id: `opt-${Date.now()}-${i}`,
            label: pg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            pathGroup: pg,
          }))
        : [
            { id: `opt-${Date.now()}-0`, label: 'Option A', pathGroup: 'path-a' },
            { id: `opt-${Date.now()}-1`, label: 'Option B', pathGroup: 'path-b' },
          ],
    };
    const mainSlides = deck.slides.filter(s => !s.pathGroup);
    const lastMainIdx = deck.slides.indexOf(mainSlides[mainSlides.length - 1]);
    const newSlides = [...deck.slides];
    newSlides.splice(lastMainIdx >= 0 ? lastMainIdx : deck.slides.length, 0, newSlide);
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(lastMainIdx >= 0 ? lastMainIdx : deck.slides.length - 1);
    setHasUnsavedChanges(true);
  }

  function updateDecisionOption(slideIdx: number, optionId: string, updates: Partial<{ label: string; description: string; icon: string; pathGroup: string }>) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    const slide = { ...newSlides[slideIdx] };
    slide.decisionOptions = (slide.decisionOptions || []).map(opt =>
      opt.id === optionId ? { ...opt, ...updates } : opt
    );
    newSlides[slideIdx] = slide;
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  function addDecisionOption(slideIdx: number) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    const slide = { ...newSlides[slideIdx] };
    slide.decisionOptions = [
      ...(slide.decisionOptions || []),
      { id: `opt-${Date.now()}`, label: 'New Option', pathGroup: `path-${Date.now()}` },
    ];
    newSlides[slideIdx] = slide;
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  function removeDecisionOption(slideIdx: number, optionId: string) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    const slide = { ...newSlides[slideIdx] };
    slide.decisionOptions = (slide.decisionOptions || []).filter(opt => opt.id !== optionId);
    newSlides[slideIdx] = slide;
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  function updateDecisionCover(slideIdx: number, updates: Partial<NonNullable<PitchDeckSlideV2['decisionCover']>>) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    const slide = { ...newSlides[slideIdx] };
    slide.decisionCover = { ...(slide.decisionCover || {}), ...updates };
    newSlides[slideIdx] = slide;
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  // ─── AI prompts (per-slide / batch / regenerate) ─────────────────────────────

  async function handleSlideEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!slidePrompt.trim() || !deck) return;
    const userPrompt = slidePrompt.trim();
    setSlideGenerating(true);
    setError('');
    const slideHistory = aiHistory[activeSlide] || [];
    const data = await generateSlide(id, activeSlide, userPrompt, slideHistory);
    setSlideGenerating(false);
    if (data.success && data.data) {
      setDeck(normalizeDeckBlockIds(data.data));
      setSlidePrompt('');
      setHasUnsavedChanges(false);
      setAiHistory((prev) => ({
        ...prev,
        [activeSlide]: [
          ...(prev[activeSlide] || []),
          { role: 'user' as const, content: userPrompt },
          { role: 'assistant' as const, content: data.aiResponse || '' },
        ],
      }));
    } else {
      setError(data.message || 'Failed to edit slide');
    }
  }

  async function handleBatchEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!batchPrompt.trim() || !deck || selectedSlides.size === 0) return;
    setBatchGenerating(true);
    setError('');
    const data = await batchEditSlides(id, batchPrompt.trim(), Array.from(selectedSlides).sort((a, b) => a - b));
    setBatchGenerating(false);
    if (data.success && data.data) {
      setDeck(normalizeDeckBlockIds(data.data));
      setBatchPrompt('');
      setSelectedSlides(new Set());
      setHasUnsavedChanges(false);
    } else {
      setError(data.message || 'Batch edit failed');
    }
  }

  function toggleSlideSelection(idx: number) {
    setSelectedSlides(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!regeneratePrompt.trim() || !deck) return;
    setRegenerating(true);
    setError('');
    const data = await regenerateDeck(id, regeneratePrompt.trim(), deck.sourceUrl);
    setRegenerating(false);
    if (data.success && data.data) {
      setDeck(normalizeDeckBlockIds(data.data));
      setRegeneratePrompt('');
      setShowRegenerate(false);
      setActiveSlide(0);
      setHasUnsavedChanges(false);
    } else {
      setError(data.message || 'Failed to regenerate');
    }
  }

  // ─── Slide CRUD ──────────────────────────────────────────────────────────────

  function handleSlideBlocksChange(slideIdx: number, newBlocks: Block[]) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    // Writes land in the slide's draft overlay — live fields are only
    // touched when the user explicitly publishes the slide.
    newSlides[slideIdx] = mergeSlideDraft(newSlides[slideIdx], { blocks: newBlocks });
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  function getSurveyFieldBlocksForEditing(slideIdx: number, fieldId: string): Block[] {
    if (!deck) return [];
    const slide = deck.slides[slideIdx];
    if (slide.surveyFieldBlocks?.[fieldId]) return slide.surveyFieldBlocks[fieldId];
    const fields = getSurveyFields(slide.surveyId);
    const field = fields.find(f => f.id === fieldId);
    if (!field) return [];
    const uid = () => `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return [
      { id: uid(), type: 'heading' as BlockType, order: 1, content: field.label + (field.required ? ' *' : ''), level: 2, required: true } as Block,
      { id: uid(), type: 'survey-input' as BlockType, order: 2, fieldType: field.type, fieldLabel: field.label, placeholder: field.placeholder, options: field.options, min: field.min, max: field.max, step: field.step, required: true } as Block,
    ];
  }

  function updateSurveyFieldBlocks(slideIdx: number, fieldId: string, blocks: Block[]) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    const slide = { ...newSlides[slideIdx] };
    slide.surveyFieldBlocks = { ...(slide.surveyFieldBlocks || {}), [fieldId]: blocks };
    newSlides[slideIdx] = slide;
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }
  // Reference _-prefixed helpers so future feature wiring can pick them up.
  void getSurveyFieldBlocksForEditing;
  void updateSurveyFieldBlocks;

  async function saveDeck() {
    if (!deck) return;
    // When realtime collab is connected, the server-side snapshot persister
    // owns durable saves of `slides` — patch theme via the existing PATCH
    // endpoint so theme/non-slide fields still flush, but skip pushing the
    // slides blob.
    setSaving(true);
    if (collab.enabled) {
      await patchDeck(id, { theme: deck.theme });
      setSaving(false);
      setHasUnsavedChanges(false);
      return;
    }
    const data = await apiSaveDeck(id, deck.slides, deck.theme);
    setSaving(false);
    if (data.success) setHasUnsavedChanges(false);
  }

  /**
   * Flush local draft state to the server, then publish a single slide's
   * draft. We flush first because in non-collab mode the slides blob lives
   * in React state until `saveDeck` runs — without a flush the server would
   * publish an outdated draft (or none at all for slides added in this
   * session). In collab mode the persister already keeps the server in
   * sync, but the flush is still cheap and idempotent.
   */
  async function handlePublishSlide(slideId: string) {
    if (!deck) return;
    setPublishingSlideId(slideId);
    setError('');
    try {
      // Flush slides to the server first.
      if (!collab.enabled) {
        const flush = await apiSaveDeck(id, deck.slides, deck.theme);
        if (!flush.success) {
          setError(flush.message || 'Failed to save draft before publish');
          return;
        }
      } else {
        // Even in collab, theme/etc. patches should land — and we want to
        // give the server persister a moment. Patching theme is cheap.
        await patchDeck(id, { theme: deck.theme });
      }
      const res = await publishSlideDraft(id, slideId);
      if (res.success && res.data) {
        setDeck(normalizeDeckBlockIds(res.data));
        setHasUnsavedChanges(false);
      } else {
        setError(res.message || 'Failed to publish slide');
      }
    } finally {
      setPublishingSlideId(null);
    }
  }

  /** Same as handlePublishSlide but for the whole deck. */
  async function handlePublishAll() {
    if (!deck) return;
    const draftCount = deck.slides.filter((s) => slideHasDraft(s)).length;
    if (draftCount === 0) return;
    if (!confirm(`Publish ${draftCount} draft slide${draftCount === 1 ? '' : 's'}? This will make all queued changes visible in the public deck.`)) return;
    setPublishingAll(true);
    setError('');
    try {
      if (!collab.enabled) {
        const flush = await apiSaveDeck(id, deck.slides, deck.theme);
        if (!flush.success) {
          setError(flush.message || 'Failed to save drafts before publish');
          return;
        }
      } else {
        await patchDeck(id, { theme: deck.theme });
      }
      const res = await publishAllSlideDrafts(id);
      if (res.success && res.data) {
        setDeck(normalizeDeckBlockIds(res.data));
        setHasUnsavedChanges(false);
      } else {
        setError(res.message || 'Failed to publish drafts');
      }
    } finally {
      setPublishingAll(false);
    }
  }

  function handleThemeUpdate(updates: Partial<PitchDeckTheme>) {
    if (!deck) return;
    setDeck({ ...deck, theme: { ...deck.theme, ...updates } });
    setHasUnsavedChanges(true);
  }

  async function togglePublish() {
    if (!deck) return;
    setPublishing(true);
    const newStatus = deck.status === 'published' ? 'draft' : 'published';
    const data = await patchDeck(id, { status: newStatus });
    if (data.success && data.data) setDeck(normalizeDeckBlockIds(data.data));
    setPublishing(false);
  }

  async function handleStartAbTest() {
    if (!deck) return;
    try {
      const res = await fetch('/api/portal/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'deck',
          targetId: deck.id,
          name: `A/B test — ${deck.title || 'Untitled'}`,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        router.push(`/portal/experiments/${json.data.id}`);
      } else {
        setError(json.error || 'Failed to create experiment');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create experiment');
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this pitch deck? This cannot be undone.')) return;
    await deleteDeck(id);
    router.push('/portal/tools/pitch-decks');
  }

  function addSlide() {
    if (!deck) return;
    // New slide is draft-only — live `blocks` empty, content lives in draft
    // until the user publishes.
    const initialBlocks: Block[] = [
      { id: `block-${Date.now()}-h`, type: 'heading', order: 1, content: 'New Slide', level: 2 as const, alignment: 'center' as const },
      { id: `block-${Date.now()}-t`, type: 'text', order: 2, content: 'Add your content here...', alignment: 'center' as const, size: 'base' as const },
    ];
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${Date.now()}`,
      label: 'New Slide',
      blocks: [],
      draft: {
        pendingCreate: true,
        blocks: initialBlocks,
        updatedAt: new Date().toISOString(),
      },
    };
    const newSlides = [...deck.slides, newSlide];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
  }

  async function addHtmlSlide(file: File) {
    if (!deck) return;
    const result = await uploadHtmlSlide(file);
    if (!result.success || !result.data) {
      alert(`Upload failed: ${result.error || 'unknown error'}`);
      return;
    }
    const ts = Date.now();
    const filenameNoExt = (result.data.filename || 'HTML Slide').replace(/\.[^.]+$/, '');
    const htmlBlocks: Block[] = [
      {
        id: `block-${ts}-html`,
        type: 'html-embed',
        order: 1,
        url: result.data.url,
        filename: result.data.filename,
        height: '100vh',
        width: 'full',
        sandbox: 'scripts',
        iframeTitle: filenameNoExt || 'Embedded HTML slide',
      },
    ];
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${ts}`,
      label: filenameNoExt || 'HTML Slide',
      blocks: [],
      draft: {
        pendingCreate: true,
        blocks: htmlBlocks,
        updatedAt: new Date().toISOString(),
      },
    };
    const newSlides = [...deck.slides, newSlide];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
  }

  function removeSlide(idx: number) {
    if (!deck || deck.slides.length <= 1) return;
    const target = deck.slides[idx];
    // Pending-create slides have no live state to preserve — drop immediately.
    if (slideIsPendingCreate(target)) {
      if (!confirm('Discard this draft slide?')) return;
      const newSlides = deck.slides.filter((_, i) => i !== idx);
      setDeck({ ...deck, slides: newSlides });
      if (activeSlide >= newSlides.length) setActiveSlide(newSlides.length - 1);
      setHasUnsavedChanges(true);
      return;
    }
    if (!confirm('Mark this slide for deletion? It stays visible in the public deck until you publish.')) return;
    const newSlides = [...deck.slides];
    newSlides[idx] = markSlidePendingDelete(target);
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  /** Clear a slide's draft (cancels a pending edit / pending delete). */
  function cancelSlideDraft(idx: number) {
    if (!deck) return;
    const target = deck.slides[idx];
    // pendingCreate has no live counterpart — clearing the draft means deleting
    // the slide entirely.
    if (slideIsPendingCreate(target)) {
      if (!confirm('Discard this draft slide?')) return;
      const newSlides = deck.slides.filter((_, i) => i !== idx);
      setDeck({ ...deck, slides: newSlides });
      if (activeSlide >= newSlides.length) setActiveSlide(Math.max(0, newSlides.length - 1));
      setHasUnsavedChanges(true);
      return;
    }
    const newSlides = [...deck.slides];
    newSlides[idx] = clearSlideDraft(target);
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  function duplicateSlide(idx: number) {
    if (!deck) return;
    const source = deck.slides[idx];
    // Duplicate from the draft view so unpublished edits carry over.
    const sourceView: PitchDeckSlideV2 = JSON.parse(JSON.stringify(getSlideView(source)));
    const ts = Date.now();
    const reidBlocks = sourceView.blocks.map(
      (b: PitchDeckSlideV2['blocks'][number], i: number) => ({ ...b, id: `block-${ts}-${i}` }),
    );
    const dup: PitchDeckSlideV2 = {
      ...sourceView,
      id: `slide-${ts}`,
      label: (source.label || source.id) + ' (copy)',
      // Live fields empty — the copy is a brand-new draft.
      blocks: [],
      customCss: undefined,
      pageSettings: undefined,
      notes: undefined,
      draft: {
        pendingCreate: true,
        blocks: reidBlocks,
        customCss: sourceView.customCss,
        pageSettings: sourceView.pageSettings,
        notes: sourceView.notes,
        updatedAt: new Date().toISOString(),
      },
    };
    const newSlides = [...deck.slides];
    newSlides.splice(idx + 1, 0, dup);
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(idx + 1);
    setHasUnsavedChanges(true);
  }

  function handleSlideDragEnd(event: DragEndEvent) {
    if (!deck) return;
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (overId.startsWith('drop-zone-')) {
      const targetGroup = overId === 'drop-zone-main' ? undefined : overId.replace('drop-zone-', '');
      const slideIdx = deck.slides.findIndex(s => s.id === activeId);
      if (slideIdx === -1) return;
      const newSlides = [...deck.slides];
      newSlides[slideIdx] = { ...newSlides[slideIdx], pathGroup: targetGroup };
      setDeck({ ...deck, slides: newSlides });
      setHasUnsavedChanges(true);
      return;
    }

    if (activeId === overId) return;
    const oldIndex = deck.slides.findIndex(s => s.id === activeId);
    const newIndex = deck.slides.findIndex(s => s.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const targetPathGroup = deck.slides[newIndex].pathGroup;
    const newSlides = arrayMove(deck.slides, oldIndex, newIndex);
    newSlides[newIndex] = { ...newSlides[newIndex], pathGroup: targetPathGroup };
    setDeck({ ...deck, slides: newSlides });
    if (activeSlide === oldIndex) setActiveSlide(newIndex);
    else if (activeSlide > Math.min(oldIndex, newIndex) && activeSlide <= Math.max(oldIndex, newIndex)) {
      setActiveSlide(oldIndex < newIndex ? activeSlide - 1 : activeSlide + 1);
    }
    setHasUnsavedChanges(true);
  }

  // ─── Title / slug inline edits ───────────────────────────────────────────────

  async function saveTitle() {
    if (!deck || !titleDraft.trim()) return;
    setEditingTitle(false);
    if (titleDraft.trim() === deck.title) return;
    const newTitle = titleDraft.trim();
    setDeck({ ...deck, title: newTitle });
    setSaving(true);
    await patchDeck(id, { title: newTitle });
    setSaving(false);
  }

  async function saveSlug() {
    if (!deck) return;
    const raw = slugDraft.trim();
    const normalized = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!normalized) {
      setSlugError('Slug must contain at least one letter or number.');
      return;
    }
    if (normalized === deck.slug) {
      setEditingSlug(false);
      setSlugError(null);
      return;
    }
    setSaving(true);
    const data = await patchDeck(id, { slug: normalized });
    setSaving(false);
    if (!data.success) {
      setSlugError(data.message || 'Failed to update slug.');
      return;
    }
    setDeck({ ...deck, slug: data.data?.slug ?? normalized });
    setEditingSlug(false);
    setSlugError(null);
  }

  // ─── Versions ────────────────────────────────────────────────────────────────

  async function loadVersions() {
    const data = await listVersions(id);
    if (data.success && data.data) setVersions(data.data);
  }

  async function saveCheckpoint() {
    if (!deck) return;
    setSavingVersion(true);
    const data = await saveVersionCheckpoint(id, `Manual save — ${deck.slides.length} slides`);
    setSavingVersion(false);
    if (data.success && data.data) setVersions(prev => [data.data!, ...prev]);
  }

  async function handleRestoreVersion(versionId: number) {
    if (!confirm('Restore this version? Your current slides will be saved as a checkpoint first.')) return;
    setRestoring(true);
    const data = await restoreVersion(id, versionId);
    setRestoring(false);
    if (data.success && data.data) {
      setDeck(normalizeDeckBlockIds(data.data));
      setActiveSlide(0);
      setShowHistory(false);
      loadVersions();
    } else {
      setError(data.message || 'Failed to restore');
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-3xl text-primary">autorenew</span>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <span className="material-icons text-5xl text-muted-foreground/50">error_outline</span>
        <h2 className="text-lg font-semibold mt-4">Deck not found</h2>
        <Link href="/portal/tools/pitch-decks" className="text-primary text-sm mt-2 inline-block">
          Back to Pitch Decks
        </Link>
      </div>
    );
  }

  const currentSlide = deck.slides[activeSlide];
  const draftSlideCount = deck.slides.filter((s) => slideHasDraft(s)).length;
  const pathGroups = getPathGroups();
  const pathGroupSlideCounts = pathGroups.reduce<Record<string, number>>((acc, pg) => {
    acc[pg] = deck.slides.filter(s => s.pathGroup === pg).length;
    return acc;
  }, {});

  // The slide as the editor should display it — draft overlay wins over live.
  // SlideSettingsPanel + SlideContentEditor both read from `currentSlideView`.
  const currentSlideView = getSlideView(currentSlide);

  // Slide-level settings JSX — used as the noSelectionPanel inside VisualEditorShell
  // and appended to survey-slide previews so tenants can theme any slide identically.
  // `pageSettings` / `customCss` updates route into `draft.*`; `label` is sidebar-
  // only and stays on the live field so reorder/duplicate UIs reflect it instantly.
  const slideSettingsPanel = (
    <SlideSettingsPanel
      slide={currentSlideView}
      theme={deck.theme}
      onChange={(updates) => {
        const newSlides = [...deck.slides];
        const target = newSlides[activeSlide];
        const draftPatch: Parameters<typeof mergeSlideDraft>[1] = {};
        if (updates.pageSettings !== undefined) draftPatch.pageSettings = updates.pageSettings;
        if (updates.customCss !== undefined) draftPatch.customCss = updates.customCss;
        let nextSlide = target;
        if (Object.keys(draftPatch).length > 0) {
          nextSlide = mergeSlideDraft(nextSlide, draftPatch);
        }
        // Non-draftable fields (e.g. label) merge onto the live slide.
        const liveOnly: Partial<PitchDeckSlideV2> = { ...updates };
        delete liveOnly.pageSettings;
        delete liveOnly.customCss;
        // Note: `notes` is draftable but SlideSettingsPanel never emits it.
        if (Object.keys(liveOnly).length > 0) {
          nextSlide = { ...nextSlide, ...liveOnly };
        }
        newSlides[activeSlide] = nextSlide;
        setDeck({ ...deck, slides: newSlides });
        setHasUnsavedChanges(true);
      }}
    />
  );

  return (
    <div className="w-full space-y-4 px-2">
      <div className="flex items-center justify-end pt-1 -mb-2">
        <DeckPresenceBar onJumpToSlide={setActiveSlide} />
      </div>
      <EditorHeader
        deck={deck}
        saving={saving}
        publishing={publishing}
        hasUnsavedChanges={hasUnsavedChanges}
        editingTitle={editingTitle}
        titleDraft={titleDraft}
        editingSlug={editingSlug}
        slugDraft={slugDraft}
        slugError={slugError}
        onStartEditTitle={() => { setEditingTitle(true); setTitleDraft(deck.title); }}
        onTitleDraftChange={setTitleDraft}
        onSaveTitle={saveTitle}
        onCancelEditTitle={() => setEditingTitle(false)}
        onStartEditSlug={() => { setEditingSlug(true); setSlugDraft(deck.slug); setSlugError(null); }}
        onSlugDraftChange={(v) => { setSlugDraft(v); setSlugError(null); }}
        onSaveSlug={saveSlug}
        onCancelEditSlug={() => { setEditingSlug(false); setSlugError(null); }}
        onToggleTheme={() => setShowTheme(!showTheme)}
        onToggleRegenerate={() => setShowRegenerate(!showRegenerate)}
        onToggleHistory={() => { const next = !showHistory; setShowHistory(next); if (next) loadVersions(); }}
        onToggleSeo={() => setShowSeo(!showSeo)}
        onSave={saveDeck}
        onTogglePublish={togglePublish}
        draftSlideCount={draftSlideCount}
        publishingAllDrafts={publishingAll}
        onPublishAllDrafts={handlePublishAll}
        onPresent={() => {
          window.open(
            `/portal/tools/pitch-decks/${id}/presenter`,
            'presenter-view',
            'width=1200,height=800,menubar=no,toolbar=no,location=no'
          );
        }}
        onDelete={handleDelete}
        onStartAbTest={handleStartAbTest}
        presenterUrl={`/portal/tools/pitch-decks/${id}/presenter`}
      />

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons">error</span>
          {error}
          <button onClick={() => setError('')} className="ml-auto"><span className="material-icons text-base">close</span></button>
        </div>
      )}

      {showTheme && (
        <ThemePanel
          theme={deck.theme}
          brandingProfileId={deck.brandingProfileId}
          deckId={deck.id}
          onClose={() => setShowTheme(false)}
          onUpdateTheme={handleThemeUpdate}
          onUpdateBrandingProfileId={(profileId) => setDeck((prev) => prev ? { ...prev, brandingProfileId: profileId } : prev)}
        />
      )}

      {showRegenerate && (
        <RegenerateModal
          prompt={regeneratePrompt}
          regenerating={regenerating}
          error={error}
          onPromptChange={setRegeneratePrompt}
          onClose={() => setShowRegenerate(false)}
          onSubmit={handleRegenerate}
        />
      )}

      {showHistory && (
        <HistoryPanel
          versions={versions}
          savingVersion={savingVersion}
          restoring={restoring}
          slideCount={deck.slides.length}
          onClose={() => setShowHistory(false)}
          onSaveCheckpoint={saveCheckpoint}
          onRestore={handleRestoreVersion}
        />
      )}

      {showSeo && (
        <SeoPanel
          deck={deck}
          onUpdateDeck={(updates) => setDeck((prev) => prev ? { ...prev, ...updates } : prev)}
          onClose={() => setShowSeo(false)}
        />
      )}

      <input
        ref={htmlSlideFileInputRef}
        type="file"
        accept=".html,.htm,.xhtml,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) addHtmlSlide(file);
          e.target.value = '';
        }}
      />

      {deck.slides.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
          <span className="material-icons text-5xl text-muted-foreground/50">slideshow</span>
          <h2 className="text-lg font-semibold text-foreground">No slides yet</h2>
          <p className="text-muted-foreground text-sm">
            Use the Regenerate button above to generate slides with AI, or add slides manually.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowRegenerate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            >
              <span className="material-icons text-base">auto_awesome</span>
              Generate with AI
            </button>
            <button
              onClick={addSlide}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors"
            >
              <span className="material-icons text-base">add</span>
              Add Blank Slide
            </button>
            <button
              onClick={() => htmlSlideFileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors"
            >
              <span className="material-icons text-base">upload_file</span>
              Upload HTML Slide
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="flex flex-col gap-2">
            <SlideList
              slides={deck.slides}
              activeSlide={activeSlide}
              selectedSlides={selectedSlides}
              collapsed={slidePanelCollapsed}
              pathGroups={pathGroups}
              hasSurveyService={hasSurveyService}
              showSurveyPicker={showSurveyPicker}
              surveyListLoaded={surveyListLoaded}
              surveyList={surveyList}
              getSurveyFieldCount={getSurveyFieldCount}
              onSetActive={setActiveSlide}
              onSetCollapsed={setSlidePanelCollapsed}
              onOpenBoardView={() => setBoardView(true)}
              onAddSlide={addSlide}
              onUploadHtmlSlide={() => htmlSlideFileInputRef.current?.click()}
              onRenameSlide={(idx, label) => {
                const newSlides = [...deck.slides];
                newSlides[idx] = { ...newSlides[idx], label };
                setDeck({ ...deck, slides: newSlides });
                setHasUnsavedChanges(true);
              }}
              onDuplicateSlide={duplicateSlide}
              onRemoveSlide={removeSlide}
              onToggleSelect={toggleSlideSelection}
              onPublishSlide={(idx) => handlePublishSlide(deck.slides[idx].id)}
              onCancelSlideDraft={cancelSlideDraft}
              publishingSlideId={publishingSlideId}
              onAddDecisionSlide={addDecisionSlide}
              onAddPathGroup={addPathGroup}
              onAddSlideToPathGroup={addSlideToPathGroup}
              onToggleSurveyPicker={() => setShowSurveyPicker(!showSurveyPicker)}
              onAddSurveySlide={addSurveySlide}
              onDragEnd={handleSlideDragEnd}
            />
            <DeckSlideThumbnailIndicators
              slideCount={deck.slides.length}
              onJumpToSlide={setActiveSlide}
            />
          </div>

          {selectedSlides.size > 0 && (
            <BatchEditBar
              selectedCount={selectedSlides.size}
              totalSlides={deck.slides.length}
              prompt={batchPrompt}
              generating={batchGenerating}
              onPromptChange={setBatchPrompt}
              onSelectAll={() => {
                const all = new Set(deck.slides.map((_, i) => i));
                setSelectedSlides(selectedSlides.size === deck.slides.length ? new Set() : all);
              }}
              onClear={() => setSelectedSlides(new Set())}
              onSubmit={handleBatchEdit}
            />
          )}

          {/* Slide preview + editor */}
          <div className="flex-1 min-w-0 space-y-4 relative" ref={slideCanvasRef}>
            <DeckSlideCursors
              activeSlideIndex={activeSlide}
              trackedRef={slideCanvasRef}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Slide {activeSlide + 1} of {deck.slides.length} · {currentSlide.label || 'Untitled'}
              </span>
              {slideIsPendingCreate(currentSlide) && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                  <span className="material-icons text-[12px]">fiber_new</span>
                  New (draft)
                </span>
              )}
              {slideIsPendingDelete(currentSlide) && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-semibold">
                  <span className="material-icons text-[12px]">delete_sweep</span>
                  Pending delete
                </span>
              )}
              {slideHasDraft(currentSlide) && !slideIsPendingCreate(currentSlide) && !slideIsPendingDelete(currentSlide) && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                  <span className="material-icons text-[12px]">edit_note</span>
                  Draft
                </span>
              )}
              {slideHasDraft(currentSlide) && (
                <>
                  <button
                    onClick={() => handlePublishSlide(currentSlide.id)}
                    disabled={publishingSlideId === currentSlide.id}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                    title={
                      slideIsPendingDelete(currentSlide)
                        ? 'Publish — removes this slide from the live deck'
                        : 'Publish this slide\'s draft to the live deck'
                    }
                  >
                    <span className={`material-icons text-sm ${publishingSlideId === currentSlide.id ? 'animate-spin' : ''}`}>
                      {publishingSlideId === currentSlide.id ? 'autorenew' : 'publish'}
                    </span>
                    {publishingSlideId === currentSlide.id ? 'Publishing...' : 'Publish slide'}
                  </button>
                  <button
                    onClick={() => cancelSlideDraft(activeSlide)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title={slideIsPendingDelete(currentSlide) ? 'Cancel deletion' : 'Discard draft changes'}
                  >
                    <span className="material-icons text-sm">undo</span>
                    {slideIsPendingDelete(currentSlide) ? 'Cancel deletion' : 'Discard draft'}
                  </button>
                </>
              )}
              <div className="ml-auto flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-border overflow-hidden">
                  {(['desktop', 'tablet', 'mobile'] as const).map((vp) => (
                    <button
                      key={vp}
                      onClick={() => setIframeViewport(vp)}
                      className={`p-1.5 transition-colors ${
                        iframeViewport === vp ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                      title={vp.charAt(0).toUpperCase() + vp.slice(1)}
                    >
                      <span className="material-icons text-sm">
                        {vp === 'desktop' ? 'computer' : vp === 'tablet' ? 'tablet' : 'phone_iphone'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setEditorMode('preview')}
                    className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                      editorMode === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="material-icons text-sm">visibility</span>
                    Preview
                  </button>
                  <button
                    onClick={() => setEditorMode('edit')}
                    className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                      editorMode === 'edit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="material-icons text-sm">edit</span>
                    Edit Blocks
                  </button>
                </div>
              </div>
            </div>

            {currentSlide.surveySlide ? (
              editingSurveyFieldId ? (
                <SurveyFieldEditorView
                  slide={currentSlideView}
                  theme={deck.theme}
                  fields={getSurveyFields(currentSlide.surveyId)}
                  editingFieldId={editingSurveyFieldId}
                  onSelectFieldId={setEditingSurveyFieldId}
                  onUpdateField={(updates) =>
                    currentSlide.surveyId && updateSurveyField(currentSlide.surveyId, editingSurveyFieldId, updates)
                  }
                  slideSettingsPanel={slideSettingsPanel}
                />
              ) : (
                <SurveySlideQuestionList
                  slide={currentSlideView}
                  fields={getSurveyFields(currentSlide.surveyId)}
                  onSelectField={setEditingSurveyFieldId}
                  onRemoveSlide={() => removeSlide(activeSlide)}
                />
              )
            ) : currentSlide.decisionSlide ? (
              <DecisionSlideEditor
                slide={currentSlideView}
                slideIndex={activeSlide}
                pathGroupSlideCounts={pathGroupSlideCounts}
                onUpdateLabel={(label) => {
                  const newSlides = [...deck.slides];
                  newSlides[activeSlide] = { ...newSlides[activeSlide], label };
                  setDeck({ ...deck, slides: newSlides });
                  setHasUnsavedChanges(true);
                }}
                onAddOption={() => addDecisionOption(activeSlide)}
                onUpdateOption={(optionId, updates) => updateDecisionOption(activeSlide, optionId, updates)}
                onRemoveOption={(optionId) => removeDecisionOption(activeSlide, optionId)}
                onUpdateCover={(updates) => updateDecisionCover(activeSlide, updates)}
                onRemoveSlide={() => removeSlide(activeSlide)}
              />
            ) : (
              <SlideContentEditor
                deckId={id}
                slide={currentSlideView}
                slideIndex={activeSlide}
                theme={deck.theme}
                brandingProfileId={deck.brandingProfileId}
                brandDefaults={brandDefaults}
                iframeViewport={iframeViewport}
                editorMode={editorMode}
                editorLeftCollapsed={editorLeftCollapsed}
                editorRightCollapsed={editorRightCollapsed}
                slidePrompt={slidePrompt}
                slideGenerating={slideGenerating}
                noSelectionPanel={slideSettingsPanel}
                onSlidePromptChange={setSlidePrompt}
                onSubmitSlidePrompt={handleSlideEdit}
                onChangeNotes={(notes) => {
                  const newSlides = [...deck.slides];
                  newSlides[activeSlide] = mergeSlideDraft(newSlides[activeSlide], { notes });
                  setDeck({ ...deck, slides: newSlides });
                  setHasUnsavedChanges(true);
                }}
                onBlocksChange={(blocks) => handleSlideBlocksChange(activeSlide, blocks)}
                onSetEditorLeftCollapsed={setEditorLeftCollapsed}
                onSetEditorRightCollapsed={setEditorRightCollapsed}
              />
            )}
          </div>
        </div>
      )}

      {boardView && (
        <BoardView
          slides={deck.slides}
          activeSlide={activeSlide}
          theme={deck.theme}
          pathGroups={pathGroups}
          boardColumns={boardColumns}
          getSurveyFieldCount={getSurveyFieldCount}
          onSetColumns={setBoardColumns}
          onClose={() => setBoardView(false)}
          onSelectSlide={(idx) => { setActiveSlide(idx); setBoardView(false); }}
          onRenameSlide={(idx, label) => {
            const newSlides = [...deck.slides];
            newSlides[idx] = { ...newSlides[idx], label };
            setDeck({ ...deck, slides: newSlides });
            setHasUnsavedChanges(true);
          }}
          onRenamePathGroup={renamePathGroup}
          onAddSlide={addSlide}
          onUploadHtmlSlide={() => htmlSlideFileInputRef.current?.click()}
          onDragEnd={handleSlideDragEnd}
        />
      )}
    </div>
  );
}
