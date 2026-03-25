'use client';

import { useState, useEffect, useCallback } from 'react';
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
    } else {
      setError(data.message || 'Failed to regenerate');
    }
  }

  async function handleManualSlideUpdate(field: string, value: unknown) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    newSlides[activeSlide] = { ...newSlides[activeSlide], [field]: value };
    setDeck({ ...deck, slides: newSlides });

    setSaving(true);
    await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: newSlides }),
    });
    setSaving(false);
  }

  async function handleThemeUpdate(updates: Partial<Theme>) {
    if (!deck) return;
    const newTheme = { ...deck.theme, ...updates };
    setDeck({ ...deck, theme: newTheme });

    setSaving(true);
    await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    });
    setSaving(false);
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

  async function addSlide() {
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

    setSaving(true);
    await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: newSlides }),
    });
    setSaving(false);
  }

  async function removeSlide(idx: number) {
    if (!deck || deck.slides.length <= 1) return;
    if (!confirm('Remove this slide?')) return;
    const newSlides = deck.slides.filter((_, i) => i !== idx);
    setDeck({ ...deck, slides: newSlides });
    if (activeSlide >= newSlides.length) setActiveSlide(newSlides.length - 1);

    setSaving(true);
    await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: newSlides }),
    });
    setSaving(false);
  }

  async function moveSlide(idx: number, dir: -1 | 1) {
    if (!deck) return;
    const target = idx + dir;
    if (target < 0 || target >= deck.slides.length) return;
    const newSlides = [...deck.slides];
    [newSlides[idx], newSlides[target]] = [newSlides[target], newSlides[idx]];
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(target);

    setSaving(true);
    await fetch(`/api/portal/tools/pitch-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: newSlides }),
    });
    setSaving(false);
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
            <h1 className="text-xl font-bold text-foreground">{deck.title}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{deck.slides.length} slides</span>
              <span>·</span>
              <span className={deck.status === 'published' ? 'text-green-600 dark:text-green-400' : ''}>
                {deck.status}
              </span>
              {saving && (
                <>
                  <span>·</span>
                  <span className="text-primary">Saving...</span>
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
          {deck.status === 'published' && (
            <Link
              href={`/pitch-deck/${deck.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <span className="material-icons text-base">open_in_new</span>
              View
            </Link>
          )}
          <button
            onClick={togglePublish}
            disabled={publishing || deck.slides.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
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
            {/* Preview */}
            <div
              className="rounded-xl border border-border overflow-hidden aspect-[16/9] relative"
              style={{ backgroundColor: deck.theme.backgroundColor }}
            >
              <SlidePreview slide={currentSlide} theme={deck.theme} index={activeSlide} total={deck.slides.length} />
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

function SlidePreview({ slide, theme, index, total }: { slide: Slide; theme: Theme; index: number; total: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
      style={{ color: theme.textColor }}>
      {/* Slide number */}
      <div className="absolute top-4 left-6 text-xs opacity-50" style={{ fontFamily: theme.bodyFont }}>
        {String(index + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
      </div>

      {slide.type === 'cover' ? (
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-4xl font-bold leading-tight" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
            {slide.headline || 'Untitled'}
          </h1>
          {slide.subheadline && (
            <p className="text-lg opacity-80" style={{ fontFamily: theme.bodyFont }}>
              {slide.subheadline}
            </p>
          )}
        </div>
      ) : slide.type === 'metrics' && slide.stats && slide.stats.length > 0 ? (
        <div className="space-y-6 max-w-3xl w-full">
          {slide.headline && (
            <h2 className="text-2xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
              {slide.headline}
            </h2>
          )}
          <div className="flex justify-center gap-8">
            {slide.stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-bold" style={{ color: theme.accentColor }}>{stat.value}</div>
                <div className="text-sm opacity-70 mt-1" style={{ fontFamily: theme.bodyFont }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : slide.type === 'process' && slide.steps && slide.steps.length > 0 ? (
        <div className="space-y-6 max-w-3xl w-full">
          {slide.headline && (
            <h2 className="text-2xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
              {slide.headline}
            </h2>
          )}
          <div className="grid grid-cols-3 gap-4 text-left">
            {slide.steps.map((step, i) => (
              <div key={i} className="space-y-1">
                <div className="text-xl font-bold" style={{ color: theme.accentColor }}>{String(i + 1).padStart(2, '0')}</div>
                <div className="font-semibold text-sm" style={{ fontFamily: theme.headingFont }}>{step.title}</div>
                <div className="text-xs opacity-70" style={{ fontFamily: theme.bodyFont }}>{step.description}</div>
              </div>
            ))}
          </div>
        </div>
      ) : slide.type === 'team' && slide.members && slide.members.length > 0 ? (
        <div className="space-y-6 max-w-3xl w-full">
          {slide.headline && (
            <h2 className="text-2xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
              {slide.headline}
            </h2>
          )}
          <div className="flex justify-center gap-6">
            {slide.members.map((member, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-full mx-auto mb-2 flex items-center justify-center text-2xl font-bold"
                  style={{ backgroundColor: theme.accentColor + '30', color: theme.accentColor }}>
                  {member.name.charAt(0)}
                </div>
                <div className="font-semibold text-sm" style={{ fontFamily: theme.headingFont }}>{member.name}</div>
                <div className="text-xs opacity-70" style={{ fontFamily: theme.bodyFont }}>{member.role}</div>
              </div>
            ))}
          </div>
        </div>
      ) : slide.type === 'pricing' && slide.tiers && slide.tiers.length > 0 ? (
        <div className="space-y-6 max-w-3xl w-full">
          {slide.headline && (
            <h2 className="text-2xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
              {slide.headline}
            </h2>
          )}
          <div className="flex justify-center gap-4">
            {slide.tiers.map((tier, i) => (
              <div key={i} className="p-4 rounded-lg text-left flex-1"
                style={{
                  border: `1px solid ${tier.highlighted ? theme.accentColor : theme.textColor + '20'}`,
                  backgroundColor: tier.highlighted ? theme.accentColor + '15' : 'transparent',
                }}>
                <div className="font-semibold" style={{ fontFamily: theme.headingFont }}>{tier.name}</div>
                <div className="text-2xl font-bold mt-1" style={{ color: theme.accentColor }}>{tier.price}</div>
                <ul className="mt-3 space-y-1">
                  {tier.features.map((f, j) => (
                    <li key={j} className="text-xs opacity-80" style={{ fontFamily: theme.bodyFont }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Default layout for problem, solution, features, testimonial, cta, custom
        <div className="space-y-4 max-w-2xl">
          {slide.headline && (
            <h2 className="text-2xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
              {slide.headline}
            </h2>
          )}
          {slide.subheadline && (
            <p className="text-base opacity-80" style={{ fontFamily: theme.bodyFont }}>
              {slide.subheadline}
            </p>
          )}
          {slide.body && (
            <p className="text-sm opacity-70 leading-relaxed" style={{ fontFamily: theme.bodyFont }}>
              {slide.body}
            </p>
          )}
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="text-left space-y-2 mx-auto max-w-lg">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ fontFamily: theme.bodyFont }}>
                  <span style={{ color: theme.accentColor }} className="mt-0.5">&#9670;</span>
                  <span className="opacity-80">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
