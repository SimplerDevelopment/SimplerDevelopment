'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { use } from 'react';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import type { Block, BlockType } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { findBlockById, removeBlockById } from '@/lib/utils/blockHelpers';
import { applyBrandDefaults, type BrandDefaultsContext } from '@/lib/branding/block-defaults';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';
import { SurveySlideRenderer, type SurveySlideField } from '@/components/pitch-deck/SurveySlideRenderer';
import MediaPicker from '@/components/admin/MediaPicker';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';

interface Deck {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  slides: PitchDeckSlideV2[];
  theme: PitchDeckTheme;
  sourceUrl: string | null;
  brandingProfileId: number | null;
  updatedAt: string;
}

function isColorDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

// Older AI-generated decks wrote block payloads without `id` fields. The
// visual editor selects blocks by id, so id-less blocks are unclickable and
// dnd-kit logs sortable-id warnings. Walk the block tree on load and assign
// stable ids to anything missing one.
function backfillBlockIds<T extends { id?: string; type?: string }>(blocks: T[] | undefined, seedPath = 'b'): T[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b, i) => {
    const next: Record<string, unknown> = { ...b };
    if (!next.id) next.id = `${seedPath}-${i}-${Math.random().toString(36).slice(2, 8)}`;
    const nodeId = String(next.id);
    if (Array.isArray((next as { columns?: unknown }).columns)) {
      next.columns = ((next as { columns: Array<{ blocks?: unknown[] }> }).columns).map((c, ci) => ({
        ...c,
        blocks: backfillBlockIds((c.blocks as T[]) ?? [], `${nodeId}-c${ci}`),
      }));
    }
    if (Array.isArray((next as { tabs?: unknown }).tabs)) {
      next.tabs = ((next as { tabs: Array<{ blocks?: unknown[] }> }).tabs).map((t, ti) => ({
        ...t,
        blocks: backfillBlockIds((t.blocks as T[]) ?? [], `${nodeId}-t${ti}`),
      }));
    }
    if (next.type === 'section' && Array.isArray((next as { blocks?: unknown }).blocks)) {
      next.blocks = backfillBlockIds((next as { blocks: T[] }).blocks, `${nodeId}-s`);
    }
    return next as T;
  });
}

function normalizeDeckBlockIds<D extends { slides?: Array<{ blocks?: unknown[] }> }>(deck: D): D {
  if (!deck?.slides) return deck;
  return {
    ...deck,
    slides: deck.slides.map((s, si) => ({
      ...s,
      blocks: backfillBlockIds((s.blocks as Array<{ id?: string; type?: string }>) ?? [], `slide${si}`),
    })),
  } as D;
}


/** Extract a display title from a slide's blocks */
function getSlideTitle(slide: PitchDeckSlideV2): string {
  if (slide.label) return slide.label;
  for (const block of slide.blocks) {
    if (block.type === 'hero' && 'title' in block) return (block as { title: string }).title;
    if (block.type === 'heading' && 'content' in block) return (block as { content: string }).content;
    if (block.type === 'cta' && 'title' in block) return (block as { title: string }).title;
  }
  return 'Untitled';
}

/** Get an icon for a slide based on its first block */
function getSlideIcon(slide: PitchDeckSlideV2): string {
  if (slide.decisionSlide) return 'fork_right';
  if (slide.surveySlide) return 'assignment';
  if (!slide.blocks.length) return 'edit_note';
  const first = slide.blocks[0].type;
  const iconMap: Record<string, string> = {
    hero: 'title', heading: 'notes', stats: 'bar_chart', 'card-grid': 'grid_view',
    testimonial: 'format_quote', cta: 'campaign', image: 'image', text: 'article',
    columns: 'view_column', 'services-grid': 'apps', 'featured-content': 'featured_play_list',
  };
  return iconMap[first] || 'edit_note';
}

