'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { use } from 'react';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import type { Block, BlockType } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('preview');
  const [slidePanelCollapsed, setSlidePanelCollapsed] = useState(false);
  const [iframeViewport, setIframeViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [editorLeftCollapsed, setEditorLeftCollapsed] = useState(false);
  const [editorRightCollapsed, setEditorRightCollapsed] = useState(false);
  const [boardView, setBoardView] = useState(false);
  const [aiHistory, setAiHistory] = useState<Record<number, Array<{ role: 'user' | 'assistant'; content: string }>>>({});
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Survey integration state
  const [hasSurveyService, setHasSurveyService] = useState(false);
  const [surveyList, setSurveyList] = useState<{ id: number; title: string; status: string; fields: unknown[] }[]>([]);
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);
  const [surveyListLoaded, setSurveyListLoaded] = useState(false);

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
      if (data.success) setDeck(data.data);
      else setError(data.message || 'Failed to load deck');
    } catch {
      setError('Failed to connect to server. Please refresh the page.');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchDeck(); }, [fetchDeck]);

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
      setDeck(data.data);
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
      setDeck(data.data);
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
      setDeck(data.data);
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
    if (data.success) setDeck(data.data);
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
    if (!over || active.id === over.id) return;
    const oldIndex = deck.slides.findIndex(s => s.id === active.id);
    const newIndex = deck.slides.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newSlides = arrayMove(deck.slides, oldIndex, newIndex);
    setDeck({ ...deck, slides: newSlides });
    if (activeSlide === oldIndex) setActiveSlide(newIndex);
    else if (activeSlide > Math.min(oldIndex, newIndex) && activeSlide <= Math.max(oldIndex, newIndex)) {
      setActiveSlide(oldIndex < newIndex ? activeSlide - 1 : activeSlide + 1);
    }
    setHasUnsavedChanges(true);
  }

  const slideDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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
      setDeck(data.data);
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{deck.slides.length} slides</span>
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
                    {/* Main sequence slides */}
                    <DndContext sensors={slideDndSensors} collisionDetection={closestCenter} onDragEnd={handleSlideDragEnd}>
                      <SortableContext items={deck.slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        {deck.slides.map((slide, idx) => {
                          if (slide.pathGroup) return null; // shown in path group sections below
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
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>

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
                        <div key={pg} className="border-t border-border">
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
                            />
                          ))}
                          {pgSlides.length === 0 && (
                            <p className="text-[10px] text-muted-foreground text-center py-2">No slides in this path yet</p>
                          )}
                        </div>
                      );
                    })}
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
                <button
                  onClick={() => removeSlide(activeSlide)}
                  disabled={deck.slides.length <= 1}
                  className="p-1.5 rounded text-muted-foreground hover:text-red-500 disabled:opacity-30 transition-colors"
                  title="Delete slide"
                >
                  <span className="material-icons text-base">delete</span>
                </button>
              </div>
            </div>

            {/* Survey slide info panel */}
            {currentSlide.surveySlide ? (
              <div className="bg-card border border-border rounded-xl p-8 space-y-4" style={{ minHeight: '600px' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <span className="material-icons text-2xl text-primary">assignment</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{currentSlide.label}</h3>
                    <p className="text-sm text-muted-foreground">Survey ID: {currentSlide.surveyId}</p>
                  </div>
                </div>
                <div className="bg-accent/30 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="material-icons text-base text-primary mt-0.5">info</span>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>This slide will expand into individual question slides in the live presentation.</p>
                      <p>Each question appears as its own full-screen slide, styled with the deck theme.</p>
                      <p>Conditional logic (show/hide, branching) is fully supported.</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href={`/portal/surveys/${currentSlide.surveyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <span className="material-icons text-base">open_in_new</span>
                    Edit Survey
                  </a>
                  <button
                    onClick={() => removeSlide(activeSlide)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <span className="material-icons text-base">delete</span>
                    Remove
                  </button>
                </div>
              </div>
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
                  iframeSrc={`/portal/tools/pitch-decks/${id}/slide-preview?${editorMode === 'edit' ? '_edit=true&' : ''}pc=${encodeURIComponent(deck.theme.primaryColor)}&ac=${encodeURIComponent(deck.theme.accentColor)}&bg=${encodeURIComponent(deck.theme.backgroundColor)}&text=${encodeURIComponent(deck.theme.textColor)}&hf=${encodeURIComponent(deck.theme.headingFont)}&bf=${encodeURIComponent(deck.theme.bodyFont)}`}
                  onBlocksChange={(blocks: Block[]) => handleSlideBlocksChange(activeSlide, blocks)}
                  onSelectBlock={() => {}}
                  onAddBlock={(type: string) => {
                    const uid = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    const newBlock = {
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
                    handleSlideBlocksChange(activeSlide, [...currentSlide.blocks, newBlock]);
                  }}
                  onDeleteBlock={(blockId: string) => {
                    handleSlideBlocksChange(activeSlide, currentSlide.blocks.filter(b => b.id !== blockId));
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
            <button
              onClick={() => setBoardView(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Close board view"
            >
              <span className="material-icons">close</span>
            </button>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {deck.slides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => { setActiveSlide(idx); setBoardView(false); }}
                className={`group relative bg-card border rounded-xl overflow-hidden text-left transition-all hover:ring-2 hover:ring-primary/50 hover:shadow-lg ${
                  idx === activeSlide ? 'ring-2 ring-primary border-primary' : 'border-border'
                }`}
              >
                {/* Slide thumbnail via iframe */}
                <BoardThumbnail
                  src={`/portal/tools/pitch-decks/${id}/slide-preview?pc=${encodeURIComponent(deck.theme.primaryColor)}&ac=${encodeURIComponent(deck.theme.accentColor)}&bg=${encodeURIComponent(deck.theme.backgroundColor)}&text=${encodeURIComponent(deck.theme.textColor)}&hf=${encodeURIComponent(deck.theme.headingFont)}&bf=${encodeURIComponent(deck.theme.bodyFont)}`}
                  blocks={slide.blocks}
                />
                {/* Label */}
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className={`text-xs font-mono ${idx === activeSlide ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    {idx + 1}
                  </span>
                  <span className="text-xs text-foreground truncate">
                    {slide.label || 'Untitled'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Sortable slide item for dnd-kit reordering with double-click rename */
function SortableSlideItem({ slide, index, isActive, isSelected, onClick, onRename, onDuplicate, onRemove, onToggleSelect, canRemove }: {
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
        <span className="material-icons text-base shrink-0">{getSlideIcon(slide)}</span>
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
      </div>
      <div className="flex items-center shrink-0 pr-2 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Duplicate slide"
        >
          <span className="material-icons text-sm">content_copy</span>
        </button>
        <button
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
function BoardThumbnail({ src, blocks }: { src: string; blocks: Block[] }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sentRef = useRef(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    sentRef.current = false;

    const sendBlocks = () => {
      iframe.contentWindow?.postMessage({
        source: 'sd-editor-parent',
        type: 'EDITOR_INIT',
        payload: { blocks },
      }, '*');
    };

    // When iframe signals ready, send blocks immediately
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.type === 'IFRAME_READY' || e.data?.source === 'sd-editor-child') {
        sentRef.current = true;
        sendBlocks();
      }
    };
    window.addEventListener('message', handleMessage);

    // Also retry a few times after load to handle race conditions
    const onLoad = () => {
      let attempts = 0;
      const retry = setInterval(() => {
        if (sentRef.current || attempts > 10) { clearInterval(retry); return; }
        sendBlocks();
        attempts++;
      }, 200);
    };
    iframe.addEventListener('load', onLoad);

    return () => {
      window.removeEventListener('message', handleMessage);
      iframe.removeEventListener('load', onLoad);
    };
  }, [blocks]);

  return (
    <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
      <iframe
        ref={iframeRef}
        src={src}
        className="pointer-events-none border-0"
        style={{
          width: '1280px',
          height: '720px',
          transform: 'scale(0.25)',
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
        tabIndex={-1}
      />
      <div className="absolute inset-0 z-10" />
    </div>
  );
}
