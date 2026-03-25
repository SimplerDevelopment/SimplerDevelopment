'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { use } from 'react';

interface Slide {
  id: string;
  type: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  bullets?: string[];
  stats?: { label: string; value: string }[];
  steps?: { title: string; description: string }[];
  members?: { name: string; role: string; image?: string }[];
  tiers?: { name: string; price: string; features: string[]; highlighted?: boolean }[];
  columns?: number;
  notes?: string;
}

interface Theme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logo?: string;
}

interface Deck {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  slides: Slide[];
  theme: Theme;
  sourceUrl: string | null;
  updatedAt: string;
}

const slideTypeIcon: Record<string, string> = {
  cover: 'title',
  problem: 'report_problem',
  solution: 'lightbulb',
  features: 'star',
  process: 'account_tree',
  metrics: 'bar_chart',
  testimonial: 'format_quote',
  team: 'group',
  pricing: 'payments',
  cta: 'campaign',
  custom: 'edit_note',
};

const slideTypeLabel: Record<string, string> = {
  cover: 'Cover',
  problem: 'Problem',
  solution: 'Solution',
  features: 'Features',
  process: 'Process',
  metrics: 'Metrics',
  testimonial: 'Testimonial',
  team: 'Team',
  pricing: 'Pricing',
  cta: 'Call to Action',
  custom: 'Custom',
};

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
  const [previewScale, setPreviewScale] = useState(0.5);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<{ id: number; label: string | null; trigger: string; slideCount: number; createdAt: string }[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
    } catch (err) {
      setError('Failed to connect to server. Please refresh the page.');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchDeck(); }, [fetchDeck]);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setPreviewScale(el.clientWidth / 1440);
    });
    obs.observe(el);
    setPreviewScale(el.clientWidth / 1440);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (searchParams.get('genError') === '1') {
      setError('AI generation failed. You can try regenerating the deck.');
      setShowRegenerate(true);
    }
  }, [searchParams]);

  async function handleSlideEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!slidePrompt.trim() || !deck) return;

    setSlideGenerating(true);
    setError('');
    const res = await fetch(`/api/portal/tools/pitch-decks/${id}/slides/${activeSlide}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: slidePrompt.trim() }),
    });
    const data = await res.json();
    setSlideGenerating(false);
    if (data.success) {
      setDeck(data.data);
      setSlidePrompt('');
      setHasUnsavedChanges(false);
    } else {
      setError(data.message || 'Failed to edit slide');
    }
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

  function handleManualSlideUpdate(field: string, value: unknown) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    newSlides[activeSlide] = { ...newSlides[activeSlide], [field]: value };
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

  function handleThemeUpdate(updates: Partial<Theme>) {
    if (!deck) return;
    const newTheme = { ...deck.theme, ...updates };
    setDeck({ ...deck, theme: newTheme });
    setHasUnsavedChanges(true);
  }

  // Theme changes are saved via the main Update button (saveDeck)

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
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      type: 'custom',
      headline: 'New Slide',
      body: '',
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

  function moveSlide(idx: number, dir: -1 | 1) {
    if (!deck) return;
    const target = idx + dir;
    if (target < 0 || target >= deck.slides.length) return;
    const newSlides = [...deck.slides];
    [newSlides[idx], newSlides[target]] = [newSlides[target], newSlides[idx]];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(target);
    setHasUnsavedChanges(true);
  }

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
      // Reload versions to include the auto-save
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
    <div className="max-w-6xl mx-auto space-y-4">
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
              <input
                type="text"
                value={deck.theme.headingFont}
                onChange={(e) => handleThemeUpdate({ headingFont: e.target.value })}
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
              <input
                type="text"
                value={deck.theme.bodyFont}
                onChange={(e) => handleThemeUpdate({ bodyFont: e.target.value })}
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded text-foreground"
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
        <div className="grid grid-cols-12 gap-4">
          {/* Slide list sidebar */}
          <div className="col-span-3 space-y-2">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slides</span>
                <button onClick={addSlide} className="text-primary hover:text-primary/80" title="Add slide">
                  <span className="material-icons text-lg">add_circle</span>
                </button>
              </div>
              <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
                {deck.slides.map((slide, idx) => (
                  <button
                    key={slide.id}
                    onClick={() => setActiveSlide(idx)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 border-b border-border/50 last:border-0 transition-colors ${
                      idx === activeSlide
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <span className="text-xs font-mono opacity-50 w-5 text-right">{idx + 1}</span>
                    <span className="material-icons text-base">{slideTypeIcon[slide.type] || 'edit_note'}</span>
                    <span className="text-sm truncate flex-1">{slide.headline || slideTypeLabel[slide.type] || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Slide preview + editor */}
          <div className="col-span-9 space-y-4">
            {/* Preview — renders the real presentation scaled to fit */}
            <div className="rounded-xl border border-border overflow-hidden aspect-[16/9] relative">
              <div
                ref={previewContainerRef}
                className="absolute inset-0 overflow-hidden"
                style={{ backgroundColor: deck.theme.backgroundColor }}
              >
                <div
                  style={{
                    width: '1440px',
                    height: '810px',
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <ScaledSlidePreview slide={currentSlide} theme={deck.theme} index={activeSlide} total={deck.slides.length} />
                </div>
              </div>
            </div>

            {/* Slide controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveSlide(activeSlide, -1)}
                disabled={activeSlide === 0}
                className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                title="Move up"
              >
                <span className="material-icons text-base">arrow_upward</span>
              </button>
              <button
                onClick={() => moveSlide(activeSlide, 1)}
                disabled={activeSlide === deck.slides.length - 1}
                className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                title="Move down"
              >
                <span className="material-icons text-base">arrow_downward</span>
              </button>
              <span className="text-xs text-muted-foreground">
                Slide {activeSlide + 1} of {deck.slides.length} · {slideTypeLabel[currentSlide.type] || 'Custom'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={currentSlide.type}
                  onChange={(e) => handleManualSlideUpdate('type', e.target.value)}
                  className="text-xs px-2 py-1 bg-background border border-border rounded text-foreground"
                >
                  {Object.entries(slideTypeLabel).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
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

            {/* Manual editing */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit Content</h3>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Headline</label>
                <input
                  type="text"
                  value={currentSlide.headline || ''}
                  onChange={(e) => handleManualSlideUpdate('headline', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Subheadline</label>
                <input
                  type="text"
                  value={currentSlide.subheadline || ''}
                  onChange={(e) => handleManualSlideUpdate('subheadline', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground"
                />
              </div>
              {currentSlide.body !== undefined && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Body</label>
                  <textarea
                    value={currentSlide.body || ''}
                    onChange={(e) => handleManualSlideUpdate('body', e.target.value)}
                    rows={3}
                    className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground resize-none"
                  />
                </div>
              )}
              {currentSlide.bullets && currentSlide.bullets.length > 0 && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Bullets (one per line)</label>
                  <textarea
                    value={currentSlide.bullets.join('\n')}
                    onChange={(e) => handleManualSlideUpdate('bullets', e.target.value.split('\n'))}
                    rows={4}
                    className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground resize-none font-mono"
                  />
                </div>
              )}
            </div>

            {/* AI slide editing */}
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
          </div>
        </div>
      )}
    </div>
  );
}

/* ScaledSlidePreview renders the exact same markup as the public presentation
   at 1440x810, which the parent scales down via CSS transform to fit the preview box. */
function ScaledSlidePreview({ slide, theme, index, total }: { slide: Slide; theme: Theme; index: number; total: number }) {
  const ac = theme.accentColor;
  const tc = theme.textColor;
  const bg = theme.backgroundColor;
  const h = theme.headingFont;
  const b = theme.bodyFont;
  const featureIcons = ['rocket_launch', 'auto_awesome', 'speed', 'psychology', 'hub', 'security', 'trending_up', 'bolt'];
  const teamGradients = [
    `linear-gradient(135deg, ${ac}40, ${ac}10)`,
    `linear-gradient(135deg, #8b5cf640, #8b5cf610)`,
    `linear-gradient(135deg, #10b98140, #10b98110)`,
    `linear-gradient(135deg, #f5972040, #f5972010)`,
    `linear-gradient(135deg, #ef444440, #ef444410)`,
    `linear-gradient(135deg, #ec489940, #ec489910)`,
  ];

  return (
    <div className="w-[1440px] h-[810px] relative overflow-hidden" style={{ color: tc, fontFamily: b, backgroundColor: bg }}>
      {/* Slide number */}
      <div className="absolute top-6 left-8 z-20 text-sm opacity-40 tracking-widest font-light" style={{ fontFamily: b }}>
        {String(index + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
      </div>
      {/* SD branding */}
      <div className="absolute top-5 right-8 z-20 flex items-center gap-2 opacity-30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/iconLogo.png" alt="" className="h-6 w-6 brightness-0 invert" />
        <span className="text-xs tracking-wide font-light" style={{ color: tc, fontFamily: b }}>
          <b className="font-semibold">Simpler</b> Development
        </span>
      </div>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] z-20" style={{ backgroundColor: tc + '10' }}>
        <div className="h-full" style={{ width: `${((index + 1) / total) * 100}%`, backgroundColor: ac }} />
      </div>

      {/* Slide content — exact copy of public SlideRenderer */}
      <div className="w-[1440px] h-[810px] flex items-center justify-center">
        {slide.type === 'cover' ? (
          <div className="w-full min-h-full flex items-center relative overflow-hidden">
            <div className="absolute -right-40 -top-40 w-[700px] h-[700px] rounded-full opacity-[0.07] pointer-events-none" style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />
            <div className="absolute -left-20 -bottom-20 w-[400px] h-[400px] rounded-full opacity-[0.04] pointer-events-none" style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `linear-gradient(${tc}15 1px, transparent 1px), linear-gradient(90deg, ${tc}15 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
            <div className="relative z-10 w-full max-w-5xl mx-auto px-12 md:px-20 py-20">
              <div className="w-16 h-1 rounded-full mb-8" style={{ backgroundColor: ac }} />
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold leading-[1.05] tracking-tight" style={{ fontFamily: h, color: tc }}>{slide.headline || 'Untitled'}</h1>
              {slide.subheadline && <p className="text-xl md:text-2xl mt-8 max-w-2xl leading-relaxed font-light opacity-60" style={{ fontFamily: b }}>{slide.subheadline}</p>}
              {slide.body && <p className="text-base mt-6 max-w-xl leading-relaxed opacity-40" style={{ fontFamily: b }}>{slide.body}</p>}
              <div className="absolute bottom-16 right-12 md:right-20 flex items-center gap-3 opacity-30">
                <div className="h-px w-12" style={{ backgroundColor: ac }} />
                <span className="text-xs uppercase tracking-[0.25em] font-medium" style={{ fontFamily: b, color: ac }}>{String(index + 1).padStart(2, '0')}</span>
              </div>
            </div>
          </div>
        ) : slide.type === 'problem' ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.06] pointer-events-none" style={{ background: `radial-gradient(circle, #ef4444, transparent 70%)` }} />
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 grid grid-cols-1 md:grid-cols-5 gap-12 items-center">
              <div className="md:col-span-3 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider" style={{ backgroundColor: '#ef444420', color: '#f87171' }}>
                  <span className="material-icons text-sm">warning</span>The Challenge
                </div>
                <h2 className="text-4xl md:text-5xl font-bold leading-tight" style={{ fontFamily: h }}>{slide.headline}</h2>
                {slide.body && <p className="text-lg leading-relaxed opacity-60 max-w-lg" style={{ fontFamily: b }}>{slide.body}</p>}
              </div>
              {slide.bullets && slide.bullets.length > 0 && (
                <div className="md:col-span-2 space-y-3">
                  {slide.bullets.map((bullet, i) => (
                    <div key={i} className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: tc + '08', borderLeft: `3px solid ${ac}` }}>
                      <span className="text-lg font-bold opacity-30 shrink-0" style={{ fontFamily: h, color: ac }}>{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-sm leading-relaxed opacity-80" style={{ fontFamily: b }}>{bullet}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : slide.type === 'solution' ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="absolute left-0 top-0 w-[600px] h-[600px] rounded-full opacity-[0.06] pointer-events-none" style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider" style={{ backgroundColor: ac + '20', color: ac }}>
                  <span className="material-icons text-sm">lightbulb</span>The Solution
                </div>
                <h2 className="text-4xl md:text-5xl font-bold leading-tight" style={{ fontFamily: h }}>{slide.headline}</h2>
                {slide.subheadline && <p className="text-lg leading-relaxed opacity-60" style={{ fontFamily: b }}>{slide.subheadline}</p>}
                {slide.body && <p className="text-base leading-relaxed opacity-50" style={{ fontFamily: b }}>{slide.body}</p>}
              </div>
              {slide.bullets && slide.bullets.length > 0 && (
                <div className="space-y-4">
                  {slide.bullets.map((bullet, i) => (
                    <div key={i} className="flex items-start gap-4 p-5 rounded-2xl" style={{ backgroundColor: tc + '06' }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold" style={{ backgroundColor: ac + '20', color: ac }}>
                        <span className="material-icons text-lg">check</span>
                      </div>
                      <span className="text-base leading-relaxed opacity-80 pt-2" style={{ fontFamily: b }}>{bullet}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : slide.type === 'features' ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
              <div className="text-center space-y-4 max-w-3xl mx-auto">
                {slide.headline && <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>}
                {slide.subheadline && <p className="text-lg opacity-50" style={{ fontFamily: b }}>{slide.subheadline}</p>}
              </div>
              {slide.bullets && slide.bullets.length > 0 && (() => {
                const cols = slide.columns || (slide.bullets!.length <= 3 ? 3 : slide.bullets!.length <= 4 ? 2 : 3);
                const w = `calc(${100 / cols}% - ${(cols - 1) * 20 / cols}px)`;
                return (
                  <div className="flex flex-wrap justify-center gap-5">
                    {slide.bullets!.map((bullet, i) => (
                      <div key={i} className="p-6 rounded-2xl relative overflow-hidden shrink-0" style={{ backgroundColor: tc + '06', border: `1px solid ${tc}10`, width: w, minWidth: '180px' }}>
                        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: ac + '40' }} />
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: ac + '15', color: ac }}>
                          <span className="material-icons text-xl">{featureIcons[i % featureIcons.length]}</span>
                        </div>
                        <p className="text-sm leading-relaxed opacity-80" style={{ fontFamily: b }}>{bullet}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : slide.type === 'metrics' && slide.stats && slide.stats.length > 0 ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-[0.05] pointer-events-none" style={{ background: `radial-gradient(ellipse, ${ac}, transparent 70%)` }} />
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-16">
              <div className="text-center space-y-4">
                {slide.headline && <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>}
                {slide.subheadline && <p className="text-lg opacity-50 max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.subheadline}</p>}
              </div>
              <div className="flex flex-wrap justify-center gap-8">
                {slide.stats.map((stat, i) => {
                  const cols = slide.columns || (slide.stats!.length <= 3 ? 3 : 4);
                  const w = `calc(${100 / cols}% - ${(cols - 1) * 32 / cols}px)`;
                  return (
                    <div key={i} className="text-center p-8 rounded-2xl relative shrink-0" style={{ backgroundColor: tc + '05', border: `1px solid ${tc}08`, width: w, minWidth: '200px' }}>
                      <div className="text-5xl md:text-6xl font-extrabold tracking-tight" style={{ color: ac, fontFamily: h }}>{stat.value}</div>
                      <div className="mt-3 text-sm uppercase tracking-wider opacity-50 font-medium" style={{ fontFamily: b }}>{stat.label}</div>
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] rounded-full" style={{ backgroundColor: ac + '40' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : slide.type === 'process' && slide.steps && slide.steps.length > 0 ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
              <div className="space-y-4">
                {slide.headline && <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>}
                {slide.subheadline && <p className="text-lg opacity-50 max-w-xl" style={{ fontFamily: b }}>{slide.subheadline}</p>}
              </div>
              <div className="relative">
                <div className="hidden md:block absolute top-12 left-0 right-0 h-px" style={{ backgroundColor: tc + '10' }} />
                <div className={`grid gap-6 ${slide.steps.length <= 3 ? 'md:grid-cols-3' : slide.steps.length <= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                  {slide.steps.map((step, i) => (
                    <div key={i} className="relative">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-5 relative z-10" style={{ backgroundColor: ac, color: bg, fontFamily: h }}>{i + 1}</div>
                      <div className="p-5 rounded-2xl" style={{ backgroundColor: tc + '05', border: `1px solid ${tc}08` }}>
                        <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: h }}>{step.title}</h3>
                        <p className="text-sm opacity-60 leading-relaxed" style={{ fontFamily: b }}>{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : slide.type === 'team' && slide.members && slide.members.length > 0 ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
              <div className="text-center space-y-4">
                {slide.headline && <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>}
                {slide.subheadline && <p className="text-lg opacity-50 max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.subheadline}</p>}
              </div>
              <div className={`grid gap-6 justify-center ${slide.members.length <= 3 ? 'md:grid-cols-3 max-w-4xl mx-auto' : 'grid-cols-2 md:grid-cols-4'}`}>
                {slide.members.map((member, i) => (
                  <div key={i} className="text-center p-6 rounded-2xl" style={{ backgroundColor: tc + '05' }}>
                    <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-bold" style={{ background: teamGradients[i % teamGradients.length], fontFamily: h }}>
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="font-semibold text-base" style={{ fontFamily: h }}>{member.name}</div>
                    <div className="text-sm opacity-50 mt-1" style={{ fontFamily: b, color: ac }}>{member.role}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : slide.type === 'pricing' && slide.tiers && slide.tiers.length > 0 ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
              <div className="text-center space-y-4">
                {slide.headline && <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>}
                {slide.subheadline && <p className="text-lg opacity-50 max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.subheadline}</p>}
              </div>
              <div className={`grid gap-6 ${slide.tiers.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
                {slide.tiers.map((tier, i) => {
                  const highlighted = tier.highlighted || (slide.tiers!.length === 3 && i === 1);
                  return (
                    <div key={i} className="p-6 rounded-2xl text-left relative overflow-hidden flex flex-col" style={{ backgroundColor: highlighted ? tc + '10' : tc + '05', border: `1px solid ${highlighted ? ac : tc + '10'}` }}>
                      {highlighted && <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: ac }} />}
                      {highlighted && <span className="inline-block self-start px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ backgroundColor: ac + '20', color: ac }}>Popular</span>}
                      <div className="font-semibold text-lg mb-1" style={{ fontFamily: h }}>{tier.name}</div>
                      <div className="text-3xl font-extrabold mb-5" style={{ color: ac, fontFamily: h }}>{tier.price}</div>
                      <ul className="space-y-2.5 flex-1">
                        {tier.features.map((f, j) => (
                          <li key={j} className="flex items-start gap-2.5 text-sm" style={{ fontFamily: b }}>
                            <span className="material-icons text-sm mt-0.5 shrink-0" style={{ color: ac }}>check_circle</span>
                            <span className="opacity-70">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : slide.type === 'testimonial' ? (
          <div className="w-full min-h-full flex items-center relative">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04] pointer-events-none" style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />
            <div className="relative z-10 w-full max-w-4xl mx-auto px-12 md:px-20 py-20 text-center space-y-8">
              <div className="text-[120px] leading-none opacity-10 -mb-16" style={{ color: ac, fontFamily: 'Georgia, serif' }}>&ldquo;</div>
              {slide.body && <blockquote className="text-2xl md:text-4xl font-light leading-relaxed" style={{ fontFamily: h }}>{slide.body}</blockquote>}
              {slide.headline && (
                <div className="pt-4">
                  <div className="w-12 h-px mx-auto mb-4" style={{ backgroundColor: ac }} />
                  <div className="font-semibold text-lg" style={{ color: ac, fontFamily: h }}>{slide.headline}</div>
                  {slide.subheadline && <div className="text-sm opacity-40 mt-1" style={{ fontFamily: b }}>{slide.subheadline}</div>}
                </div>
              )}
            </div>
          </div>
        ) : slide.type === 'cta' ? (
          <div className="w-full min-h-full flex items-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ background: `radial-gradient(ellipse at center, ${ac}, transparent 60%)` }} />
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `linear-gradient(${tc}15 1px, transparent 1px), linear-gradient(90deg, ${tc}15 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
            <div className="relative z-10 w-full max-w-4xl mx-auto px-12 md:px-20 py-20 text-center space-y-8">
              {slide.headline && <h2 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight" style={{ fontFamily: h }}>{slide.headline}</h2>}
              {slide.subheadline && <p className="text-xl md:text-2xl opacity-60 max-w-2xl mx-auto font-light leading-relaxed" style={{ fontFamily: b }}>{slide.subheadline}</p>}
              {slide.body && <p className="text-base opacity-40 max-w-lg mx-auto" style={{ fontFamily: b }}>{slide.body}</p>}
              {slide.bullets && slide.bullets.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3 pt-6">
                  {slide.bullets.map((bull, i) => (
                    <span key={i} className="px-6 py-3 rounded-full text-sm font-medium" style={{ backgroundColor: ac + '15', color: ac, border: `1px solid ${ac}30`, fontFamily: b }}>{bull}</span>
                  ))}
                </div>
              )}
              <div className="w-20 h-1 rounded-full mx-auto mt-4" style={{ backgroundColor: ac }} />
            </div>
          </div>
        ) : (
          <div className="w-full min-h-full flex items-center relative">
            <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20">
              {slide.bullets && slide.bullets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                  <div className="space-y-6">
                    {slide.headline && <h2 className="text-4xl md:text-5xl font-bold leading-tight" style={{ fontFamily: h }}>{slide.headline}</h2>}
                    {slide.subheadline && <p className="text-lg opacity-50" style={{ fontFamily: b }}>{slide.subheadline}</p>}
                    {slide.body && <p className="text-base opacity-50 leading-relaxed" style={{ fontFamily: b }}>{slide.body}</p>}
                  </div>
                  <div className="space-y-3">
                    {slide.bullets.map((bullet, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-xl" style={{ backgroundColor: tc + '05' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold" style={{ backgroundColor: ac + '20', color: ac, fontFamily: h }}>{i + 1}</div>
                        <span className="text-sm leading-relaxed opacity-80 pt-1" style={{ fontFamily: b }}>{bullet}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center max-w-3xl mx-auto space-y-6">
                  {slide.headline && <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>}
                  {slide.subheadline && <p className="text-xl opacity-60" style={{ fontFamily: b }}>{slide.subheadline}</p>}
                  {slide.body && <p className="text-base opacity-50 leading-relaxed max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.body}</p>}
                </div>
              )}
              {slide.stats && slide.stats.length > 0 && (
                <div className="flex justify-center gap-10 mt-12 pt-8" style={{ borderTop: `1px solid ${tc}10` }}>
                  {slide.stats.map((stat, i) => (
                    <div key={i} className="text-center">
                      <div className="text-4xl font-extrabold" style={{ color: ac, fontFamily: h }}>{stat.value}</div>
                      <div className="text-xs uppercase tracking-wider opacity-40 mt-2 font-medium" style={{ fontFamily: b }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