export default function PitchDeckEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slidePrompt, setSlidePrompt] = useState('');
  const [slideGenerating, setSlideGenerating] = useState(false);
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<{ id: number; label: string | null; trigger: string; slideCount: number; createdAt: string }[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('edit');
  const [slidePanelCollapsed, setSlidePanelCollapsed] = useState(false);
  const [iframeViewport, setIframeViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [editorLeftCollapsed, setEditorLeftCollapsed] = useState(false);
  const [editorRightCollapsed, setEditorRightCollapsed] = useState(false);
  const [boardView, setBoardView] = useState(false);
  const [boardColumns, setBoardColumns] = useState(4);
  const [aiHistory, setAiHistory] = useState<Record<number, Array<{ role: 'user' | 'assistant'; content: string }>>>({});
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Survey integration state
  const [hasSurveyService, setHasSurveyService] = useState(false);
  const [surveyList, setSurveyList] = useState<{ id: number; title: string; status: string; fields: unknown[] }[]>([]);
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);
  const [surveyListLoaded, setSurveyListLoaded] = useState(false);
  const [editingSurveyFieldId, setEditingSurveyFieldId] = useState<string | null>(null);

  // Clear survey field editing when switching slides
  useEffect(() => { setEditingSurveyFieldId(null); }, [activeSlide]);

  // Check if surveys service is available via the nav services endpoint
  useEffect(() => {
    fetch('/api/portal/services/nav')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.success) return;
        const hasSurveys = data.data.some((s: { category: string; subscribed: boolean }) =>
          (s.category === 'surveys' || s.category === 'bundle') && s.subscribed
        );
        if (hasSurveys) {
          setHasSurveyService(true);
          // Now fetch the actual survey list
          fetch('/api/portal/surveys')
            .then(r => r.ok ? r.json() : null)
            .then(sData => {
              if (sData?.success) {
                setSurveyList(sData.data.map((s: { id: number; title: string; status: string; fields: unknown[] }) => ({
                  id: s.id, title: s.title, status: s.status, fields: s.fields,
                })));
              }
              setSurveyListLoaded(true);
            })
            .catch(() => setSurveyListLoaded(true));
        }
      })
      .catch(() => {});
  }, []);

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

  /** Get the icon for a survey field type */
  function getSurveyFieldIcon(type: string): string {
    const map: Record<string, string> = {
      text: 'short_text', textarea: 'notes', email: 'email', phone: 'phone',
      url: 'link', number: 'tag', date: 'calendar_today', select: 'arrow_drop_down_circle',
      radio: 'radio_button_checked', checkbox: 'check_box', toggle: 'toggle_on',
      rating: 'star', slider: 'tune', heading: 'title',
    };
    return map[type] || 'help_outline';
  }

  /** Generate default blocks for a survey question field */
  function getDefaultSurveyFieldBlocks(field: { id: string; type: string; label: string; required: boolean; options?: string[]; min?: number; max?: number; step?: number; placeholder?: string }): Block[] {
    const uid = () => `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return [
      { id: uid(), type: 'heading' as BlockType, order: 1, content: field.label + (field.required ? ' *' : ''), level: 2, required: true } as Block,
      { id: uid(), type: 'survey-input' as BlockType, order: 2, fieldType: field.type, fieldLabel: field.label, placeholder: field.placeholder, options: field.options, min: field.min, max: field.max, step: field.step, required: true } as Block,
    ];
  }

  /** Get blocks for a survey sub-slide, falling back to defaults */
  function getSurveyFieldBlocksForEditing(slideIdx: number, fieldId: string): Block[] {
    if (!deck) return [];
    const slide = deck.slides[slideIdx];
    if (slide.surveyFieldBlocks?.[fieldId]) return slide.surveyFieldBlocks[fieldId];
    const fields = getSurveyFields(slide.surveyId);
    const field = fields.find(f => f.id === fieldId);
    if (!field) return [];
    return getDefaultSurveyFieldBlocks(field);
  }

  /** Update blocks for a specific survey sub-slide */
  function updateSurveyFieldBlocks(slideIdx: number, fieldId: string, blocks: Block[]) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    const slide = { ...newSlides[slideIdx] };
    slide.surveyFieldBlocks = { ...(slide.surveyFieldBlocks || {}), [fieldId]: blocks };
    newSlides[slideIdx] = slide;
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  /** Hidden file input for "Upload HTML Slide" — triggered from each add-slide affordance */
  const htmlSlideFileInputRef = useRef<HTMLInputElement>(null);

  /** Update a survey field property and persist to the survey record (source of truth) */
  const surveyFieldSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateSurveyField(surveyId: number, fieldId: string, updates: Record<string, unknown>) {
    // Update local state immediately
    setSurveyList(prev => prev.map(s => {
      if (s.id !== surveyId) return s;
      const fields = (s.fields as Record<string, unknown>[]).map(f => {
        if ((f as { id: string }).id !== fieldId) return f;
        return { ...f, ...updates };
      });
      return { ...s, fields };
    }));

    // Debounced save to API
    if (surveyFieldSaveTimerRef.current) clearTimeout(surveyFieldSaveTimerRef.current);
    surveyFieldSaveTimerRef.current = setTimeout(() => {
      const survey = surveyList.find(s => s.id === surveyId);
      if (!survey) return;
      // Build the updated fields array from current local state (which was already updated above)
      const updatedFields = (survey.fields as Record<string, unknown>[]).map(f => {
        if ((f as { id: string }).id !== fieldId) return f;
        return { ...f, ...updates };
      });
      fetch(`/api/portal/surveys/${surveyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: updatedFields }),
      }).catch(() => {});
    }, 800);
  }

  // ─── Path Groups & Decision Slides ───────────────────────────────────────────

  function getPathGroups(): string[] {
    if (!deck) return [];
    const groups = new Set<string>();
    for (const slide of deck.slides) {
      if (slide.pathGroup) groups.add(slide.pathGroup);
    }
    // Also include any groups referenced in decision options that don't have slides yet
    for (const slide of deck.slides) {
      if (slide.decisionOptions) {
        for (const opt of slide.decisionOptions) {
          groups.add(opt.pathGroup);
        }
      }
    }
    return Array.from(groups).sort();
  }

  function addPathGroup() {
    const name = prompt('Path group name (e.g. "pricing", "case-studies"):');
    if (!name?.trim() || !deck) return;
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug) return;
    // Add a blank slide to this path group
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${Date.now()}`,
      label: 'New Slide',
      blocks: [
        { id: `block-${Date.now()}-h`, type: 'heading', order: 1, content: 'New Slide', level: 2 as const, alignment: 'center' as const },
      ],
      pathGroup: slug,
    };
    const newSlides = [...deck.slides, newSlide];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
  }

  function addSlideToPathGroup(pathGroup: string) {
    if (!deck) return;
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${Date.now()}`,
      label: 'New Slide',
      blocks: [
        { id: `block-${Date.now()}-h`, type: 'heading', order: 1, content: 'New Slide', level: 2 as const, alignment: 'center' as const },
      ],
      pathGroup,
    };
    // Insert after the last slide of this path group
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
    // Insert before the last main-sequence slide
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

  // Close board view on ESC
  useEffect(() => {
    if (!boardView) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setBoardView(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [boardView]);

  const fetchDeck = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/tools/pitch-decks/${id}`);
      if (!res.ok) {
        setError(`Failed to load deck (${res.status})`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) setDeck(normalizeDeckBlockIds(data.data));
      else setError(data.message || 'Failed to load deck');
    } catch {
      setError('Failed to connect to server. Please refresh the page.');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchDeck(); }, [fetchDeck]);

  // Brand defaults — fetched once per deck so newly-added blocks pre-fill from
  // the client's messaging (tagline, value prop, etc.) and tag colors with sentinels.
  const [brandDefaults, setBrandDefaults] = useState<BrandDefaultsContext | null>(null);
  useEffect(() => {
    if (!deck) return;
    const profileQs = deck.brandingProfileId ? `?profileId=${deck.brandingProfileId}` : '';
    fetch(`/api/portal/branding/defaults${profileQs}`)
      .then(r => r.json())
      .then(d => { if (d.success && d.data) setBrandDefaults(d.data); })
      .catch(() => {});
  }, [deck]);

useEffect(() => {
    if (searchParams.get('genError') === '1') {
      setError('AI generation failed. You can try regenerating the deck.');
      setShowRegenerate(true);
    }
  }, [searchParams]);

  async function handleSlideEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!slidePrompt.trim() || !deck) return;

    const userPrompt = slidePrompt.trim();
    setSlideGenerating(true);
    setError('');

    const slideHistory = aiHistory[activeSlide] || [];

    const res = await fetch(`/api/portal/tools/pitch-decks/${id}/slides/${activeSlide}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: userPrompt,
        history: slideHistory,
      }),
    });
    const data = await res.json();
    setSlideGenerating(false);
    if (data.success) {
      setDeck(normalizeDeckBlockIds(data.data));
      setSlidePrompt('');
      setHasUnsavedChanges(false);
      // Append to conversation history for multi-turn refinement
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
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}/slides/batch-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: batchPrompt.trim(),
        slideIndices: Array.from(selectedSlides).sort((a, b) => a - b),
      }),
    });
    const data = await res.json();
    setBatchGenerating(false);
    if (data.success) {
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
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!regeneratePrompt.trim() || !deck) return;

    setRegenerating(true);
    setError('');
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: regeneratePrompt.trim(), websiteUrl: deck.sourceUrl }),
    });
    const data = await res.json();
    setRegenerating(false);
    if (data.success) {
      setDeck(normalizeDeckBlockIds(data.data));
      setRegeneratePrompt('');
      setShowRegenerate(false);
      setActiveSlide(0);
      setHasUnsavedChanges(false);
    } else {
      setError(data.message || 'Failed to regenerate');
    }
  }

  function handleSlideBlocksChange(slideIdx: number, newBlocks: Block[]) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    newSlides[slideIdx] = { ...newSlides[slideIdx], blocks: newBlocks };
    setDeck({ ...deck, slides: newSlides });
    setHasUnsavedChanges(true);
  }

  async function saveDeck() {
    if (!deck) return;
    setSaving(true);
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: deck.slides, theme: deck.theme }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setHasUnsavedChanges(false);
    }
  }

  function handleThemeUpdate(updates: Partial<PitchDeckTheme>) {
    if (!deck) return;
    const newTheme = { ...deck.theme, ...updates };
    setDeck({ ...deck, theme: newTheme });
    setHasUnsavedChanges(true);
  }

  async function togglePublish() {
    if (!deck) return;
    setPublishing(true);
    const newStatus = deck.status === 'published' ? 'draft' : 'published';
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.success) setDeck(normalizeDeckBlockIds(data.data));
    setPublishing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this pitch deck? This cannot be undone.')) return;
    await fetch(`/api/portal/tools/pitch-decks/${id}`, { method: 'DELETE' });
    router.push('/portal/tools/pitch-decks');
  }

  function addSlide() {
    if (!deck) return;
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${Date.now()}`,
      label: 'New Slide',
      blocks: [
        { id: `block-${Date.now()}-h`, type: 'heading', order: 1, content: 'New Slide', level: 2 as const, alignment: 'center' as const },
        { id: `block-${Date.now()}-t`, type: 'text', order: 2, content: 'Add your content here...', alignment: 'center' as const, size: 'base' as const },
      ],
    };
    const newSlides = [...deck.slides, newSlide];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
  }

  async function addHtmlSlide(file: File) {
    if (!deck) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/portal/html-uploads', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok || !json.success) {
      alert(`Upload failed: ${json.error || 'unknown error'}`);
      return;
    }
    const ts = Date.now();
    const filenameNoExt = (json.data.filename || 'HTML Slide').replace(/\.[^.]+$/, '');
    const newSlide: PitchDeckSlideV2 = {
      id: `slide-${ts}`,
      label: filenameNoExt || 'HTML Slide',
      blocks: [
        {
          id: `block-${ts}-html`,
          type: 'html-embed',
          order: 1,
          url: json.data.url,
          filename: json.data.filename,
          height: '100vh',
          width: 'full',
          sandbox: 'scripts',
          iframeTitle: filenameNoExt || 'Embedded HTML slide',
        },
      ],
    };
    const newSlides = [...deck.slides, newSlide];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
  }

  function removeSlide(idx: number) {
    if (!deck || deck.slides.length <= 1) return;
    if (!confirm('Remove this slide?')) return;
    const newSlides = deck.slides.filter((_, i) => i !== idx);
    setDeck({ ...deck, slides: newSlides });
    if (activeSlide >= newSlides.length) setActiveSlide(newSlides.length - 1);
    setHasUnsavedChanges(true);
  }

  function duplicateSlide(idx: number) {
    if (!deck) return;
    const source = deck.slides[idx];
    const dup: PitchDeckSlideV2 = {
      ...JSON.parse(JSON.stringify(source)),
      id: `slide-${Date.now()}`,
      label: (source.label || getSlideTitle(source)) + ' (copy)',
    };
    // Regenerate block IDs to avoid collisions
    dup.blocks = dup.blocks.map((b: PitchDeckSlideV2['blocks'][number], i: number) => ({
      ...b,
      id: `block-${Date.now()}-${i}`,
    }));
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

    // Check if dropped onto a path group droppable zone (id = "drop-zone-{pg}" or "drop-zone-main")
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

    // Inherit the pathGroup of the target slide
    const targetPathGroup = deck.slides[newIndex].pathGroup;
    const newSlides = arrayMove(deck.slides, oldIndex, newIndex);
    // Update the moved slide's pathGroup to match where it landed
    const movedIdx = newIndex;
    newSlides[movedIdx] = { ...newSlides[movedIdx], pathGroup: targetPathGroup };
    setDeck({ ...deck, slides: newSlides });
    if (activeSlide === oldIndex) setActiveSlide(newIndex);
    else if (activeSlide > Math.min(oldIndex, newIndex) && activeSlide <= Math.max(oldIndex, newIndex)) {
      setActiveSlide(oldIndex < newIndex ? activeSlide - 1 : activeSlide + 1);
    }
    setHasUnsavedChanges(true);
  }

  const slideDndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function saveTitle() {
    if (!deck || !titleDraft.trim()) return;
    setEditingTitle(false);
    if (titleDraft.trim() === deck.title) return;
    const newTitle = titleDraft.trim();
    setDeck({ ...deck, title: newTitle });
    setSaving(true);
    await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
    setSaving(false);
  }

  async function saveSlug() {
    if (!deck) return;
    const raw = slugDraft.trim();
    // Same normalization as the server — preview feedback, server is source of truth.
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
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: normalized }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok || !data.success) {
      setSlugError(data.message || 'Failed to update slug.');
      return;
    }
    setDeck({ ...deck, slug: data.data?.slug ?? normalized });
    setEditingSlug(false);
    setSlugError(null);
  }

  async function loadVersions() {
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}/versions`);
    const data = await res.json();
    if (data.success) {
      setVersions(data.data);
      setHistoryLoaded(true);
    }
  }

  async function saveCheckpoint() {
    if (!deck) return;
    setSavingVersion(true);
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: `Manual save — ${deck.slides.length} slides` }),
    });
    const data = await res.json();
    setSavingVersion(false);
    if (data.success) {
      setVersions(prev => [data.data, ...prev]);
    }
  }

  async function restoreVersion(versionId: number) {
    if (!confirm('Restore this version? Your current slides will be saved as a checkpoint first.')) return;
    setRestoring(true);
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}/versions/${versionId}/restore`, {
      method: 'POST',
    });
    const data = await res.json();
    setRestoring(false);
    if (data.success) {
      setDeck(normalizeDeckBlockIds(data.data));
      setActiveSlide(0);
      setShowHistory(false);
      loadVersions();
    } else {
      setError(data.message || 'Failed to restore');
    }
  }

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

  // Shared slide-level settings panel JSX. Used both as the noSelectionPanel
  // for regular block slides inside VisualEditorShell, and appended to the
  // right-hand panel on survey slide previews so tenants can set the same
  // background / text color / label on a survey slide that they can on any
  // other slide. Closes over deck / setDeck / activeSlide / setHasUnsavedChanges
  // and re-evaluates on every render, matching the previous inline behavior.
  const slideSettingsPanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="material-icons text-base text-muted-foreground">tune</span>
        <span className="text-sm font-semibold text-foreground">Slide Settings</span>
      </div>

      {/* Background Color */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Background Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={currentSlide.pageSettings?.backgroundColor || deck.theme.backgroundColor}
            onChange={(e) => {
              const newSlides = [...deck.slides];
              newSlides[activeSlide] = {
                ...newSlides[activeSlide],
                pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundColor: e.target.value },
              };
              setDeck({ ...deck, slides: newSlides });
              setHasUnsavedChanges(true);
            }}
            className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={currentSlide.pageSettings?.backgroundColor || ''}
            onChange={(e) => {
              const newSlides = [...deck.slides];
              newSlides[activeSlide] = {
                ...newSlides[activeSlide],
                pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundColor: e.target.value },
              };
              setDeck({ ...deck, slides: newSlides });
              setHasUnsavedChanges(true);
            }}
            placeholder={deck.theme.backgroundColor}
            className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {currentSlide.pageSettings?.backgroundColor && (
            <button
              onClick={() => {
                const newSlides = [...deck.slides];
                const ps = { ...newSlides[activeSlide].pageSettings };
                delete ps.backgroundColor;
                newSlides[activeSlide] = { ...newSlides[activeSlide], pageSettings: ps };
                setDeck({ ...deck, slides: newSlides });
                setHasUnsavedChanges(true);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Reset to theme default"
            >
              <span className="material-icons text-sm">restart_alt</span>
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Overrides the deck theme for this slide</p>
      </div>

      {/* Background Image */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Background Image</span>
        <MediaPicker
          value={currentSlide.pageSettings?.backgroundImage || ''}
          onChange={(v) => {
            const newSlides = [...deck.slides];
            newSlides[activeSlide] = {
              ...newSlides[activeSlide],
              pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundImage: v },
            };
            setDeck({ ...deck, slides: newSlides });
            setHasUnsavedChanges(true);
          }}
          mimeTypeFilter="image"
          label=""
          apiEndpoint="/api/media"
        />
      </div>

      {/* Background Image Controls (when image is set) */}
      {currentSlide.pageSettings?.backgroundImage && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Size</label>
              <select
                value={['cover', 'contain', 'auto'].includes(currentSlide.pageSettings?.backgroundSize || 'cover') ? (currentSlide.pageSettings?.backgroundSize || 'cover') : 'custom'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    const newSlides = [...deck.slides];
                    newSlides[activeSlide] = {
                      ...newSlides[activeSlide],
                      pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundSize: '200px' as 'cover' },
                    };
                    setDeck({ ...deck, slides: newSlides });
                    setHasUnsavedChanges(true);
                    return;
                  }
                  const newSlides = [...deck.slides];
                  newSlides[activeSlide] = {
                    ...newSlides[activeSlide],
                    pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundSize: val as 'cover' | 'contain' | 'auto' },
                  };
                  setDeck({ ...deck, slides: newSlides });
                  setHasUnsavedChanges(true);
                }}
                className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="auto">Auto</option>
                <option value="custom">Custom</option>
              </select>
              {!['cover', 'contain', 'auto'].includes(currentSlide.pageSettings?.backgroundSize || 'cover') && (
                <input
                  type="text"
                  value={currentSlide.pageSettings?.backgroundSize || ''}
                  onChange={(e) => {
                    const newSlides = [...deck.slides];
                    newSlides[activeSlide] = {
                      ...newSlides[activeSlide],
                      pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundSize: e.target.value as 'cover' },
                    };
                    setDeck({ ...deck, slides: newSlides });
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="e.g. 200px, 50%, 100px auto"
                  className="mt-1 w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Repeat</label>
              <select
                value={currentSlide.pageSettings?.backgroundRepeat || 'no-repeat'}
                onChange={(e) => {
                  const newSlides = [...deck.slides];
                  newSlides[activeSlide] = {
                    ...newSlides[activeSlide],
                    pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundRepeat: e.target.value as 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y' },
                  };
                  setDeck({ ...deck, slides: newSlides });
                  setHasUnsavedChanges(true);
                }}
                className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="no-repeat">No Repeat</option>
                <option value="repeat">Repeat</option>
                <option value="repeat-x">Repeat X</option>
                <option value="repeat-y">Repeat Y</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Position</label>
            <select
              value={currentSlide.pageSettings?.backgroundPosition || 'center'}
              onChange={(e) => {
                const newSlides = [...deck.slides];
                newSlides[activeSlide] = {
                  ...newSlides[activeSlide],
                  pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundPosition: e.target.value },
                };
                setDeck({ ...deck, slides: newSlides });
                setHasUnsavedChanges(true);
              }}
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="center">Center</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="top left">Top Left</option>
              <option value="top right">Top Right</option>
              <option value="bottom left">Bottom Left</option>
              <option value="bottom right">Bottom Right</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Opacity: {Math.round((currentSlide.pageSettings?.backgroundOpacity ?? 1) * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={currentSlide.pageSettings?.backgroundOpacity ?? 1}
              onChange={(e) => {
                const newSlides = [...deck.slides];
                newSlides[activeSlide] = {
                  ...newSlides[activeSlide],
                  pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundOpacity: parseFloat(e.target.value) },
                };
                setDeck({ ...deck, slides: newSlides });
                setHasUnsavedChanges(true);
              }}
              className="w-full accent-primary"
            />
          </div>
        </>
      )}

      {/* Background Video */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Background Video</span>
        <MediaPicker
          value={currentSlide.pageSettings?.backgroundVideo || ''}
          onChange={(v) => {
            const newSlides = [...deck.slides];
            newSlides[activeSlide] = {
              ...newSlides[activeSlide],
              pageSettings: { ...newSlides[activeSlide].pageSettings, backgroundVideo: v },
            };
            setDeck({ ...deck, slides: newSlides });
            setHasUnsavedChanges(true);
          }}
          mimeTypeFilter="video"
          label=""
          apiEndpoint="/api/media"
        />
      </div>

      {/* Text Color */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Text Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={currentSlide.pageSettings?.color || deck.theme.textColor}
            onChange={(e) => {
              const newSlides = [...deck.slides];
              newSlides[activeSlide] = {
                ...newSlides[activeSlide],
                pageSettings: { ...newSlides[activeSlide].pageSettings, color: e.target.value },
              };
              setDeck({ ...deck, slides: newSlides });
              setHasUnsavedChanges(true);
            }}
            className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={currentSlide.pageSettings?.color || ''}
            onChange={(e) => {
              const newSlides = [...deck.slides];
              newSlides[activeSlide] = {
                ...newSlides[activeSlide],
                pageSettings: { ...newSlides[activeSlide].pageSettings, color: e.target.value },
              };
              setDeck({ ...deck, slides: newSlides });
              setHasUnsavedChanges(true);
            }}
            placeholder={deck.theme.textColor}
            className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {currentSlide.pageSettings?.color && (
            <button
              onClick={() => {
                const newSlides = [...deck.slides];
                const ps = { ...newSlides[activeSlide].pageSettings };
                delete ps.color;
                newSlides[activeSlide] = { ...newSlides[activeSlide], pageSettings: ps };
                setDeck({ ...deck, slides: newSlides });
                setHasUnsavedChanges(true);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Reset to theme default"
            >
              <span className="material-icons text-sm">restart_alt</span>
            </button>
          )}
        </div>
      </div>

      {/* Slide label */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Slide Label</label>
        <input
          type="text"
          value={currentSlide.label || ''}
          onChange={(e) => {
            const newSlides = [...deck.slides];
            newSlides[activeSlide] = { ...newSlides[activeSlide], label: e.target.value };
            setDeck({ ...deck, slides: newSlides });
            setHasUnsavedChanges(true);
          }}
          className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="e.g. Cover, About, Pricing..."
        />
      </div>

      {/* Per-slide Custom CSS */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Custom CSS <span className="opacity-60">(active only while this slide is in view)</span>
        </label>
        <textarea
          value={currentSlide.customCss || ''}
          onChange={(e) => {
            const newSlides = [...deck.slides];
            newSlides[activeSlide] = { ...newSlides[activeSlide], customCss: e.target.value };
            setDeck({ ...deck, slides: newSlides });
            setHasUnsavedChanges(true);
          }}
          rows={10}
          spellCheck={false}
          className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder={`/* Target rendered blocks via [data-block-id="..."] */\n[data-block-id="cover-rule"] hr { background: var(--rust); height: 3px; }`}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Injected unscoped while this slide is active. Block wrappers expose <code>data-block-id</code> and <code>data-block-type</code> for targeting. The slide stage carries <code>data-slide-id</code>.
        </p>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-4 px-2">
      {/* Header */}
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
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="text-xl font-bold text-foreground bg-transparent border-b-2 border-primary outline-none w-full"
              />
            ) : (
              <h1
                className="text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors"
                onClick={() => { setEditingTitle(true); setTitleDraft(deck.title); }}
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
                    onChange={(e) => { setSlugDraft(e.target.value); setSlugError(null); }}
                    onBlur={saveSlug}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveSlug();
                      if (e.key === 'Escape') { setEditingSlug(false); setSlugError(null); }
                    }}
                    className="bg-transparent border-b border-primary outline-none text-foreground min-w-[8rem]"
                    placeholder="deck-slug"
                  />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditingSlug(true); setSlugDraft(deck.slug); setSlugError(null); }}
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
            onClick={() => setShowTheme(!showTheme)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <span className="material-icons text-base">palette</span>
            Theme
          </button>
          <button
            onClick={() => setShowRegenerate(!showRegenerate)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <span className="material-icons text-base">auto_awesome</span>
            Regenerate
          </button>
          <button
            onClick={() => { const next = !showHistory; setShowHistory(next); if (next) loadVersions(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <span className="material-icons text-base">history</span>
            History
          </button>
          <button
            onClick={saveDeck}
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
            onClick={() => {
              window.open(
                `/portal/tools/pitch-decks/${id}/presenter`,
                'presenter-view',
                'width=1200,height=800,menubar=no,toolbar=no,location=no'
              );
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Open presenter view"
          >
            <span className="material-icons text-base">co_present</span>
            Present
          </button>
          <button
            onClick={togglePublish}
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
            onClick={handleDelete}
            className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
            title="Delete deck"
          >
            <span className="material-icons text-base">delete</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons">error</span>
          {error}
          <button onClick={() => setError('')} className="ml-auto"><span className="material-icons text-base">close</span></button>
        </div>
      )}

      {/* Theme editor */}
      {showTheme && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Theme Settings</h3>
            <button onClick={() => setShowTheme(false)} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          {/* Branding profile selector */}
          <div className="pb-2 border-b border-border">
            <BrandingProfileSelector
              value={deck.brandingProfileId ?? null}
              onChange={async (profileId) => {
                if (profileId) {
                  // Load the profile and apply as theme
                  const res = await fetch(`/api/portal/branding/profiles/${profileId}`);
                  const json = await res.json();
                  if (json.success) {
                    const p = json.data;
                    handleThemeUpdate({
                      primaryColor: p.primaryColor || deck.theme.primaryColor,
                      accentColor: p.accentColor || deck.theme.accentColor,
                      backgroundColor: p.backgroundColor && isColorDark(p.backgroundColor) ? p.backgroundColor : deck.theme.backgroundColor,
                      textColor: p.backgroundColor && isColorDark(p.backgroundColor) ? (p.textColor || '#f8fafc') : deck.theme.textColor,
                      headingFont: p.headingFont || deck.theme.headingFont,
                      bodyFont: p.bodyFont || deck.theme.bodyFont,
                    });
                  }
                }
                setDeck((prev) => prev ? { ...prev, brandingProfileId: profileId } : prev);
                // Persist the profile assignment
                await fetch(`/api/portal/tools/pitch-decks/${deck.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ brandingProfileId: profileId }),
                });
              }}
              allowNone
              noneLabel="Custom Theme"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['primaryColor', 'accentColor', 'backgroundColor', 'textColor'] as const).map((key) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1 capitalize">
                  {key.replace('Color', ' Color')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={deck.theme[key]}
                    onChange={(e) => handleThemeUpdate({ [key]: e.target.value })}
                    className="w-8 h-8 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={deck.theme[key]}
                    onChange={(e) => handleThemeUpdate({ [key]: e.target.value })}
                    className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono"
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Survey-slide button colors. Optional — empty falls back to theme defaults. */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Survey Slide Buttons <span className="opacity-60">(optional — leave blank to use theme defaults)</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { key: 'nextButtonColor' as const, label: 'Next Button BG', fallback: deck.theme.accentColor },
                { key: 'nextButtonTextColor' as const, label: 'Next Button Text', fallback: deck.theme.backgroundColor },
                { key: 'backButtonColor' as const, label: 'Back Button BG', fallback: deck.theme.textColor },
                { key: 'backButtonTextColor' as const, label: 'Back Button Text', fallback: deck.theme.textColor },
              ]).map(({ key, label, fallback }) => {
                const value = deck.theme[key];
                return (
                  <div key={key}>
                    <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={value || fallback}
                        onChange={(e) => handleThemeUpdate({ [key]: e.target.value })}
                        className="w-8 h-8 rounded border border-border cursor-pointer"
                      />
                      <input
                        type="text"
                        value={value || ''}
                        placeholder={fallback}
                        onChange={(e) => handleThemeUpdate({ [key]: e.target.value || undefined })}
                        className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deck.theme.showSlideNumber !== false}
                onChange={(e) => handleThemeUpdate({ showSlideNumber: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              Show slide number overlay
              <span className="text-xs text-muted-foreground ml-1">
                (auto-hidden on full-bleed HTML slides)
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Heading Font</label>
              <GoogleFontPicker
                value={deck.theme.headingFont}
                onChange={(font) => handleThemeUpdate({ headingFont: font })}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
              <GoogleFontPicker
                value={deck.theme.bodyFont}
                onChange={(font) => handleThemeUpdate({ bodyFont: font })}
              />
            </div>
          </div>
          {/* Deck-global custom CSS */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Deck CSS <span className="opacity-60">(injected once, applies to all slides)</span>
            </label>
            <textarea
              value={deck.theme.customCss || ''}
              onChange={(e) => handleThemeUpdate({ customCss: e.target.value })}
              rows={8}
              spellCheck={false}
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={`/* Define CSS vars, resets, and deck-wide patterns */\n.deck-root { --brand: #005652; }\n.deck-root .slide-stage p { margin: 0; }`}
            />
          </div>
        </div>
      )}

      {/* Regenerate panel */}
      {showRegenerate && (
        <form onSubmit={handleRegenerate} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Regenerate All Slides</h3>
            <button type="button" onClick={() => setShowRegenerate(false)} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          <textarea
            value={regeneratePrompt}
            onChange={(e) => setRegeneratePrompt(e.target.value)}
            placeholder="Describe what the new deck should focus on..."
            rows={3}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={regenerating}
          />
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-xs">
              <span className="material-icons text-sm">error</span>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={regenerating || !regeneratePrompt.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {regenerating ? (
              <><span className="material-icons animate-spin text-base">autorenew</span>Generating...</>
            ) : (
              <><span className="material-icons text-base">auto_awesome</span>Regenerate Deck</>
            )}
          </button>
        </form>
      )}

      {/* History panel */}
      {showHistory && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Version History</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={saveCheckpoint}
                disabled={savingVersion || deck.slides.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
              >
                {savingVersion ? (
                  <span className="material-icons animate-spin text-xs">autorenew</span>
                ) : (
                  <span className="material-icons text-xs">save</span>
                )}
                Save Checkpoint
              </button>
              <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                <span className="material-icons text-base">close</span>
              </button>
            </div>
          </div>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No versions yet. Versions are auto-saved before each AI edit.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {versions.map((v) => {
                const triggerLabel: Record<string, string> = {
                  manual: 'Checkpoint',
                  ai_generate: 'Before AI generate',
                  ai_regenerate: 'Before AI regenerate',
                  ai_slide_edit: 'Before AI slide edit',
                };
                const triggerIcon: Record<string, string> = {
                  manual: 'save',
                  ai_generate: 'auto_awesome',
                  ai_regenerate: 'auto_awesome',
                  ai_slide_edit: 'edit',
                };
                return (
                  <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors group">
                    <span className="material-icons text-base text-muted-foreground">{triggerIcon[v.trigger] || 'history'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {v.label || triggerLabel[v.trigger] || v.trigger}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.slideCount} slides &middot; {new Date(v.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreVersion(v.id)}
                      disabled={restoring}
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-50"
                    >
                      <span className="material-icons text-xs">restore</span>
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hidden input shared by every "Upload HTML Slide" trigger */}
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

      {/* Main editor area */}
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
          {/* Slide list sidebar — collapsible */}
          <div className={`shrink-0 transition-all duration-200 ${slidePanelCollapsed ? 'w-12' : 'w-56'}`}>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {slidePanelCollapsed ? (
                <>
                  <button
                    onClick={() => setSlidePanelCollapsed(false)}
                    className="w-full p-2 border-b border-border text-muted-foreground hover:text-foreground transition-colors"
                    title="Expand slides"
                  >
                    <span className="material-icons text-base">chevron_right</span>
                  </button>
                  <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
                    {deck.slides.map((slide, idx) => (
                      <button
                        key={slide.id}
                        onClick={() => setActiveSlide(idx)}
                        className={`w-full py-2 text-center text-xs font-mono border-b border-border/50 last:border-0 transition-colors ${
                          idx === activeSlide
                            ? 'bg-primary/10 text-primary font-bold'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                        title={getSlideTitle(slide)}
                      >
                        {idx + 1}
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
                        onClick={() => setBoardView(true)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Board view"
                      >
                        <span className="material-icons text-base">grid_view</span>
                      </button>
                      {hasSurveyService && (
                        <button
                          onClick={() => setShowSurveyPicker(!showSurveyPicker)}
                          className="text-primary hover:text-primary/80"
                          title="Insert survey as slides"
                        >
                          <span className="material-icons text-lg">assignment</span>
                        </button>
                      )}
                      <button onClick={addSlide} className="text-primary hover:text-primary/80" title="Add slide">
                        <span className="material-icons text-lg">add_circle</span>
                      </button>
                      <button
                        onClick={() => htmlSlideFileInputRef.current?.click()}
                        className="text-primary hover:text-primary/80"
                        title="Upload HTML slide"
                      >
                        <span className="material-icons text-lg">upload_file</span>
                      </button>
                      <button
                        onClick={() => setSlidePanelCollapsed(true)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Collapse slides"
                      >
                        <span className="material-icons text-base">chevron_left</span>
                      </button>
                    </div>
                  </div>
                  {/* Survey picker dropdown */}
                  {showSurveyPicker && (
                    <div className="border-b border-border p-3 space-y-2 bg-accent/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">Insert Survey</span>
                        <button onClick={() => setShowSurveyPicker(false)} className="text-muted-foreground hover:text-foreground">
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
                              onClick={() => addSurveySlide(s.id, s.title)}
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
                    <DndContext sensors={slideDndSensors} collisionDetection={closestCenter} onDragEnd={handleSlideDragEnd}>
                      <SortableContext items={deck.slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        {/* Main sequence slides */}
                        <PathGroupDropZone id="drop-zone-main" label="Main Sequence">
                          {deck.slides.map((slide, idx) => {
                            if (slide.pathGroup) return null;
                            return (
                              <SortableSlideItem
                                key={slide.id}
                                slide={slide}
                                index={idx}
                                isActive={idx === activeSlide}
                                isSelected={selectedSlides.has(idx)}
                                onClick={() => setActiveSlide(idx)}
                                onRename={(newLabel) => {
                                  if (!deck) return;
                                  const newSlides = [...deck.slides];
                                  newSlides[idx] = { ...newSlides[idx], label: newLabel };
                                  setDeck({ ...deck, slides: newSlides });
                                  setHasUnsavedChanges(true);
                                }}
                                onDuplicate={() => duplicateSlide(idx)}
                                onRemove={() => removeSlide(idx)}
                                onToggleSelect={() => toggleSlideSelection(idx)}
                                canRemove={deck.slides.length > 1}
                                surveyFieldCount={slide.surveySlide ? getSurveyFieldCount(slide.surveyId) : undefined}
                              />
                            );
                          })}
                        </PathGroupDropZone>

                        {/* Add decision / path buttons */}
                        <div className="border-t border-border p-2 space-y-1">
                          <button
                            onClick={addDecisionSlide}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground hover:text-foreground"
                          >
                            <span className="material-icons text-sm text-amber-500">fork_right</span>
                            Add Decision Slide
                          </button>
                          <button
                            onClick={addPathGroup}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground hover:text-foreground"
                          >
                            <span className="material-icons text-sm text-blue-500">route</span>
                            Add Path Group
                          </button>
                        </div>

                        {/* Path group sections */}
                        {getPathGroups().map(pg => {
                          const pgSlides = deck.slides.map((s, i) => ({ slide: s, idx: i })).filter(({ slide }) => slide.pathGroup === pg);
                          return (
                            <PathGroupDropZone key={pg} id={`drop-zone-${pg}`} label={pg}>
                              <div className="px-3 py-2 flex items-center justify-between bg-accent/20">
                                <div className="flex items-center gap-1.5">
                                  <span className="material-icons text-sm text-blue-500">route</span>
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{pg}</span>
                                </div>
                                <button
                                  onClick={() => addSlideToPathGroup(pg)}
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
                                  onClick={() => setActiveSlide(idx)}
                                  onRename={(newLabel) => {
                                    if (!deck) return;
                                    const newSlides = [...deck.slides];
                                    newSlides[idx] = { ...newSlides[idx], label: newLabel };
                                    setDeck({ ...deck, slides: newSlides });
                                    setHasUnsavedChanges(true);
                                  }}
                                  onDuplicate={() => duplicateSlide(idx)}
                                  onRemove={() => removeSlide(idx)}
                                  onToggleSelect={() => toggleSlideSelection(idx)}
                                  canRemove={deck.slides.length > 1}
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

          {/* Batch edit bar — shown when slides are selected */}
          {selectedSlides.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-lg px-6 py-3">
              <form onSubmit={handleBatchEdit} className="max-w-4xl mx-auto flex items-center gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="material-icons text-primary text-lg">checklist</span>
                  <span className="text-sm font-medium text-foreground">{selectedSlides.size} slide{selectedSlides.size > 1 ? 's' : ''}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const all = new Set(deck.slides.map((_, i) => i));
                      setSelectedSlides(selectedSlides.size === deck.slides.length ? new Set() : all);
                    }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    {selectedSlides.size === deck.slides.length ? 'Deselect all' : 'Select all'}
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSlides(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex-1 relative">
                  <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">auto_awesome</span>
                  <input
                    type="text"
                    value={batchPrompt}
                    onChange={(e) => setBatchPrompt(e.target.value)}
                    placeholder="Apply to selected slides... e.g. 'Make the tone more formal' or 'Add a statistic to each'"
                    className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    disabled={batchGenerating}
                  />
                </div>
                <button
                  type="submit"
                  disabled={batchGenerating || !batchPrompt.trim()}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                >
                  {batchGenerating ? (
                    <><span className="material-icons animate-spin text-base">autorenew</span>Editing {selectedSlides.size}...</>
                  ) : (
                    <><span className="material-icons text-base">edit_note</span>Edit {selectedSlides.size} Slides</>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Slide preview + editor */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Slide {activeSlide + 1} of {deck.slides.length} · {currentSlide.label || 'Untitled'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {/* Viewport toggle — always visible */}
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

                {/* Preview / Edit toggle */}
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

            {/* Survey slide info panel */}
            {currentSlide.surveySlide ? (
              editingSurveyFieldId ? (
                /* ── Survey sub-slide editor ── */
                (() => {
                  const surveyFields = getSurveyFields(currentSlide.surveyId);
                  const editingField = surveyFields.find(f => f.id === editingSurveyFieldId);
                  return (
                    <>
                      {/* Back button + field selector + prev/next */}
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={() => setEditingSurveyFieldId(null)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0"
                        >
                          <span className="material-icons text-sm">arrow_back</span>
                          Back
                        </button>
                        <button
                          onClick={() => {
                            const idx = surveyFields.findIndex(f => f.id === editingSurveyFieldId);
                            if (idx > 0) setEditingSurveyFieldId(surveyFields[idx - 1].id);
                          }}
                          disabled={surveyFields.findIndex(f => f.id === editingSurveyFieldId) <= 0}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                          title="Previous question"
                        >
                          <span className="material-icons text-sm">chevron_left</span>
                        </button>
                        <div className="relative flex-1 min-w-0">
                          <select
                            value={editingSurveyFieldId || ''}
                            onChange={(e) => setEditingSurveyFieldId(e.target.value)}
                            className="w-full appearance-none bg-accent/50 border border-border rounded-lg pl-7 pr-7 py-1 text-xs text-foreground cursor-pointer hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 truncate"
                          >
                            {surveyFields.map((f, i) => (
                              <option key={f.id} value={f.id}>
                                {i + 1}. {f.label} ({f.type})
                              </option>
                            ))}
                          </select>
                          {editingField && (
                            <span className="material-icons text-xs text-emerald-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              {getSurveyFieldIcon(editingField.type)}
                            </span>
                          )}
                          <span className="material-icons text-xs text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                            unfold_more
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const idx = surveyFields.findIndex(f => f.id === editingSurveyFieldId);
                            if (idx < surveyFields.length - 1) setEditingSurveyFieldId(surveyFields[idx + 1].id);
                          }}
                          disabled={surveyFields.findIndex(f => f.id === editingSurveyFieldId) >= surveyFields.length - 1}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                          title="Next question"
                        >
                          <span className="material-icons text-sm">chevron_right</span>
                        </button>
                      </div>
                      {/* Live-parity survey field preview.
                          Renders the exact same SurveySlideRenderer the public
                          tenant-subdomain view uses, so the editor and the
                          live deck never drift. Field properties are edited
                          in the right-hand SurveyFieldPropertiesPanel, which
                          writes back to the survey record (source of truth). */}
                      <div className="flex gap-4" style={{ minHeight: '600px' }}>
                        <div
                          className="flex-1 rounded-xl border border-border relative"
                          style={{
                            backgroundColor: currentSlide.pageSettings?.backgroundColor || deck.theme.backgroundColor,
                            color: deck.theme.textColor,
                            fontFamily: `"${deck.theme.bodyFont}", sans-serif`,
                            minHeight: 'calc(100vh - 220px)',
                          }}
                        >
                          <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
                          {editingField ? (
                            <SurveySlideRenderer
                              field={editingField as unknown as SurveySlideField}
                              answers={{}}
                              onAnswer={() => {}}
                              theme={deck.theme}
                              surveyTitle={currentSlide.label || 'Survey'}
                              onNext={() => {
                                const idx = surveyFields.findIndex(f => f.id === editingSurveyFieldId);
                                if (idx < surveyFields.length - 1) setEditingSurveyFieldId(surveyFields[idx + 1].id);
                              }}
                              onBack={() => {
                                const idx = surveyFields.findIndex(f => f.id === editingSurveyFieldId);
                                if (idx > 0) setEditingSurveyFieldId(surveyFields[idx - 1].id);
                              }}
                              showBack
                              isLastQuestion={false}
                              isSubmitting={false}
                              containerClassName="min-h-[calc(100vh-220px)] px-8 py-12"
                            />
                          ) : null}
                        </div>
                        <div className="w-80 shrink-0 bg-card border border-border rounded-xl p-4 overflow-y-auto space-y-6" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                          {editingField && currentSlide.surveyId ? (
                            <SurveyFieldPropertiesPanel
                              field={editingField as SurveyFieldForPanel}
                              surveyId={currentSlide.surveyId}
                              onUpdate={(updates) => updateSurveyField(currentSlide.surveyId!, editingSurveyFieldId, updates)}
                            />
                          ) : null}
                          {/* Slide-level settings (background, text color, label)
                              — same panel shown on block slides so tenants can
                              theme a survey slide just like any other. */}
                          {slideSettingsPanel}
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                /* ── Survey question list ── */
                <div className="bg-card border border-border rounded-xl p-6 space-y-4" style={{ minHeight: '600px' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <span className="material-icons text-xl text-emerald-500">assignment</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-foreground">{currentSlide.label}</h3>
                      <p className="text-xs text-muted-foreground">Click a question to customize its slide layout</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/portal/surveys/${currentSlide.surveyId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <span className="material-icons text-sm">open_in_new</span>
                        Edit Survey
                      </a>
                      <button
                        onClick={() => removeSlide(activeSlide)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <span className="material-icons text-sm">delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Question list */}
                  <div className="space-y-1">
                    {getSurveyFields(currentSlide.surveyId).map((field, fieldIdx) => {
                      const hasCustomBlocks = !!(currentSlide.surveyFieldBlocks?.[field.id]);
                      return (
                        <button
                          key={field.id}
                          onClick={() => setEditingSurveyFieldId(field.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-accent transition-colors group/field border border-transparent hover:border-border"
                        >
                          <span className="text-xs font-mono text-muted-foreground/50 w-5 text-right shrink-0">{fieldIdx + 1}</span>
                          <span className="material-icons text-base text-emerald-500 shrink-0">{getSurveyFieldIcon(field.type)}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-foreground truncate block">{field.label}</span>
                            <span className="text-[10px] text-muted-foreground">{field.type}{field.required ? ' (required)' : ''}</span>
                          </div>
                          {hasCustomBlocks && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">customized</span>
                          )}
                          <span className="material-icons text-sm text-muted-foreground/50 group-hover/field:text-foreground transition-colors shrink-0">chevron_right</span>
                        </button>
                      );
                    })}
                    {getSurveyFields(currentSlide.surveyId).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <span className="material-icons text-2xl mb-2 block">quiz</span>
                        No questions found. Add questions in the survey editor.
                      </div>
                    )}
                  </div>

                  <div className="bg-accent/30 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <span className="material-icons text-sm text-emerald-500 mt-0.5">info</span>
                      <p className="text-xs text-muted-foreground">
                        Each question expands into its own full-screen slide during the presentation.
                        Customize the layout by clicking a question above. Required blocks (heading, input) cannot be deleted.
                      </p>
                    </div>
                  </div>

                  {/* Recommendation lives on the survey now (not the deck slide).
                      Surface a hint + deep link so deck authors don't go hunting. */}
                  <div className="bg-accent/30 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <span className="material-icons text-sm text-primary mt-0.5">recommend</span>
                      <div className="flex-1 text-xs text-muted-foreground">
                        Need to edit the dynamic result slide after the survey?
                        <a
                          href={`/portal/surveys/${currentSlide.surveyId}#recommendation`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1 inline-flex items-center gap-0.5"
                        >
                          Edit recommendation in the survey
                          <span className="material-icons text-xs">open_in_new</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : currentSlide.decisionSlide ? (
              <div className="bg-card border border-border rounded-xl p-8 space-y-6" style={{ minHeight: '600px' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <span className="material-icons text-2xl text-amber-500">fork_right</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Decision Slide</h3>
                    <p className="text-sm text-muted-foreground">Viewers must choose a path to continue</p>
                  </div>
                </div>

                {/* Slide label */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Slide Title</label>
                  <input
                    type="text"
                    value={currentSlide.label || ''}
                    onChange={(e) => {
                      const newSlides = [...deck.slides];
                      newSlides[activeSlide] = { ...newSlides[activeSlide], label: e.target.value };
                      setDeck({ ...deck, slides: newSlides });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="e.g. Choose your path"
                  />
                </div>

                {/* Decision options */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Options</label>
                    <button
                      onClick={() => addDecisionOption(activeSlide)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                    >
                      <span className="material-icons text-sm">add</span>
                      Add Option
                    </button>
                  </div>
                  {(currentSlide.decisionOptions || []).map((opt) => (
                    <div key={opt.id} className="bg-accent/30 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => updateDecisionOption(activeSlide, opt.id, { label: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Option label"
                          />
                          <input
                            type="text"
                            value={opt.description || ''}
                            onChange={(e) => updateDecisionOption(activeSlide, opt.id, { description: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Description (optional)"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={opt.icon || ''}
                              onChange={(e) => updateDecisionOption(activeSlide, opt.id, { icon: e.target.value })}
                              className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              placeholder="Material icon name"
                            />
                            <input
                              type="text"
                              value={opt.pathGroup}
                              onChange={(e) => updateDecisionOption(activeSlide, opt.id, { pathGroup: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                              className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                              placeholder="path-group-name"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeDecisionOption(activeSlide, opt.id)}
                          className="p-1 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                        >
                          <span className="material-icons text-base">close</span>
                        </button>
                      </div>
                      {/* Show path group slide count */}
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="material-icons text-xs text-blue-500">route</span>
                        {deck.slides.filter(s => s.pathGroup === opt.pathGroup).length} slide(s) in &quot;{opt.pathGroup}&quot;
                      </div>
                    </div>
                  ))}
                </div>

                {/* Cover-style content (optional) — when any field is set, the
                    decision slide renders the TF1-v8 two-column intro layout
                    instead of the default centered grid. */}
                <details className="border-t border-border pt-4 group" open={Boolean(currentSlide.decisionCover && Object.values(currentSlide.decisionCover).some(Boolean))}>
                  <summary className="cursor-pointer flex items-center justify-between text-sm font-medium text-foreground hover:text-primary transition-colors">
                    <span className="inline-flex items-center gap-2">
                      <span className="material-icons text-base text-primary">view_column</span>
                      Cover-style content (optional)
                    </span>
                    <span className="material-icons text-base text-muted-foreground group-open:rotate-180 transition-transform">expand_more</span>
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Renders a two-column intro layout (logo, eyebrow, headline + light punchline, body, image) with the decision options as CTA cards. Leave all fields blank to use the default centered grid.
                  </p>
                  <div className="mt-4 space-y-3">
                    {/* Wordmark + Eyebrow */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Wordmark</label>
                        <input
                          type="text"
                          value={currentSlide.decisionCover?.wordmark || ''}
                          onChange={(e) => updateDecisionCover(activeSlide, { wordmark: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="CY STRATEGIES"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Eyebrow</label>
                        <input
                          type="text"
                          value={currentSlide.decisionCover?.eyebrow || ''}
                          onChange={(e) => updateDecisionCover(activeSlide, { eyebrow: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="MARKETING STRATEGY CONSULTANT"
                        />
                      </div>
                    </div>

                    {/* Headline + Punchline */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Headline (bold)</label>
                      <input
                        type="text"
                        value={currentSlide.decisionCover?.headline || ''}
                        onChange={(e) => updateDecisionCover(activeSlide, { headline: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="Most companies don't have a marketing problem."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Punchline (light)</label>
                      <input
                        type="text"
                        value={currentSlide.decisionCover?.punchline || ''}
                        onChange={(e) => updateDecisionCover(activeSlide, { punchline: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="They have a decision problem."
                      />
                    </div>

                    {/* Intro + Body */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Intro line</label>
                      <input
                        type="text"
                        value={currentSlide.decisionCover?.intro || ''}
                        onChange={(e) => updateDecisionCover(activeSlide, { intro: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="Hi, I'm Cody."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Body</label>
                      <textarea
                        value={currentSlide.decisionCover?.body || ''}
                        onChange={(e) => updateDecisionCover(activeSlide, { body: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                        placeholder="I figure out what's actually driving growth, what isn't, and what to do about it."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        About <span className="text-muted-foreground/70">(blank lines split paragraphs)</span>
                      </label>
                      <textarea
                        value={currentSlide.decisionCover?.about || ''}
                        onChange={(e) => updateDecisionCover(activeSlide, { about: e.target.value })}
                        rows={4}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                        placeholder={"Most companies don't need more marketing.\n\nThis is a quick look at how I think."}
                      />
                    </div>

                    {/* Image */}
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Image URL (right column)</label>
                        <input
                          type="text"
                          value={currentSlide.decisionCover?.image || ''}
                          onChange={(e) => updateDecisionCover(activeSlide, { image: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
                          placeholder="https://… (headshot)"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Alt</label>
                        <input
                          type="text"
                          value={currentSlide.decisionCover?.imageAlt || ''}
                          onChange={(e) => updateDecisionCover(activeSlide, { imageAlt: e.target.value })}
                          className="w-32 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="Headshot"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Logo URL (above wordmark)</label>
                      <input
                        type="text"
                        value={currentSlide.decisionCover?.logo || ''}
                        onChange={(e) => updateDecisionCover(activeSlide, { logo: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
                        placeholder="https://… (optional)"
                      />
                    </div>

                    {/* Color overrides */}
                    <div className="grid grid-cols-5 gap-2 pt-2 border-t border-border/60">
                      {([
                        ['backgroundColor', 'BG'],
                        ['textColor', 'Text'],
                        ['mutedColor', 'Muted'],
                        ['softColor', 'Soft'],
                        ['accentColor', 'Accent'],
                      ] as const).map(([key, label]) => (
                        <div key={key}>
                          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">{label}</label>
                          <input
                            type="text"
                            value={currentSlide.decisionCover?.[key] || ''}
                            onChange={(e) => updateDecisionCover(activeSlide, { [key]: e.target.value || undefined })}
                            className="w-full px-2 py-1.5 bg-background border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                            placeholder="#005652"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </details>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => removeSlide(activeSlide)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <span className="material-icons text-base">delete</span>
                    Remove
                  </button>
                </div>
              </div>
            ) : (
            <>
            {/* AI slide editing prompt */}
            <form onSubmit={handleSlideEdit} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">auto_awesome</span>
                  <input
                    type="text"
                    value={slidePrompt}
                    onChange={(e) => setSlidePrompt(e.target.value)}
                    placeholder="Edit this slide with AI... e.g. 'Make it more concise' or 'Add competitor comparison'"
                    className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    disabled={slideGenerating}
                  />
                </div>
                <button
                  type="submit"
                  disabled={slideGenerating || !slidePrompt.trim()}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
                >
                  {slideGenerating ? (
                    <span className="material-icons animate-spin text-base">autorenew</span>
                  ) : (
                    'Edit'
                  )}
                </button>
            </form>

            {/* Speaker notes */}
            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
                <span className="material-icons text-sm transition-transform group-open:rotate-90">chevron_right</span>
                <span className="material-icons text-sm">speaker_notes</span>
                Speaker Notes
                {currentSlide.notes && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              </summary>
              <textarea
                value={currentSlide.notes || ''}
                onChange={(e) => {
                  const newSlides = [...deck.slides];
                  newSlides[activeSlide] = { ...newSlides[activeSlide], notes: e.target.value };
                  setDeck({ ...deck, slides: newSlides });
                  setHasUnsavedChanges(true);
                }}
                placeholder="Add speaker notes for this slide..."
                className="mt-2 w-full h-24 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </details>

            {/* Visual editor shell — used in both preview and edit modes */}
            <div className="rounded-xl overflow-hidden [&>div]:!h-[calc(100vh-180px)]" style={{ minHeight: '600px' }}>
                <VisualEditorShell
                  key={`shell-${activeSlide}-${currentSlide.id}-${editorMode}`}
                  blocks={currentSlide.blocks}
                  selectedBlockId={null}
                  viewport={iframeViewport}
                  previewMode={editorMode === 'preview'}
                  initialZoom={60}
                  leftCollapsed={editorLeftCollapsed}
                  rightCollapsed={editorRightCollapsed}
                  onLeftCollapsedChange={setEditorLeftCollapsed}
                  onRightCollapsedChange={setEditorRightCollapsed}
                  iframeSrc={`/portal/tools/pitch-decks/${id}/slide-preview?${editorMode === 'edit' ? '_edit=true&' : ''}pc=${encodeURIComponent(deck.theme.primaryColor)}&ac=${encodeURIComponent(deck.theme.accentColor)}&bg=${encodeURIComponent(currentSlide.pageSettings?.backgroundColor || deck.theme.backgroundColor)}&text=${encodeURIComponent(currentSlide.pageSettings?.color || deck.theme.textColor)}&hf=${encodeURIComponent(deck.theme.headingFont)}&bf=${encodeURIComponent(deck.theme.bodyFont)}&ps=${encodeURIComponent(JSON.stringify(currentSlide.pageSettings || {}))}${deck.brandingProfileId ? `&profileId=${deck.brandingProfileId}` : ''}`}
                  onBlocksChange={(blocks: Block[]) => handleSlideBlocksChange(activeSlide, blocks)}
                  onSelectBlock={() => {}}
                  onAddBlock={(type: string) => {
                    const uid = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    let newBlock = {
                      id: uid,
                      type: type as BlockType,
                      order: currentSlide.blocks.length + 1,
                      // Text/heading defaults
                      ...(type === 'text' && { content: 'New text...' }),
                      ...(type === 'heading' && { content: 'New heading', level: 2 }),
                      ...(type === 'hero' && { title: 'Hero Title' }),
                      ...(type === 'cta' && { title: 'Call to Action', primaryButtonText: 'Learn More', primaryButtonUrl: '#' }),
                      // Container defaults — must initialize arrays
                      ...(type === 'columns' && { columns: [
                        { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
                        { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
                      ], gap: 'md' }),
                      ...(type === 'tabs' && { tabs: [
                        { id: `tab-${Date.now()}-1`, label: 'Tab 1', blocks: [] },
                        { id: `tab-${Date.now()}-2`, label: 'Tab 2', blocks: [] },
                      ] }),
                      ...(type === 'section' && { blocks: [] }),
                      ...(type === 'accordion' && { items: [{ id: `item-${Date.now()}-1`, title: 'Item 1', content: '' }] }),
                      ...(type === 'deck-next-slide' && { text: 'Next Slide', variant: 'primary', size: 'md', alignment: 'center' }),
                      ...(type === 'deck-jump-to' && { text: 'Jump To', targetSlide: 1, variant: 'secondary', size: 'md', alignment: 'center' }),
                    } as Block;
                    if (brandDefaults) newBlock = applyBrandDefaults(newBlock, brandDefaults);
                    handleSlideBlocksChange(activeSlide, [...currentSlide.blocks, newBlock]);
                  }}
                  onDeleteBlock={(blockId: string) => {
                    const block = findBlockById(currentSlide.blocks, blockId);
                    if (block?.required) return;
                    handleSlideBlocksChange(activeSlide, removeBlockById(currentSlide.blocks, blockId));
                  }}
                  onUpdateBlock={(blockId: string, updates: Partial<Block>) => {
                    handleSlideBlocksChange(
                      activeSlide,
                      currentSlide.blocks.map(b => b.id === blockId ? { ...b, ...updates } as Block : b),
                    );
                  }}
                  siteId={undefined}
                  extraBlockTypes={[
                    { type: 'deck-next-slide', label: 'Next Slide', icon: 'arrow_forward', category: 'Pitch Deck', description: 'Button that advances to the next slide' },
                    { type: 'deck-jump-to', label: 'Jump To Slide', icon: 'shortcut', category: 'Pitch Deck', description: 'Button that jumps to a specific slide' },
                  ]}
                  allowIframeScroll
                  noSelectionPanel={slideSettingsPanel}
                />
              </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* Board View Overlay */}
      {boardView && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-icons text-muted-foreground">grid_view</span>
              <h2 className="text-sm font-semibold text-foreground">All Slides</h2>
              <span className="text-xs text-muted-foreground">{deck.slides.length} slides</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-accent/50 rounded-lg p-1">
                {[2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => setBoardColumns(n)}
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
                onClick={() => setBoardView(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Close board view"
              >
                <span className="material-icons">close</span>
              </button>
            </div>
          </div>
          <DndContext sensors={slideDndSensors} collisionDetection={closestCenter} onDragEnd={handleSlideDragEnd}>
            <SortableContext items={deck.slides.map(s => s.id)} strategy={rectSortingStrategy}>
              {(() => {
                const mainSlides = deck.slides.map((s, i) => ({ slide: s, idx: i })).filter(({ slide }) => !slide.pathGroup);
                const groups = getPathGroups();
                return (
                  <div className="p-6 space-y-6">
                    {/* Main slides */}
                    {mainSlides.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3 px-1">
                          <span className="material-icons text-sm text-muted-foreground">slideshow</span>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Main</span>
                          <span className="text-[10px] text-muted-foreground">{mainSlides.length} slides</span>
                        </div>
                        <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${boardColumns}, minmax(0, 1fr))` }}>
                          {mainSlides.map(({ slide, idx }) => (
                            <SortableBoardCard
                              key={slide.id}
                              slide={slide}
                              index={idx}
                              isActive={idx === activeSlide}
                              theme={deck.theme}
                              onClick={() => { setActiveSlide(idx); setBoardView(false); }}
                              pathGroups={groups}
                              columns={boardColumns}
                              onRename={(newLabel) => {
                                if (!deck) return;
                                const newSlides = [...deck.slides];
                                newSlides[idx] = { ...newSlides[idx], label: newLabel };
                                setDeck({ ...deck, slides: newSlides });
                                setHasUnsavedChanges(true);
                              }}
                              surveyFieldCount={slide.surveySlide ? getSurveyFieldCount(slide.surveyId) : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Path groups */}
                    {groups.map((pg, groupIdx) => {
                      const pgSlides = deck.slides.map((s, i) => ({ slide: s, idx: i })).filter(({ slide }) => slide.pathGroup === pg);
                      const c = PATH_GROUP_COLORS[groupIdx % PATH_GROUP_COLORS.length];
                      return (
                        <div key={pg} className={`rounded-xl border p-5 ${c.bg} ${c.border}`}>
                          <BoardPathGroupHeader name={pg} color={c} slideCount={pgSlides.length} onRename={(newName) => renamePathGroup(pg, newName)} />
                          <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${boardColumns}, minmax(0, 1fr))` }}>
                            {pgSlides.map(({ slide, idx }) => (
                              <SortableBoardCard
                                key={slide.id}
                                slide={slide}
                                index={idx}
                                isActive={idx === activeSlide}
                                theme={deck.theme}
                                onClick={() => { setActiveSlide(idx); setBoardView(false); }}
                                pathGroups={groups}
                                onRename={(newLabel) => {
                                  if (!deck) return;
                                  const newSlides = [...deck.slides];
                                  newSlides[idx] = { ...newSlides[idx], label: newLabel };
                                  setDeck({ ...deck, slides: newSlides });
                                  setHasUnsavedChanges(true);
                                }}
                                surveyFieldCount={slide.surveySlide ? getSurveyFieldCount(slide.surveyId) : undefined}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {/* Add new slide */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { addSlide(); }}
                        className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/30 transition-colors"
                      >
                        <span className="material-icons text-base">add</span>
                        Add Slide
                      </button>
                      <button
                        onClick={() => htmlSlideFileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/30 transition-colors"
                      >
                        <span className="material-icons text-base">upload_file</span>
                        Upload HTML
                      </button>
                    </div>
                  </div>
                );
              })()}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

/** Sortable slide item for dnd-kit reordering with double-click rename */
// ─── Droppable zone for path groups ──────────────────────────────────────────

function BoardPathGroupHeader({ name, color, slideCount, onRename }: {
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

function PathGroupDropZone({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`border-t border-border transition-colors ${isOver ? 'bg-blue-500/10 ring-1 ring-blue-500/30 ring-inset' : ''}`}
      data-droppable={label}
    >
      {children}
    </div>
  );
}

const PATH_GROUP_COLORS = [
  { bg: 'bg-blue-500/10', text: 'text-blue-500', dot: 'bg-blue-500', border: 'border-blue-500/20' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: 'bg-emerald-500', border: 'border-emerald-500/20' },
  { bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-500', border: 'border-amber-500/20' },
  { bg: 'bg-purple-500/10', text: 'text-purple-500', dot: 'bg-purple-500', border: 'border-purple-500/20' },
  { bg: 'bg-rose-500/10', text: 'text-rose-500', dot: 'bg-rose-500', border: 'border-rose-500/20' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-500', dot: 'bg-cyan-500', border: 'border-cyan-500/20' },
];

function getPathGroupColor(pathGroup: string, allGroups: string[]) {
  const idx = allGroups.indexOf(pathGroup);
  return PATH_GROUP_COLORS[idx >= 0 ? idx % PATH_GROUP_COLORS.length : 0];
}

function SortableBoardCard({ slide, index, isActive, theme, onClick, pathGroups, onRename, columns = 4, surveyFieldCount }: {
  slide: PitchDeckSlideV2;
  index: number;
  isActive: boolean;
  theme: PitchDeckTheme;
  onClick: () => void;
  pathGroups: string[];
  onRename: (newLabel: string) => void;
  columns?: number;
  surveyFieldCount?: number;
}) {
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
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 p-1 rounded bg-black/30 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <span className="material-icons text-sm">drag_indicator</span>
      </div>
      {/* Survey group badge */}
      {slide.surveySlide && surveyFieldCount != null && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/90 text-white text-[10px] font-semibold shadow">
          <span className="material-icons text-xs">assignment</span>
          {surveyFieldCount} question slides
        </div>
      )}
      {/* Clickable area */}
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
      {/* Decision slide path indicators */}
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

function SortableSlideItem({ slide, index, isActive, isSelected, onClick, onRename, onDuplicate, onRemove, onToggleSelect, canRemove, surveyFieldCount }: {
  slide: PitchDeckSlideV2;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onRename: (newLabel: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToggleSelect: () => void;
  canRemove: boolean;
  surveyFieldCount?: number;
}) {
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
            className="text-sm truncate"
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
        {slide.surveySlide && surveyFieldCount != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium shrink-0" title={`Expands to ${surveyFieldCount} question slides`}>
            {surveyFieldCount} slides
          </span>
        )}
      </div>
      <div className="flex items-center shrink-0 pr-2 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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

/** Board view thumbnail — renders a slide preview in a scaled iframe */

// ─── Survey Field Properties Panel ─────────────────────────────────────────

interface SurveyFieldForPanel {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options: string[];
  placeholder?: string;
  helpText?: string;
  min?: number;
  max?: number;
  step?: number;
}

const SURVEY_FIELD_TYPES = [
  { value: 'text', label: 'Short Text', icon: 'short_text' },
  { value: 'textarea', label: 'Long Text', icon: 'notes' },
  { value: 'email', label: 'Email', icon: 'email' },
  { value: 'phone', label: 'Phone', icon: 'phone' },
  { value: 'url', label: 'URL', icon: 'link' },
  { value: 'number', label: 'Number', icon: 'tag' },
  { value: 'date', label: 'Date', icon: 'calendar_today' },
  { value: 'select', label: 'Dropdown', icon: 'arrow_drop_down_circle' },
  { value: 'radio', label: 'Single Choice', icon: 'radio_button_checked' },
  { value: 'checkbox', label: 'Multi Choice', icon: 'check_box' },
  { value: 'toggle', label: 'Toggle', icon: 'toggle_on' },
  { value: 'rating', label: 'Rating', icon: 'star' },
  { value: 'slider', label: 'Slider', icon: 'tune' },
  { value: 'heading', label: 'Heading', icon: 'title' },
];

const HAS_OPTIONS = ['select', 'radio', 'checkbox'];
const HAS_RANGE = ['slider', 'number', 'rating'];

function SurveyFieldPropertiesPanel({ field, surveyId, onUpdate }: {
  field: SurveyFieldForPanel;
  surveyId: number;
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="material-icons text-base text-emerald-500">quiz</span>
        <span className="text-sm font-semibold text-foreground">Question Settings</span>
      </div>

      {/* Label */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Question Label</label>
        <input
          type="text"
          value={field.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Field Type</label>
        <select
          value={field.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {SURVEY_FIELD_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Required toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">Required</label>
        <button
          type="button"
          onClick={() => onUpdate({ required: !field.required })}
          className={`relative w-9 h-5 rounded-full transition-colors ${field.required ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${field.required ? 'translate-x-4' : ''}`} />
        </button>
      </div>

      {/* Placeholder */}
      {field.type !== 'heading' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Placeholder</label>
          <input
            type="text"
            value={field.placeholder || ''}
            onChange={(e) => onUpdate({ placeholder: e.target.value })}
            className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Enter placeholder text..."
          />
        </div>
      )}

      {/* Help Text */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Help Text</label>
        <input
          type="text"
          value={field.helpText || ''}
          onChange={(e) => onUpdate({ helpText: e.target.value })}
          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Optional help text..."
        />
      </div>

      {/* Options (for select, radio, checkbox) */}
      {HAS_OPTIONS.includes(field.type) && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Options</label>
          <div className="space-y-1.5">
            {(field.options || []).map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground/50 w-4 text-right shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...(field.options || [])];
                    newOpts[i] = e.target.value;
                    onUpdate({ options: newOpts });
                  }}
                  className="flex-1 px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newOpts = (field.options || []).filter((_, j) => j !== i);
                    onUpdate({ options: newOpts });
                  }}
                  className="p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onUpdate({ options: [...(field.options || []), `Option ${(field.options || []).length + 1}`] })}
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 border border-dashed border-border rounded text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <span className="material-icons text-sm">add</span>
              Add Option
            </button>
          </div>
        </div>
      )}

      {/* Min / Max / Step (for slider, number, rating) */}
      {HAS_RANGE.includes(field.type) && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Min</label>
            <input
              type="number"
              value={field.min ?? (field.type === 'rating' ? 1 : 0)}
              onChange={(e) => onUpdate({ min: Number(e.target.value) })}
              className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Max</label>
            <input
              type="number"
              value={field.max ?? (field.type === 'rating' ? 5 : 100)}
              onChange={(e) => onUpdate({ max: Number(e.target.value) })}
              className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Step</label>
            <input
              type="number"
              value={field.step ?? 1}
              onChange={(e) => onUpdate({ step: Number(e.target.value) })}
              className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      )}

      {/* Source of truth note */}
      <div className="bg-accent/30 rounded-lg p-2.5 mt-4">
        <div className="flex items-start gap-1.5">
          <span className="material-icons text-xs text-emerald-500 mt-0.5">sync</span>
          <p className="text-[10px] text-muted-foreground">
            Changes sync to the survey record automatically. The survey is the source of truth.
          </p>
        </div>
      </div>
    </div>
  );
}
